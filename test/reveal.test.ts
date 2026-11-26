import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { test } from "node:test";
import { authorizeAccount } from "../src/lib/auth/authorization";
import { newToken } from "../src/lib/auth/crypto";
import { activate, inviteParticipant } from "../src/lib/auth/invitations";
import { openDevelopmentDatabase } from "../src/lib/db/connection";
import { participantRepository } from "../src/lib/db/participants";
import { assignments, displayAccess, games, identities, participants, revealSessions, revealTurns } from "../src/lib/db/schema";
import { runDraw, configureExclusion } from "../src/lib/draw/service";
import { openEnvelope, participantStatus, saveWishes } from "../src/lib/participant/service";
import { createManagedGame, manageRegistration } from "../src/lib/registration/service";
import { changeDisplayLink, runReveal } from "../src/lib/reveal/service";
import { organizerReveal, publicReveal } from "../src/lib/reveal/snapshot";
import type { CommandInput } from "../src/lib/reveal/types";

test("E4.1 serializa sorteos, avances y enlaces y publica exclusivamente identidades confirmadas", async () => {
  const neon = process.env.E41_NEON_DEV === "1";
  const server = openDevelopmentDatabase(neon ? "development" : "test");
  const newConnection = () => openDevelopmentDatabase(neon ? "development" : "test");
  let reader = newConnection();
  const db = server.db;
  const pepper = randomBytes(32);
  const pin = String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, "0");
  const origin = newToken();
  const settings = { organizerName: "Organizador de prueba", name: "[Ficticia] Revelación", eventAt: new Date("2027-12-25T00:00:00Z"),
    budgetMin: 10000, budgetMax: 10000, pin, confirmation: pin, origin, temporary: false };
  const created: string[] = [];
  const owners: string[] = [];
  const people = participantRepository(db);

  async function fixture(guessingEnabled: boolean) {
    const host = await createManagedGame(db, pepper, { ...settings, guessingEnabled });
    assert.ok(host);
    const access = await authorizeAccount(db, host.token);
    assert.ok(access?.organizer);
    const gameId = access.gameId;
    created.push(gameId);
    owners.push(access.session.identityId);
    const names = ["Estrella", "Canela", "Acebo", "Nieve"];
    const group = await Promise.all(names.map((name) => people.add(gameId, name, "manual")));
    assert.ok(await manageRegistration(db, host.token, gameId, { kind: "close" }));
    assert.ok((await runDraw(db, host.token, gameId, "draw", 0, true)).ok);
    return { host: host.token, gameId, group };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  function cmd(fixture: Fixture, kind: CommandInput["kind"], revision: number, more: Partial<CommandInput> = {}) {
    return runReveal(reader.db, fixture.host, fixture.gameId, {
      kind, revision, confirmed: true, drawVersion: 1, turnId: null, guessId: null, ...more,
    });
  }

  try {
    if (!neon) await migrate(db, { migrationsFolder: "./drizzle" });
    const game = await fixture(true);
    const other = await fixture(false);
    const invite = await inviteParticipant(db, game.host, game.gameId, game.group[0].id);
    assert.ok(invite);
    const member = await activate(db, pepper, { invite, pin, confirmation: pin, temporary: false, origin });
    assert.ok(member);
    const start: CommandInput = { kind: "start", revision: 0, drawVersion: 1, turnId: null, guessId: null, confirmed: true };
    assert.equal((await runReveal(db, member.token, game.gameId, start)).ok, false);
    assert.equal((await runReveal(db, other.host, game.gameId, start)).ok, false);
    assert.equal((await changeDisplayLink(db, member.token, game.gameId, null, true)).ok, false);

    const links = await Promise.all([
      changeDisplayLink(db, game.host, game.gameId, null, true),
      changeDisplayLink(reader.db, game.host, game.gameId, null, true),
    ]);
    assert.equal(links.filter(({ ok }) => ok).length, 1);
    const issued = links.find((result) => result.ok && "path" in result);
    assert.ok(issued && issued.ok && "path" in issued);
    const initialToken = issued.path.split("#")[1];
    const waiting = await publicReveal(reader.db, initialToken);
    assert.ok(waiting?.state === "waiting" && waiting.revision === 0 && waiting.current === null);
    assert.equal(await publicReveal(db, member.token), null);
    assert.equal(await publicReveal(db, newToken()), null);
    const replaced = await changeDisplayLink(db, game.host, game.gameId, issued.linkId, true);
    assert.ok(replaced.ok && "path" in replaced);
    const display = replaced.path.split("#")[1];
    assert.equal(await publicReveal(reader.db, initialToken), null);
    assert.equal(await organizerReveal(db, other.host, game.gameId), null);

    // Un reparto incompleto no debe iniciar la revelación.
    const [removed] = await db.delete(assignments).where(and(eq(assignments.gameId, other.gameId),
      eq(assignments.giverId, other.group[0].id))).returning();
    try { assert.equal((await cmd(other, "start", 0)).ok, false); }
    finally { await db.insert(assignments).values(removed); }
    assert.equal((await cmd(game, "start", 0, { confirmed: false })).ok, false);
    const concurrent = await Promise.all([
      cmd(game, "start", 0),
      runDraw(db, game.host, game.gameId, "repeat", 1, true),
      runReveal(db, game.host, game.gameId, start),
    ]);
    assert.equal(concurrent.filter(({ ok }) => ok).length, 1);
    const version = concurrent[1].ok ? concurrent[1].version : 1;
    if (concurrent[1].ok) {
      const duplicate = await Promise.all([cmd(game, "start", 0, { drawVersion: version }),
        runReveal(db, game.host, game.gameId, { ...start, drawVersion: version })]);
      assert.equal(duplicate.filter(({ ok }) => ok).length, 1);
    }
    assert.equal((await runDraw(db, game.host, game.gameId, "repeat", version, true)).ok, false);
    assert.equal((await runDraw(db, game.host, game.gameId, "void", version, true)).ok, false);
    assert.equal(await manageRegistration(db, game.host, game.gameId, { kind: "add", name: "Tarde" }), null);
    assert.equal((await configureExclusion(db, game.host, game.gameId, game.group[0].id, game.group[1].id, true)).ok, false);
    assert.equal((await participantStatus(db, member.token))?.editable, false);
    const wishes = new FormData();
    for (const name of ["gift", "likes", "avoid"]) wishes.set(name, "Texto");
    assert.equal((await saveWishes(db, member.token, version, version, wishes)).ok, false);
    assert.ok((await openEnvelope(reader.db, member.token, version)).ok);

    const [event] = await db.select().from(revealSessions).where(eq(revealSessions.gameId, game.gameId));
    const order = await db.select().from(revealTurns).where(eq(revealTurns.revealSessionId, event.id)).orderBy(revealTurns.orderIndex);
    assert.deepEqual(new Set(order.map(({ recipientId }) => recipientId)), new Set(game.group.map(({ id }) => id)));
    assert.equal((await publicReveal(reader.db, display))?.current, null);
    assert.equal((await cmd(game, "finish", 1)).ok, false);
    const nextTwice = await Promise.all([cmd(game, "next", 1), cmd(game, "next", 1)]);
    assert.equal(nextTwice.filter(({ ok }) => ok).length, 1);
    assert.equal((await cmd(game, "complete", 2, { turnId: order[0].id })).ok, false);
    assert.equal((await cmd(game, "reveal", 2, { turnId: order[0].id })).ok, false);
    assert.ok((await cmd(game, "pause", 2)).ok);
    assert.equal((await cmd(game, "postpone", 3, { turnId: order[0].id })).ok, false);
    assert.equal((await publicReveal(reader.db, display))?.state, "paused");
    await reader.close();
    reader = newConnection();
    assert.equal((await organizerReveal(reader.db, game.host, game.gameId))?.current?.id, order[0].id);
    assert.ok((await cmd(game, "resume", 3)).ok);
    assert.ok((await cmd(game, "postpone", 4, { turnId: order[0].id })).ok);
    assert.equal((await publicReveal(reader.db, display))?.current, null);

    let revision = 5;
    for (const [index, turn] of order.entries()) {
      assert.ok((await cmd(game, index === 0 ? "resume-turn" : "next", revision++, { turnId: turn.id })).ok);
      const [pair] = await db.select().from(assignments).where(and(eq(assignments.drawId, event.drawId),
        eq(assignments.recipientId, turn.recipientId)));
      const giver = game.group.find(({ id }) => id === pair.giverId)?.displayName;
      const recipient = game.group.find(({ id }) => id === turn.recipientId)?.displayName;
      const before = await publicReveal(reader.db, display);
      const organizer = await organizerReveal(reader.db, game.host, game.gameId);
      assert.deepEqual(before?.current, { recipient, guessingRecorded: false, result: null });
      assert.equal(before?.history.length, index);
      assert.equal(organizer?.current?.result, null);
      assert.ok(!JSON.stringify(before).includes("guessId"));
      if (index === 0) {
        assert.ok(giver && !JSON.stringify(before).includes(giver));
        assert.equal((await cmd(game, "guess", revision, { turnId: turn.id, guessId: other.group[0].id })).ok, false);
        assert.equal((await runReveal(db, member.token, game.gameId, { ...start, kind: "reveal", revision, turnId: turn.id })).ok, false);
      }
      const guessId = index === 0 ? pair.giverId : index === 1
        ? game.group.find(({ id }) => id !== pair.giverId && id !== turn.recipientId)!.id : null;
      assert.ok((await cmd(game, "guess", revision++, { turnId: turn.id, guessId })).ok);
      assert.deepEqual((await publicReveal(reader.db, display))?.current, { recipient, guessingRecorded: true, result: null });
      assert.equal((await cmd(game, "reveal", revision, { turnId: turn.id, confirmed: false })).ok, false);
      if (index === 0) {
        const revealTwice = await Promise.all([cmd(game, "reveal", revision, { turnId: turn.id }),
          cmd(game, "reveal", revision, { turnId: turn.id })]);
        assert.equal(revealTwice.filter(({ ok }) => ok).length, 1);
        revision++;
      } else assert.ok((await cmd(game, "reveal", revision++, { turnId: turn.id })).ok);
      assert.equal((await cmd(game, "guess", revision, { turnId: turn.id, guessId: null })).ok, false);
      assert.equal((await cmd(game, "postpone", revision, { turnId: turn.id })).ok, false);
      const revealed = (await publicReveal(reader.db, display))?.current?.result;
      assert.ok(revealed?.giver === giver && revealed?.recipient === recipient);
      assert.equal(revealed?.correct, index === 0 ? true : index === 1 ? false : null);
      assert.ok((await cmd(game, "complete", revision++, { turnId: turn.id })).ok);
    }
    assert.ok((await cmd(game, "finish", revision++)).ok);
    const summary = await publicReveal(reader.db, display);
    assert.equal(summary?.state, "finished");
    assert.equal(summary?.history.length, 4);
    assert.equal(summary?.revision, revision);
    assert.equal((await cmd(game, "pause", revision)).ok, false);
    assert.equal((await cmd(game, "next", revision)).ok, false);
    assert.ok((await changeDisplayLink(db, game.host, game.gameId, replaced.linkId, false)).ok);
    assert.equal(await publicReveal(reader.db, display), null);

    assert.ok((await cmd(other, "start", 0)).ok);
    assert.ok((await cmd(other, "next", 1)).ok);
    const otherPanel = await organizerReveal(db, other.host, other.gameId);
    const turnId = otherPanel?.current?.id;
    assert.ok(turnId);
    assert.equal((await cmd(other, "guess", 2, { turnId })).ok, false);
    assert.ok((await cmd(other, "reveal", 2, { turnId })).ok);
    const expiring = await changeDisplayLink(db, other.host, other.gameId, null, true);
    assert.ok(expiring.ok && "path" in expiring);
    await db.update(displayAccess).set({ expiresAt: sql`clock_timestamp() - interval '1 second'`,
      createdAt: sql`clock_timestamp() - interval '1 minute'` })
      .where(and(eq(displayAccess.gameId, other.gameId), eq(displayAccess.id, expiring.linkId), isNull(displayAccess.revokedAt)));
    assert.equal(await publicReveal(reader.db, expiring.path.split("#")[1]), null);
  } finally {
    try {
      if (created.length) {
        const members = await db.select({ id: participants.identityId }).from(participants).where(inArray(participants.gameId, created));
        await db.delete(games).where(inArray(games.id, created));
        await db.delete(identities).where(inArray(identities.id, [...owners, ...members.flatMap(({ id }) => id ? [id] : [])]));
      }
    } finally {
      await Promise.all([server.close(), reader.close()]);
    }
  }
});
