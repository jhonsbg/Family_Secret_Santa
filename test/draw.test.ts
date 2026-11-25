import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { test } from "node:test";
import { authorizeAccount } from "../src/lib/auth/authorization";
import { newToken } from "../src/lib/auth/crypto";
import { activate, inviteParticipant } from "../src/lib/auth/invitations";
import { revokeSession } from "../src/lib/auth/sessions";
import { openDevelopmentDatabase } from "../src/lib/db/connection";
import { participantRepository } from "../src/lib/db/participants";
import { assignments, draws, games, identities, participants, revealSessions } from "../src/lib/db/schema";
import { configureExclusion, organizerDrawStatus, ownDrawStatus, readOwnAssignment, runDraw } from "../src/lib/draw/service";
import { createManagedGame, manageRegistration } from "../src/lib/registration/service";

test("E3.1 versiona el sorteo, preserva los resultados y autoriza solo la lectura propia", async () => {
  const writer = openDevelopmentDatabase("test");
  const reader = openDevelopmentDatabase("test");
  const db = writer.db;
  const peer = reader.db;
  const pepper = randomBytes(32);
  const pin = String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, "0");
  const origin = newToken();
  const settings = { name: "[Ficticia] Sorteo", eventAt: new Date("2027-12-25T00:00:00Z"),
    pin, confirmation: pin, budgetMin: 10000, budgetMax: 10000, origin, temporary: false };
  const gameIds: string[] = [];
  const adminIds: string[] = [];
  const people = participantRepository(db);

  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    const creator = await createManagedGame(db, pepper, settings);
    const second = await createManagedGame(db, pepper, { ...settings, organizerDisplayName: "Organizador participante" });
    assert.ok(creator && second);
    const owner = await authorizeAccount(peer, creator.token);
    const other = await authorizeAccount(peer, second.token);
    assert.ok(owner?.organizer && other?.organizer);
    gameIds.push(owner.gameId, other.gameId);
    adminIds.push(owner.session.identityId, other.session.identityId);
    const game = owner.gameId;
    const host = creator.token;
    assert.equal(owner.participantId, null);
    assert.ok(other.participantId);
    await people.add(other.gameId, "Otro familiar", "manual");
    const foreign = await people.add(other.gameId, "Otra familiar", "manual");
    assert.equal((await organizerDrawStatus(peer, second.token, other.gameId))?.eligible.length, 3);
    assert.equal(await organizerDrawStatus(peer, second.token, game), null);

    const a = await people.add(game, "Mismo nombre", "manual");
    const b = await people.add(game, "Mismo nombre", "manual");
    assert.notEqual(a.id, b.id);
    assert.ok(await manageRegistration(db, host, game, { kind: "close" }));
    assert.equal((await runDraw(peer, host, game, "draw", 0, true)).ok, false);
    assert.ok(await manageRegistration(db, host, game, { kind: "reopen" }));
    const c = await people.add(game, "Familiar C", "manual");
    const d = await people.add(game, "Familiar D", "manual");
    const rejected = await people.add(game, "Solicitud rechazada", "individual");
    const pending = await people.add(game, "Solicitud pendiente", "individual");
    const removed = await people.add(game, "Persona retirada", "manual");
    assert.ok(await manageRegistration(db, host, game, { kind: "reject", personId: rejected.id }));
    assert.ok(await manageRegistration(db, host, game, { kind: "withdraw", personId: removed.id }));
    const invitation = await inviteParticipant(db, host, game, a.id);
    assert.ok(invitation);
    const member = await activate(peer, pepper, { invite: invitation, pin, confirmation: pin, temporary: false, origin });
    assert.ok(member);
    assert.equal((await runDraw(peer, host, game, "draw", 0, true)).ok, false);
    assert.ok(await manageRegistration(db, host, game, { kind: "close" }));
    assert.equal((await runDraw(peer, host, game, "draw", 0, true)).ok, false);
    assert.ok(await manageRegistration(db, host, game, { kind: "reject", personId: pending.id }));
    assert.equal((await organizerDrawStatus(peer, host, game))?.eligible.length, 4);
    assert.equal((await configureExclusion(db, host, game, a.id, foreign.id, true)).ok, false);
    assert.equal((await configureExclusion(db, second.token, game, a.id, b.id, true)).ok, false);
    assert.equal((await configureExclusion(db, member.token, game, a.id, b.id, true)).ok, false);
    for (const other of [b.id, c.id, d.id]) assert.ok((await configureExclusion(db, host, game, a.id, other, true)).ok);
    assert.equal((await configureExclusion(peer, host, game, b.id, a.id, true)).ok, false);
    assert.equal((await runDraw(peer, host, game, "draw", 0, true)).ok, false);
    assert.equal((await db.select({ id: draws.id }).from(draws).where(eq(draws.gameId, game))).length, 0);
    for (const other of [c.id, d.id]) assert.ok((await configureExclusion(db, host, game, a.id, other, false)).ok);
    assert.equal((await runDraw(db, host, game, "draw", 0, false)).ok, false);
    assert.equal((await runDraw(db, member.token, game, "draw", 0, true)).ok, false);

    const concurrent = await Promise.all([runDraw(db, host, game, "draw", 0, true), runDraw(peer, host, game, "draw", 0, true)]);
    assert.equal(concurrent.filter(({ ok }) => ok).length, 1);
    const [v1] = await peer.select().from(draws).where(eq(draws.gameId, game));
    const reopen = openDevelopmentDatabase("test");
    try {
      const pairs = await reopen.db.select().from(assignments).where(eq(assignments.drawId, v1.id));
      assert.equal(pairs.length, 4);
      assert.ok(pairs.every(({ giverId, recipientId }) => giverId !== recipientId
        && !(giverId === a.id && recipientId === b.id) && !(giverId === b.id && recipientId === a.id)));
      assert.deepEqual(new Set(pairs.map(({ giverId }) => giverId)), new Set([a.id, b.id, c.id, d.id]));
      assert.equal(new Set(pairs.map(({ recipientId }) => recipientId)).size, 4);
      const own = await readOwnAssignment(reopen.db, member.token, 1);
      assert.ok(own?.recipientId === pairs.find(({ giverId }) => giverId === a.id)?.recipientId);
    } finally { await reopen.close(); }
    assert.equal(await readOwnAssignment(peer, host, 1), null);
    assert.equal(await readOwnAssignment(peer, second.token, 1), null);
    assert.equal(await readOwnAssignment(peer, newToken(), 1), null);
    assert.deepEqual(await ownDrawStatus(peer, member.token), { version: 1 });
    const panel = await organizerDrawStatus(peer, host, game);
    assert.ok(panel && !JSON.stringify(panel).includes("recipientId") && !JSON.stringify(panel).includes("giverId"));
    assert.equal((await configureExclusion(db, host, game, a.id, b.id, false)).ok, false);
    assert.equal((await runDraw(db, host, game, "draw", 0, true)).ok, false);

    // This CHECK only rejects new assignment rows for the disposable fixture.
    const constraint = sql.identifier("draw_failure_e31_" + game.replaceAll("-", ""));
    await db.execute(sql`alter table assignments add constraint ${constraint} check (game_id <> ${sql.raw("'" + game + "'")}::uuid) not valid`);
    try {
      assert.deepEqual(await runDraw(db, host, game, "repeat", 1, true), {
        ok: false, message: "No se pudo guardar el sorteo. Actualiza el panel antes de reintentar.",
      });
      assert.equal((await organizerDrawStatus(peer, host, game))?.currentVersion, 1);
      assert.equal((await peer.select({ id: draws.id }).from(draws).where(eq(draws.gameId, game))).length, 1);
    } finally { await db.execute(sql`alter table assignments drop constraint ${constraint}`); }

    const repeat = await Promise.all([runDraw(db, host, game, "repeat", 1, true), runDraw(peer, host, game, "repeat", 1, true)]);
    assert.equal(repeat.filter(({ ok }) => ok).length, 1);
    assert.equal(await readOwnAssignment(peer, member.token, 1), null);
    assert.ok(await readOwnAssignment(peer, member.token, 2));
    assert.equal((await runDraw(db, host, game, "void", 2, true)).ok, true);
    assert.equal(await ownDrawStatus(peer, member.token), null);
    assert.equal(await readOwnAssignment(peer, member.token, 2), null);
    assert.ok((await configureExclusion(db, host, game, a.id, b.id, false)).ok);
    assert.equal((await runDraw(db, host, game, "draw", 2, true)).ok, true);
    assert.equal((await peer.select({ id: assignments.drawId }).from(assignments).where(eq(assignments.gameId, game))).length, 12);
    await revokeSession(db, member.token);
    assert.equal(await readOwnAssignment(peer, member.token, 3), null);

    const [current] = await db.select().from(draws).where(and(eq(draws.gameId, game), isNull(draws.invalidatedAt)));
    await db.insert(revealSessions).values({ gameId: game, drawId: current.id });
    assert.equal((await runDraw(db, host, game, "repeat", 3, true)).ok, false);
    assert.equal((await runDraw(peer, host, game, "void", 3, true)).ok, false);
    assert.equal((await organizerDrawStatus(peer, host, game))?.blocked, true);
  } finally {
    try {
      if (gameIds.length) {
        const members = await db.select({ identityId: participants.identityId }).from(participants).where(inArray(participants.gameId, gameIds));
        await db.delete(games).where(inArray(games.id, gameIds));
        await db.delete(identities).where(inArray(identities.id, [...new Set([...adminIds, ...members.flatMap(({ identityId }) => identityId ? [identityId] : [])])]));
      }
    } finally {
      await Promise.all([writer.close(), reader.close()]);
    }
  }
});
