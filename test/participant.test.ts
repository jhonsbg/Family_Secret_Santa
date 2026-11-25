import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { test } from "node:test";
import { authorizeAccount } from "../src/lib/auth/authorization";
import { newToken, tokenDigest } from "../src/lib/auth/crypto";
import { activate, inviteParticipant } from "../src/lib/auth/invitations";
import { createSession, revokeSession } from "../src/lib/auth/sessions";
import { openDevelopmentDatabase } from "../src/lib/db/connection";
import { participantRepository } from "../src/lib/db/participants";
import { assignments, draws, envelopeViews, games, identities, participants, revealSessions, sessions } from "../src/lib/db/schema";
import { configureExclusion, runDraw } from "../src/lib/draw/service";
import { assignedWishes, openEnvelope, participantHome, participantStatus, saveWishes } from "../src/lib/participant/service";
import { createManagedGame, manageRegistration } from "../src/lib/registration/service";

function makeWishes(gift: string, likes = "", avoid = "") {
  const form = new FormData();
  form.set("gift", gift);
  form.set("likes", likes);
  form.set("avoid", avoid);
  return form;
}

test("E3.2 protege la apertura y los deseos por sesión y versión de sorteo", async () => {
  const neon = process.env.E32_NEON_DEV === "1";
  const connection = openDevelopmentDatabase(neon ? "development" : "test");
  const reader = openDevelopmentDatabase(neon ? "development" : "test");
  const { db } = connection;
  const peer = reader.db;
  const pepper = randomBytes(32);
  const pin = String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, "0");
  const origin = newToken();
  const config = {
    name: "[Ficticia] E3.2", eventAt: new Date("2027-12-25T00:00:00Z"),
    pin, confirmation: pin, budgetMin: 10000, budgetMax: 10000, origin, temporary: false, wishesEnabled: true,
  };
  const gameIds: string[] = [];
  const owners: string[] = [];
  try {
    if (!neon) await migrate(db, { migrationsFolder: "./drizzle" });
    const host = await createManagedGame(db, pepper, config);
    assert.ok(host);
    const owner = await authorizeAccount(db, host.token);
    assert.ok(owner?.organizer);
    const gameId = owner.gameId;
    gameIds.push(gameId);
    owners.push(owner.session.identityId);
    const foreign = await createManagedGame(db, pepper, { ...config, organizerDisplayName: "Otra administradora", wishesEnabled: false });
    assert.ok(foreign);
    const other = await authorizeAccount(db, foreign.token);
    assert.ok(other?.participantId);
    gameIds.push(other.gameId);
    owners.push(other.session.identityId);

    const repo = participantRepository(db);
    const people = await Promise.all(["Andrea ficticia", "Beatriz ficticia", "Carolina ficticia", "Familiar sin activar"]
      .map((name) => repo.add(gameId, name, "manual")));
    const members = [];
    for (const person of people.slice(0, 3)) {
      const invite = await inviteParticipant(db, host.token, gameId, person.id);
      assert.ok(invite);
      const account = await activate(peer, pepper, { invite, pin, confirmation: pin, temporary: false, origin });
      assert.ok(account);
      members.push(account);
    }
    const a = members[0].token;
    const noSession = newToken();
    const notAllowed = { ok: false, reason: "denied" };
    const stale = { ok: false, reason: "stale" };
    for (const token of [host.token, noSession]) {
      assert.equal(await participantStatus(peer, token), null);
      assert.deepEqual(await openEnvelope(peer, token, 1), notAllowed);
      assert.deepEqual(await assignedWishes(peer, token, 1), notAllowed);
      assert.deepEqual(await saveWishes(peer, token, 0, null, makeWishes("Privado")), notAllowed);
    }
    assert.deepEqual(await openEnvelope(peer, foreign.token, 1), stale);
    assert.deepEqual(await saveWishes(peer, foreign.token, 0, null, makeWishes("Deshabilitado")), notAllowed);
    assert.equal((await participantStatus(peer, foreign.token))?.wishesEnabled, false);
    assert.equal((await participantStatus(peer, a))?.version, null);
    assert.deepEqual(await openEnvelope(peer, a, 1), stale);
    const [before] = await db.select({ idle: sessions.idleExpiresAt }).from(sessions).where(eq(sessions.tokenHash, tokenDigest("session", a)));
    await participantStatus(peer, a);
    const [after] = await db.select({ idle: sessions.idleExpiresAt }).from(sessions).where(eq(sessions.tokenHash, tokenDigest("session", a)));
    assert.deepEqual(after, before);

    assert.equal((await saveWishes(db, a, 0, null, makeWishes("  Libro\nTé  "))).ok, true);
    assert.deepEqual(await saveWishes(db, a, 0, null, makeWishes("x".repeat(251))), { ok: false, reason: "invalid" });
    assert.deepEqual(await saveWishes(db, a, 0, null, makeWishes("x\0y")), { ok: false, reason: "invalid" });
    const own = await participantHome(peer, a);
    assert.ok(own.ok);
    assert.equal(own.wishes.gift, "Libro\nTé");
    assert.ok((await configureExclusion(db, host.token, gameId, people[0].id, people[3].id, true)).ok);
    assert.ok(await manageRegistration(db, host.token, gameId, { kind: "close" }));
    assert.ok((await runDraw(db, host.token, gameId, "draw", 0, true)).ok);
    const [first] = await db.select().from(draws).where(eq(draws.gameId, gameId));
    const pairs = await db.select().from(assignments).where(eq(assignments.drawId, first.id));
    assert.ok(pairs.some(({ giverId }) => giverId === people[3].id));
    const recipientId = pairs.find(({ giverId }) => giverId === people[0].id)?.recipientId;
    const recipient = people.find(({ id }) => id === recipientId);
    assert.ok(recipient);
    const recipientAccount = members[people.indexOf(recipient)];
    const fresh = await participantHome(peer, a);
    assert.ok(fresh.ok && !fresh.status.opened);
    assert.ok(!JSON.stringify(fresh).includes(recipient.displayName));
    assert.deepEqual(await assignedWishes(peer, a, 1), notAllowed);
    assert.deepEqual(await openEnvelope(peer, a, { version: 1, giver: people[1].id }), stale);
    assert.deepEqual(await saveWishes(peer, a, 0, null, makeWishes("Edición vieja")), stale);

    const views = await Promise.all([openEnvelope(db, a, 1), openEnvelope(peer, a, 1)]);
    assert.ok(views.every((view) => view.ok && view.name === recipient.displayName));
    assert.equal(views.filter((view) => view.ok && view.first).length, 1);
    assert.equal((await peer.select().from(envelopeViews).where(eq(envelopeViews.drawId, first.id))).length, 1);
    assert.deepEqual(await assignedWishes(peer, a, 1), { ok: true, version: 1, wishes: { gift: "", likes: "", avoid: "" } });
    assert.ok(recipientAccount);
    assert.ok((await saveWishes(db, recipientAccount.token, 1, 1, makeWishes("Taza verde"))).ok);
    const found = await assignedWishes(peer, a, 1);
    assert.ok(found.ok);
    assert.equal(found.wishes.gift, "Taza verde");
    const access = await authorizeAccount(db, a);
    assert.ok(access);
    const nextSession = await db.transaction((tx) => createSession(tx, access.session.identityId, gameId, true));
    const oldView = (await participantStatus(peer, a))?.sessionView;
    assert.ok(oldView);
    assert.deepEqual(await saveWishes(peer, nextSession.token, 1, 1, makeWishes("Pestaña de otra sesión"), oldView), notAllowed);
    assert.deepEqual(await openEnvelope(peer, nextSession.token, 1, oldView), notAllowed);
    assert.deepEqual(await assignedWishes(peer, nextSession.token, 1, oldView), notAllowed);
    const returned = await openEnvelope(peer, nextSession.token, 1);
    assert.ok(returned.ok && !returned.first && returned.name === recipient.displayName);
    assert.ok((await participantStatus(peer, nextSession.token))?.opened);
    assert.notEqual((await participantStatus(peer, nextSession.token))?.sessionView, (await participantStatus(peer, a))?.sessionView);
    const savedAgain = await participantHome(peer, nextSession.token);
    assert.ok(savedAgain.ok && savedAgain.wishes.gift === "Libro\nTé");
    await revokeSession(db, a);
    assert.deepEqual(await openEnvelope(peer, a, 1), notAllowed);

    const [repeat] = await Promise.all([
      runDraw(db, host.token, gameId, "repeat", 1, true),
      openEnvelope(peer, nextSession.token, 1),
    ]);
    assert.ok(repeat.ok);
    assert.deepEqual(await openEnvelope(db, nextSession.token, 1), stale);
    assert.deepEqual(await assignedWishes(peer, nextSession.token, 1), stale);
    assert.equal((await participantStatus(peer, nextSession.token))?.opened, false);
    assert.deepEqual(await assignedWishes(peer, nextSession.token, 2), notAllowed);
    const newOpen = await openEnvelope(peer, nextSession.token, 2);
    assert.ok(newOpen.ok && newOpen.first);
    assert.ok((await runDraw(db, host.token, gameId, "void", 2, true)).ok);
    const annulled = await participantStatus(peer, nextSession.token);
    assert.ok(annulled?.revision === 2 && annulled.version === null);
    assert.deepEqual(await openEnvelope(peer, nextSession.token, 2), stale);
    assert.ok((await runDraw(db, host.token, gameId, "draw", 2, true)).ok);
    const [third] = await db.select().from(draws).where(and(eq(draws.gameId, gameId), eq(draws.version, 3)));
    await db.insert(revealSessions).values({ gameId, drawId: third.id });
    assert.equal((await participantStatus(peer, nextSession.token))?.editable, false);
    assert.deepEqual(await saveWishes(peer, nextSession.token, 3, 3, makeWishes("Fuera de plazo")), notAllowed);
    assert.ok((await openEnvelope(peer, nextSession.token, 3)).ok);
  } finally {
    try {
      if (gameIds.length) {
        const members = await db.select({ identity: participants.identityId }).from(participants).where(inArray(participants.gameId, gameIds));
        await db.delete(games).where(inArray(games.id, gameIds));
        await db.delete(identities).where(inArray(identities.id, [...owners, ...members.flatMap(({ identity }) => identity ? [identity] : [])]));
      }
    } finally {
      await Promise.all([connection.close(), reader.close()]);
    }
  }
});
