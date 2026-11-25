import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { test } from "node:test";
import { authorizeAccount, authorizeOrganizer } from "../src/lib/auth/authorization";
import { changePin, login } from "../src/lib/auth/credentials";
import { newRecoveryCode, newToken, recoveryCodeDigest, tokenDigest } from "../src/lib/auth/crypto";
import { activate, inviteParticipant } from "../src/lib/auth/invitations";
import { issueAssistedRecovery, recoverAccess, replaceRecoveryCode } from "../src/lib/auth/recovery";
import { cleanAuthHistory, retentionPolicy } from "../src/lib/auth/retention";
import { openDevelopmentDatabase } from "../src/lib/db/connection";
import { authAttempts, games, identities, invites, participants, pinCredentials, recoveryEvents } from "../src/lib/db/schema";
import { createManagedGame, manageRegistration, organizerPanel } from "../src/lib/registration/service";

test("E2.4 recupera cuentas y conserva el alcance de sesión en PostgreSQL", async (t) => {
  const writer = openDevelopmentDatabase("test");
  const reader = openDevelopmentDatabase("test");
  const db = writer.db;
  const peer = reader.db;
  const pepper = randomBytes(32);
  const origin = newToken();
  const pin = String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, "0");
  const updatedPin = pin === "000000" ? "000001" : "000000";
  const setting = { name: "[Ficticia] Recuperación E2.4", eventAt: new Date("2027-12-25T00:00:00Z"),
    pin, confirmation: pin, budgetMin: 10000, budgetMax: 10000, origin, temporary: false };
  const gameIds: string[] = [];
  const adminIds: string[] = [];
  const recovery = (secret: string, assisted = false, suffix = "-redeem") => ({
    secret, assisted, pin: updatedPin, confirmation: updatedPin, temporary: true, origin: origin + suffix,
  });
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    const created = await createManagedGame(db, pepper, setting);
    assert.ok(created);
    const owner = await authorizeAccount(peer, created.token);
    assert.ok(owner?.organizer);
    gameIds.push(owner.gameId);
    adminIds.push(owner.session.identityId);

    const other = await createManagedGame(db, pepper, setting);
    assert.ok(other);
    const otherAccount = await authorizeAccount(peer, other.token);
    assert.ok(otherAccount?.organizer);
    gameIds.push(otherAccount.gameId);
    adminIds.push(otherAccount.session.identityId);

    assert.ok(await manageRegistration(db, created.token, owner.gameId, { kind: "add", name: "Luna ficticia" }));
    const member = (await organizerPanel(peer, created.token, owner.gameId))?.people[0];
    assert.ok(member);
    const invitation = await inviteParticipant(db, created.token, owner.gameId, member.id);
    assert.ok(invitation);
    const original = await activate(peer, pepper, { invite: invitation, pin, confirmation: pin, origin, temporary: false });
    assert.ok(original);
    const account = await authorizeAccount(peer, original.token);
    assert.ok(account?.participantId);

    const issue = (token: string, gameId = owner.gameId, verified = true) =>
      issueAssistedRecovery(db, pepper, token, { gameId, participantId: member.id, verified, origin });

    await t.test("el código solo se guarda como hash y la reemisión exige el PIN vigente", async () => {
      const [stored] = await db.select({ digest: pinCredentials.recoveryHash }).from(pinCredentials)
        .where(eq(pinCredentials.identityId, account.session.identityId));
      assert.ok(stored.digest === recoveryCodeDigest(original.recoveryCode));
      assert.equal(Boolean(await replaceRecoveryCode(db, pepper, original.token, updatedPin, origin)), false);
    });

    let ownerNew: NonNullable<Awaited<ReturnType<typeof recoverAccess>>>;

    await t.test("el único administrador se recupera y solo una solicitud concurrente gana", async () => {
      const attempts = await Promise.all([
        recoverAccess(db, pepper, recovery(created.recoveryCode)),
        recoverAccess(peer, pepper, recovery(created.recoveryCode, false, "-race")),
      ]);
      assert.equal(attempts.filter(Boolean).length, 1);
      const active = attempts.find(Boolean);
      assert.ok(active);
      ownerNew = active;
      const restored = await authorizeOrganizer(peer, active.token, owner.gameId);
      assert.ok(restored?.session.temporary);
      assert.equal(await authorizeAccount(db, created.token), null);
      assert.equal(Boolean(await recoverAccess(peer, pepper, recovery(created.recoveryCode))), false);
      assert.equal(Boolean(await login(db, pepper, { link: created.loginToken, pin: updatedPin, temporary: false, origin })), false);
      assert.equal(Boolean(await login(peer, pepper, { link: active.loginToken, pin, temporary: false, origin })), false);
      assert.ok(await login(peer, pepper, { link: active.loginToken, pin: updatedPin, temporary: false, origin }));
    });

    await t.test("el código de otro usuario y la emisión fuera de su partida se rechazan", async () => {
      assert.equal(Boolean(await recoverAccess(db, pepper, {
        ...recovery(original.recoveryCode), signedInIdentityId: otherAccount.session.identityId,
      })), false);
      assert.equal(Boolean(await issue(original.token)), false);
      assert.equal(Boolean(await issue(other.token)), false);
      assert.equal(Boolean(await issue(other.token, otherAccount.gameId)), false);
      assert.equal(Boolean(await issue(ownerNew.token, owner.gameId, false)), false);
    });

    await t.test("el límite transversal bloquea intentos repetidos en instancias distintas", async () => {
      const wrong = await Promise.all(Array.from({ length: 8 }, (_, i) =>
        recoverAccess(i % 2 ? db : peer, pepper, recovery(newRecoveryCode().code, false, "-limited"))));
      assert.ok(wrong.every((value) => value === null));
      assert.equal(Boolean(await recoverAccess(db, pepper, recovery(other.recoveryCode, false, "-limited"))), false);
      assert.ok(await recoverAccess(peer, pepper, recovery(other.recoveryCode, false, "-another-origin")));
    });

    await t.test("la recuperación asistida vence, se reemplaza y revoca todos los accesos previos", async () => {
      const expired = await issue(ownerNew.token);
      assert.ok(expired);
      await db.update(invites).set({ createdAt: new Date(Date.now() - 120_000), expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(invites.tokenHash, tokenDigest("recovery-invite", expired)));
      assert.equal(Boolean(await recoverAccess(peer, pepper, recovery(expired, true))), false);
      const replaced = await issue(ownerNew.token);
      const live = await issue(ownerNew.token);
      assert.ok(replaced && live);
      assert.equal(Boolean(await recoverAccess(peer, pepper, recovery(replaced, true))), false);
      const contenders = await Promise.all([
        recoverAccess(db, pepper, recovery(live, true, "-assist-a")),
        recoverAccess(peer, pepper, recovery(original.recoveryCode, false, "-assist-b")),
      ]);
      assert.equal(contenders.filter(Boolean).length, 1);
      assert.equal(await authorizeAccount(db, original.token), null);
      assert.equal(Boolean(await recoverAccess(db, pepper, recovery(live, true))), false);
      assert.equal(Boolean(await recoverAccess(peer, pepper, recovery(original.recoveryCode))), false);
      const restored = contenders.find(Boolean);
      assert.ok(restored);
      const refreshed = await replaceRecoveryCode(peer, pepper, restored.token, updatedPin, origin + "-rotate");
      assert.ok(refreshed);
      assert.equal(Boolean(await recoverAccess(db, pepper, recovery(restored.recoveryCode))), false);
      const latest = await recoverAccess(peer, pepper, recovery(refreshed, false, "-latest"));
      assert.ok(latest && await authorizeAccount(db, latest.token));
      const assisted = await issue(ownerNew.token);
      assert.ok(assisted);
      const assistedAccount = await recoverAccess(peer, pepper, recovery(assisted, true, "-explicit-assisted"));
      assert.ok(assistedAccount && await authorizeAccount(db, assistedAccount.token));
      assert.equal(await authorizeAccount(db, latest.token), null);
    });

    await t.test("cambiar el PIN personal revoca cualquier enlace asistido sin desactivar el código", async () => {
      assert.ok(await manageRegistration(db, ownerNew.token, owner.gameId, { kind: "add", name: "Otro familiar ficticio" }));
      const secondMember = (await organizerPanel(peer, ownerNew.token, owner.gameId))?.people.find(({ id }) => id !== member.id);
      assert.ok(secondMember);
      const newInvite = await inviteParticipant(db, ownerNew.token, owner.gameId, secondMember.id);
      assert.ok(newInvite);
      const profile = await activate(peer, pepper, { invite: newInvite, pin, confirmation: pin, origin, temporary: false });
      assert.ok(profile);
      const held = await issueAssistedRecovery(db, pepper, ownerNew.token, {
        gameId: owner.gameId, participantId: secondMember.id, verified: true, origin,
      });
      assert.ok(held);
      assert.ok(await changePin(peer, pepper, profile.token, { current: pin, pin: updatedPin, confirmation: updatedPin, origin }));
      assert.equal(Boolean(await recoverAccess(db, pepper, recovery(held, true))), false);
      assert.ok(await recoverAccess(peer, pepper, recovery(profile.recoveryCode, false, "-separate")));
    });

    await t.test("la retención elimina solo contadores y eventos fuera del plazo", async () => {
      const scope = newToken();
      const [event] = await db.insert(recoveryEvents).values({
        gameId: owner.gameId, kind: "personal_redeemed", createdAt: new Date(Date.now() - 91 * 86_400_000),
      }).returning({ id: recoveryEvents.id });
      await db.insert(authAttempts).values({ key: scope, count: 1, windowExpiresAt: new Date(Date.now() - 8 * 86_400_000) });
      assert.throws(() => retentionPolicy({ AUTH_ATTEMPTS_RETENTION_DAYS: "0" }));
      const policy = retentionPolicy({});
      const preview = await cleanAuthHistory(db, policy);
      assert.ok(preview.attempts >= 1 && preview.events >= 1);
      await cleanAuthHistory(db, policy, true);
      assert.equal((await db.select().from(recoveryEvents).where(eq(recoveryEvents.id, event.id))).length, 0);
      assert.equal((await db.select().from(authAttempts).where(eq(authAttempts.key, scope))).length, 0);
      const audit = await db.select().from(recoveryEvents).where(eq(recoveryEvents.gameId, owner.gameId));
      assert.ok(audit.some(({ kind, actorIdentityId }) => kind === "assisted_issued" && actorIdentityId === owner.session.identityId));
      assert.ok(audit.some(({ kind }) => kind === "code_replaced"));
      assert.ok(audit.some(({ kind }) => kind === "assisted_redeemed"));
    });
  } finally {
    try {
      if (gameIds.length) {
        const members = await db.select({ id: participants.identityId }).from(participants).where(inArray(participants.gameId, gameIds));
        await db.delete(games).where(inArray(games.id, gameIds));
        await db.delete(identities).where(inArray(identities.id, [...new Set([...adminIds, ...members.flatMap(({ id }) => id ? [id] : [])])]));
      }
    } finally {
      await Promise.all([writer.close(), reader.close()]);
    }
  }
});
