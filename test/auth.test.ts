import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { activate, inviteParticipant, issueControlledInvitation } from "../src/lib/auth/invitations";
import { authorizeGame, authorizeOrganizer, authorizeOwnParticipant, listGameMemberships } from "../src/lib/auth/authorization";
import { changePin, login } from "../src/lib/auth/credentials";
import { keyedDigest, newToken, tokenDigest } from "../src/lib/auth/crypto";
import { authenticatedSession, revokeSession } from "../src/lib/auth/sessions";
import { openDevelopmentDatabase } from "../src/lib/db/connection";
import { gameRepository } from "../src/lib/db/games";
import { participantRepository } from "../src/lib/db/participants";
import { authAttempts, games, identities, invites, participants, pinCredentials, sessions } from "../src/lib/db/schema";

test("E2.2: activación, credenciales, sesiones y alcance por partida", async (t) => {
  const connection = openDevelopmentDatabase("test");
  const secondConnection = openDevelopmentDatabase("test");
  const { db } = connection;
  const pepper = randomBytes(32);
  const fixturePin = String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, "0");
  const otherPin = fixturePin === "000000" ? "000001" : "000000";
  const scope = newToken();
  const gameIds: string[] = [];
  const adminIds: string[] = [];
  const repo = gameRepository(db);
  const people = participantRepository(db);
  const settings = { name: "[Ficticia] Autenticación", eventAt: new Date("2027-12-25T00:00:00Z"), budgetMin: 1000, budgetMax: 2000 };
  const activation = (invite: string, suffix: string, temporary = false) => ({
    invite, pin: fixturePin, confirmation: fixturePin, temporary, origin: scope + suffix,
  });
  const credentials = (link: string, suffix: string, pin = fixturePin, temporary = false) => ({
    link, pin, origin: scope + suffix, temporary,
  });

  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    const first = await repo.create({ ...settings, organizerDisplayName: "Organizador ficticio" });
    gameIds.push(first.id);
    adminIds.push(first.adminIdentityId);
    const second = await repo.create(settings);
    gameIds.push(second.id);
    adminIds.push(second.adminIdentityId);
    const [organizer] = await people.list(first.id);
    const person = await people.add(first.id, "Participante ficticio", "manual");
    const other = await people.add(second.id, "En otra partida", "manual");
    const open = (participantId: string, game = first) => issueControlledInvitation(db, game.id, participantId, game.adminIdentityId);
    const expired = await open(other.id, second);
    assert.ok(expired);
    await db.update(invites).set({ createdAt: new Date(Date.now() - 120_000), expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(invites.tokenHash, tokenDigest("invite", expired)));
    const organizerInvite = await open(organizer.id);
    const personInvite = await open(person.id);
    assert.ok(organizerInvite && personInvite);

    await t.test("rechaza invitación vencida, UUID y confirmación incorrecta", async () => {
      assert.equal(Boolean(await activate(db, pepper, activation(expired, "-expired"))), false);
      assert.equal(Boolean(await activate(db, pepper, activation(person.id, "-uuid"))), false);
      assert.equal(Boolean(await activate(db, pepper, { ...activation(personInvite, "-confirmation"), confirmation: otherPin })), false);
      const withLineBreak = fixturePin + String.fromCharCode(10);
      assert.equal(Boolean(await activate(db, pepper, { ...activation(personInvite, "-newline"), pin: withLineBreak, confirmation: withLineBreak })), false);
    });

    const candidates = await Promise.all([
      activate(db, pepper, activation(personInvite, "-race-a")),
      activate(secondConnection.db, pepper, activation(personInvite, "-race-b")),
    ]);
    const personal = candidates.find(Boolean);
    assert.ok(personal);
    await t.test("una activación concurrente gana y el token queda consumido", async () => {
      assert.equal(candidates.filter(Boolean).length, 1);
      assert.equal(Boolean(await activate(db, pepper, activation(personInvite, "-replay"))), false);
      assert.equal(Boolean(await open(person.id)), false);
      const record = (await db.select().from(pinCredentials).where(eq(pinCredentials.loginHash, tokenDigest("login", personal.loginToken))))[0];
      assert.ok(record?.pinHash.startsWith("$argon2id$"));
      assert.ok(record?.loginHash !== personal.loginToken);
    });

    const admin = await activate(db, pepper, activation(organizerInvite, "-admin"));
    assert.ok(admin);
    await t.test("permiso propio, rol derivado y aislamiento entre partidas", async () => {
      assert.equal(await authorizeGame(db, ""), null);
      assert.equal(await authorizeGame(db, newToken()), null);
      assert.equal(await authorizeGame(db, personal.token, second.id), null);
      assert.equal(await authorizeOrganizer(db, personal.token, first.id), null);
      assert.equal(await authorizeOrganizer(db, admin.token, second.id), null);
      assert.equal(await authorizeOwnParticipant(db, personal.token, first.id, organizer.id), null);
      assert.equal(await authorizeOwnParticipant(db, admin.token, first.id, person.id), null);
      assert.ok(await authorizeOwnParticipant(db, personal.token, first.id, person.id));
      assert.ok(await authorizeOrganizer(db, admin.token, first.id));
      assert.deepEqual((await listGameMemberships(db, personal.token)).map(({ gameId, organizer }) => ({ gameId, organizer })),
        [{ gameId: first.id, organizer: false }]);
      assert.equal(await inviteParticipant(db, personal.token, first.id, person.id), null);
      assert.equal(await inviteParticipant(db, admin.token, second.id, other.id), null);
      // A row with a valid hash and foreign game still has no authority.
      const forged = newToken();
      await db.insert(sessions).values({
        identityId: first.adminIdentityId, gameId: second.id, tokenHash: tokenDigest("session", forged),
        expiresAt: new Date(Date.now() + 100_000), idleExpiresAt: new Date(Date.now() + 50_000),
      });
      assert.equal(await authenticatedSession(db, forged), null);
    });

    await t.test("PIN incorrecto, límites por identidad y origen bajo concurrencia", async () => {
      assert.equal(Boolean(await login(db, pepper, credentials(personal.loginToken, "-bad-pin", otherPin))), false);
      const blocked = await Promise.all(Array.from({ length: 8 }, (_, index) =>
        login(index % 2 ? db : secondConnection.db, pepper, credentials(admin.loginToken, `-admin-${index}`, otherPin))));
      assert.ok(blocked.every((result) => result === null));
      assert.equal(Boolean(await login(db, pepper, credentials(admin.loginToken, "-valid-after-block"))), false);
      const [identityLimit] = await db.select({ count: authAttempts.count }).from(authAttempts)
        .where(eq(authAttempts.key, keyedDigest(pepper, "pin-identity", first.adminIdentityId).toString("hex")));
      assert.equal(identityLimit.count, 5);
      await Promise.all(Array.from({ length: 20 }, () => login(db, pepper, credentials(newToken(), "-source-block", otherPin))));
      assert.equal(Boolean(await login(db, pepper, credentials(personal.loginToken, "-source-block"))), false);
    });

    await t.test("sesión temporal, caducidad y revocación persistente", async () => {
      const borrowed = await login(db, pepper, credentials(personal.loginToken, "-borrowed", fixturePin, true));
      assert.ok(borrowed);
      assert.equal((await authenticatedSession(db, borrowed.token))?.temporary, true);
      assert.ok(borrowed.expiresAt.getTime() - Date.now() <= 30 * 60_000);
      await revokeSession(db, borrowed.token);
      assert.equal(await authenticatedSession(secondConnection.db, borrowed.token), null);
      const regular = await login(db, pepper, credentials(personal.loginToken, "-idle"));
      assert.ok(regular);
      await db.update(sessions).set({ createdAt: new Date(Date.now() - 120_000), idleExpiresAt: new Date(Date.now() - 60_000) })
        .where(eq(sessions.tokenHash, tokenDigest("session", regular.token)));
      assert.equal(await authenticatedSession(db, regular.token), null);
      await db.update(sessions).set({ expiresAt: new Date(Date.now() - 45_000) })
        .where(and(eq(sessions.tokenHash, tokenDigest("session", regular.token)), eq(sessions.temporary, false)));
      assert.equal(await authenticatedSession(db, regular.token), null);
    });

    await t.test("el cambio de PIN revoca sesiones y rechaza la credencial anterior", async () => {
      const active = await login(db, pepper, credentials(personal.loginToken, "-before-change"));
      assert.ok(active);
      const changed = await changePin(db, pepper, personal.token, {
        current: fixturePin, pin: otherPin, confirmation: otherPin, origin: scope + "-change",
      });
      assert.ok(changed);
      assert.equal(await authenticatedSession(secondConnection.db, active.token), null);
      assert.equal(await authenticatedSession(db, personal.token), null);
      // The prior test consumed four reservations plus the PIN change. A new window is simulated locally.
      const [member] = await db.select({ identityId: participants.identityId }).from(participants).where(eq(participants.id, person.id));
      assert.ok(member.identityId);
      await db.delete(authAttempts).where(eq(authAttempts.key, keyedDigest(pepper, "pin-identity", member.identityId).toString("hex")));
      assert.equal(Boolean(await login(db, pepper, credentials(personal.loginToken, "-old-pin"))), false);
      assert.ok(await login(db, pepper, credentials(personal.loginToken, "-new-pin", otherPin)));
    });
  } finally {
    try {
      if (gameIds.length) {
        const members = await db.select({ identityId: participants.identityId }).from(participants).where(inArray(participants.gameId, gameIds));
        await db.delete(games).where(inArray(games.id, gameIds));
        const identitiesCreated = [...new Set([...adminIds, ...members.flatMap(({ identityId }) => identityId ? [identityId] : [])])];
        if (identitiesCreated.length) await db.delete(identities).where(inArray(identities.id, identitiesCreated));
      }
    } finally {
      await Promise.all([connection.close(), secondConnection.close()]);
    }
  }
});
