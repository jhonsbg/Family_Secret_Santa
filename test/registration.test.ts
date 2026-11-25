import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { eq, inArray, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { authorizeAccount, authorizeGame, authorizeOrganizer } from "../src/lib/auth/authorization";
import { login } from "../src/lib/auth/credentials";
import { newToken, tokenDigest } from "../src/lib/auth/crypto";
import { activate, inviteParticipant } from "../src/lib/auth/invitations";
import { revokeSession } from "../src/lib/auth/sessions";
import { connectDatabase, developmentConnectionConfig, openDevelopmentDatabase } from "../src/lib/db/connection";
import { games, identities, invites, participants } from "../src/lib/db/schema";
import { createManagedGame, manageRegistration, organizerPanel, publicInvitation, requestRegistration } from "../src/lib/registration/service";

test("E2.3 guarda partidas, inscripciones y permisos en PostgreSQL", async () => {
  const first = openDevelopmentDatabase("test");
  const second = openDevelopmentDatabase("test");
  const { db } = first;
  const peer = second.db;
  const pepper = randomBytes(32);
  const origin = newToken();
  const pin = String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, "0");
  const fixture = { name: "[Ficticia] E2.3", eventAt: new Date("2027-12-25T00:00:00Z"),
    budgetMin: 25000, budgetMax: 25000, pin, confirmation: pin, temporary: false, origin };
  const gameIds: string[] = [];
  const adminIds: string[] = [];
  const redeem = (invite: string) => activate(peer, pepper, { invite, pin, confirmation: pin, temporary: true, origin });
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    const created = await createManagedGame(db, pepper, fixture);
    assert.ok(created);
    const owner = await authorizeAccount(peer, created.token);
    assert.ok(owner?.organizer);
    gameIds.push(owner.gameId);
    adminIds.push(owner.session.identityId);
    assert.equal(owner.participantId, null);
    const signed = await login(peer, pepper, { link: created.loginToken, pin, temporary: false, origin });
    assert.ok(signed && await authorizeOrganizer(peer, signed.token, owner.gameId));

    const other = await createManagedGame(db, pepper, { ...fixture, organizerDisplayName: "Organizador que participa" });
    assert.ok(other);
    const otherOwner = await authorizeAccount(peer, other.token);
    assert.ok(otherOwner?.organizer && otherOwner.participantId);
    gameIds.push(otherOwner.gameId);
    adminIds.push(otherOwner.session.identityId);

    assert.equal(Boolean(await manageRegistration(peer, other.token, owner.gameId, { kind: "close" })), false);
    const general = await manageRegistration(db, created.token, owner.gameId, { kind: "general" });
    assert.ok(general?.shareToken);
    const token = general.shareToken;
    assert.deepEqual(await publicInvitation(peer, token), {
      name: fixture.name, date: fixture.eventAt.toISOString(), timezone: "America/Bogota",
      budgetMin: 25000, budgetMax: 25000, open: true,
    });

    const repeated = await Promise.all([
      requestRegistration(db, pepper, token, "María Clara", origin),
      requestRegistration(peer, pepper, token, "  MARÍA   CLARA ", origin),
    ]);
    assert.equal(repeated.filter(Boolean).length, 1);
    const invitation = repeated.find(Boolean);
    assert.ok(invitation);
    const applicant = await redeem(invitation);
    assert.ok(applicant);
    const waiting = await authorizeAccount(peer, applicant.token);
    assert.ok(waiting?.participantId);
    assert.equal(waiting.status, "pending");
    assert.equal(await authorizeGame(db, applicant.token), null);
    assert.equal(Boolean(await manageRegistration(db, applicant.token, owner.gameId, { kind: "close" })), false);
    const decisions = await Promise.all([
      manageRegistration(db, created.token, owner.gameId, { kind: "approve", personId: waiting.participantId }),
      manageRegistration(peer, signed.token, owner.gameId, { kind: "approve", personId: waiting.participantId }),
    ]);
    assert.equal(decisions.filter(Boolean).length, 1);
    assert.equal((await authorizeGame(peer, applicant.token))?.status, "confirmed");

    const rejectionInvite = await requestRegistration(db, pepper, token, "Solicitud rechazada", origin);
    assert.ok(rejectionInvite);
    const rejectionAccount = await redeem(rejectionInvite);
    assert.ok(rejectionAccount);
    const rejection = await authorizeAccount(peer, rejectionAccount.token);
    assert.ok(rejection?.participantId);
    assert.ok(await manageRegistration(db, created.token, owner.gameId, { kind: "reject", personId: rejection.participantId }));
    assert.equal(await authorizeAccount(peer, rejectionAccount.token), null);
    const rejectionLogin = await login(peer, pepper, { link: rejectionAccount.loginToken, pin, temporary: false, origin });
    assert.ok(rejectionLogin);
    assert.equal((await authorizeAccount(peer, rejectionLogin.token))?.status, "rejected");
    assert.equal(await authorizeGame(peer, rejectionLogin.token), null);

    assert.ok(await manageRegistration(db, created.token, owner.gameId, { kind: "add", name: "Persona manual" }));
    const panel = await organizerPanel(peer, created.token, owner.gameId);
    const manual = panel?.people.find((person) => person.source === "manual");
    assert.ok(manual);
    assert.equal(manual.status, "confirmed");
    assert.equal(manual.activatedAt, null);
    assert.equal(Boolean(await manageRegistration(db, other.token, otherOwner.gameId, { kind: "rename", personId: manual.id, name: "Ajeno" })), false);
    assert.ok(await manageRegistration(db, created.token, owner.gameId, { kind: "rename", personId: manual.id, name: "Persona editada" }));
    const expired = await manageRegistration(db, created.token, owner.gameId, { kind: "invite", personId: manual.id });
    assert.ok(expired?.personalToken);
    await db.update(invites).set({ createdAt: new Date(Date.now() - 120_000), expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(invites.tokenHash, tokenDigest("invite", expired.personalToken)));
    const renewed = await manageRegistration(peer, created.token, owner.gameId, { kind: "invite", personId: manual.id });
    assert.ok(renewed?.personalToken);
    assert.equal(Boolean(await redeem(expired.personalToken)), false);
    const manualAccount = await redeem(renewed.personalToken);
    assert.ok(manualAccount);
    assert.equal((await authorizeGame(peer, manualAccount.token))?.participantName, "Persona editada");
    assert.ok(await manageRegistration(db, created.token, owner.gameId, { kind: "withdraw", personId: manual.id }));
    assert.equal(await authorizeAccount(peer, manualAccount.token), null);
    assert.equal((await organizerPanel(peer, created.token, owner.gameId))?.people.find((person) => person.id === manual.id)?.status, "withdrawn");

    assert.ok(await manageRegistration(db, created.token, owner.gameId, { kind: "close" }));
    assert.equal((await publicInvitation(peer, token))?.open, false);
    assert.equal(Boolean(await requestRegistration(peer, pepper, token, "Fuera de plazo", origin)), false);
    assert.equal(Boolean(await manageRegistration(peer, created.token, owner.gameId, { kind: "add", name: "Fuera de plazo" })), false);
    assert.ok(await manageRegistration(db, created.token, owner.gameId, { kind: "reopen" }));
    const rotated = await manageRegistration(db, created.token, owner.gameId, { kind: "general" });
    assert.ok(rotated?.shareToken);
    assert.equal(await publicInvitation(peer, token), null);
    assert.ok((await organizerPanel(peer, created.token, owner.gameId))?.general?.expiresAt);
    const updatedShare = rotated.shareToken;
    const burst = await Promise.all(Array.from({ length: 10 }, (_, index) =>
      requestRegistration(index % 2 ? db : peer, pepper, updatedShare, `Registro ficticio ${index}`, origin + "-burst")));
    assert.equal(burst.filter(Boolean).length, 8);

    // Independent pools coordinate through PostgreSQL even when revocation wins the lock race.
    assert.ok(await manageRegistration(db, created.token, owner.gameId, { kind: "add", name: "Invitación pendiente" }));
    const view = await organizerPanel(db, created.token, owner.gameId);
    const invitee = view?.people.find(({ displayName }) => displayName === "Invitación pendiente");
    assert.ok(invitee);
    const invitationSession = await login(db, pepper, { link: created.loginToken, pin, temporary: false, origin });
    assert.ok(invitationSession);
    for (const [session, action] of [
      [signed.token, (worker: typeof db) => manageRegistration(worker, signed.token, owner.gameId, { kind: "close" })],
      [invitationSession.token, (worker: typeof db) => inviteParticipant(worker, invitationSession.token, owner.gameId, invitee.id)],
    ] as const) {
      const applicationName = "amigo-e51-" + randomBytes(6).toString("hex");
      const worker = connectDatabase({ ...developmentConnectionConfig("test"), application_name: applicationName });
      let operation: Promise<unknown> | undefined;
      try {
        await db.transaction(async (tx) => {
          await tx.select({ id: games.id }).from(games).where(eq(games.id, owner.gameId)).for("no key update");
          operation = action(worker.db);
          // Observe the lock wait without reading PostgreSQL's SQL statement text.
          for (let attempt = 0; attempt < 200; attempt++) {
            const { rows } = await peer.execute(sql`select 1 from pg_stat_activity
              where application_name = ${applicationName} and wait_event_type = 'Lock'`);
            if (rows.length) {
              await revokeSession(peer, session);
              return;
            }
            await delay(10);
          }
          throw new Error("La solicitud de prueba no llegó al bloqueo.");
        });
        assert.equal(await operation, null);
      } finally {
        await worker.close();
      }
    }
    assert.equal((await organizerPanel(peer, created.token, owner.gameId))?.game.state, "registrations_open");
    assert.equal((await peer.select({ id: invites.id }).from(invites).where(eq(invites.participantId, invitee.id))).length, 0);
  } finally {
    try {
      if (gameIds.length) {
        const members = await db.select({ identityId: participants.identityId }).from(participants).where(inArray(participants.gameId, gameIds));
        const ownedIdentities = [...new Set([...adminIds, ...members.flatMap(({ identityId }) => identityId ? [identityId] : [])])];
        await db.delete(games).where(inArray(games.id, gameIds));
        if (ownedIdentities.length) await db.delete(identities).where(inArray(identities.id, ownedIdentities));
      }
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  }
});
