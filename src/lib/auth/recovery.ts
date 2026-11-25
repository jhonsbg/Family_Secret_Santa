import { and, eq, gt, inArray, isNotNull, isNull } from "drizzle-orm";
import type { Database, Transaction } from "../db/connection";
import { games, invites, participants, pinCredentials, recoveryEvents } from "../db/schema";
import { reserveAttempt } from "./attempts";
import { authorizeOrganizer } from "./authorization";
import { hashPin, newRecoveryCode, newToken, recoveryCodeDigest, tokenDigest, validPin, validToken, verifyPin } from "./crypto";
import { lockActiveSession, revokeAssistedInvitations } from "./recovery-store";
import { authenticatedSession, createSession, revokeIdentitySessions } from "./sessions";

const linkDuration = 15 * 60_000;

export async function issueAssistedRecovery(db: Database, pepper: Buffer, token: string, request: {
  gameId: string; participantId: string; verified: boolean; origin: string;
}) {
  if (!request.verified) return null;
  const organizer = await authorizeOrganizer(db, token, request.gameId);
  if (!organizer || !await reserveAttempt(db, pepper, "assisted-issuer", organizer.session.identityId, 5)
    || !await reserveAttempt(db, pepper, "assisted-issuer-origin", request.origin, 12)) return null;
  return db.transaction(async (tx) => {
    const [game] = await tx.select({ id: games.id }).from(games).where(and(
      eq(games.id, request.gameId), eq(games.adminIdentityId, organizer.session.identityId),
    )).for("no key update");
    if (!game || !await lockActiveSession(tx, organizer.session)) return null;
    const [member] = await tx.select({ identityId: participants.identityId }).from(participants).where(and(
      eq(participants.id, request.participantId), eq(participants.gameId, game.id),
      inArray(participants.status, ["confirmed", "pending"]), isNotNull(participants.activatedAt),
    )).for("update");
    if (!member?.identityId || member.identityId === organizer.session.identityId) return null;
    const identityId = member.identityId;
    const [credential] = await tx.select({ id: pinCredentials.identityId }).from(pinCredentials).where(and(
      eq(pinCredentials.identityId, identityId), eq(pinCredentials.gameId, game.id),
    ));
    if (!credential) return null;
    const now = new Date();
    await revokeAssistedInvitations(tx, game.id, identityId, now);
    const recoveryToken = newToken();
    await tx.insert(invites).values({
      gameId: game.id, participantId: request.participantId, purpose: "recovery",
      tokenHash: tokenDigest("recovery-invite", recoveryToken), createdAt: now, expiresAt: new Date(+now + linkDuration),
    });
    await tx.insert(recoveryEvents).values({
      gameId: game.id, targetIdentityId: identityId, actorIdentityId: organizer.session.identityId, kind: "assisted_issued",
    });
    return recoveryToken;
  });
}

async function lockGame(tx: Transaction, gameId: string) {
  const [game] = await tx.select({ admin: games.adminIdentityId }).from(games)
    .where(eq(games.id, gameId)).for("no key update");
  return game;
}

async function recoverableMember(tx: Transaction, gameId: string, admin: string, identityId: string, assisted: boolean) {
  if (admin === identityId) return !assisted;
  const [member] = await tx.select({ id: participants.id }).from(participants).where(and(
    eq(participants.gameId, gameId), eq(participants.identityId, identityId),
    inArray(participants.status, assisted ? ["confirmed", "pending"] : ["confirmed", "pending", "rejected"]),
    isNotNull(participants.activatedAt),
  )).for("update");
  return Boolean(member);
}

export async function recoverAccess(db: Database, pepper: Buffer, request: {
  secret: string; assisted: boolean; pin: string; confirmation: string; temporary: boolean;
  origin: string; signedInIdentityId?: string;
}) {
  if (!validPin(request.pin) || request.pin !== request.confirmation) return null;
  if (!await reserveAttempt(db, pepper, "recovery-origin", request.origin, 8)) return null;
  const { assisted } = request;
  const digest = assisted
    ? validToken(request.secret) && tokenDigest("recovery-invite", request.secret)
    : recoveryCodeDigest(request.secret);
  if (!digest) return null;

  const inviteFilter = and(eq(invites.purpose, "recovery"), eq(invites.tokenHash, digest),
    isNull(invites.usedAt), isNull(invites.revokedAt));
  const [candidate] = assisted
    ? await db.select({ identityId: participants.identityId, gameId: invites.gameId })
      .from(invites).innerJoin(participants, and(eq(participants.id, invites.participantId), eq(participants.gameId, invites.gameId)))
      .where(and(inviteFilter, gt(invites.expiresAt, new Date())))
    : await db.select({ identityId: pinCredentials.identityId, gameId: pinCredentials.gameId })
      .from(pinCredentials).where(eq(pinCredentials.recoveryHash, digest));

  if (!candidate?.identityId || (request.signedInIdentityId && request.signedInIdentityId !== candidate.identityId)) return null;
  const { identityId, gameId } = candidate;
  if (!await reserveAttempt(db, pepper, "recovery-identity", identityId, 4)) return null;
  const pinHash = await hashPin(pepper, request.pin);
  return db.transaction(async (tx) => {
    const game = await lockGame(tx, gameId);
    if (!game) return null;
    const [credential] = await tx.select({ version: pinCredentials.version }).from(pinCredentials).where(and(
      eq(pinCredentials.identityId, identityId), eq(pinCredentials.gameId, gameId),
      assisted ? undefined : eq(pinCredentials.recoveryHash, digest),
    )).for("update");
    if (!credential || !await recoverableMember(tx, gameId, game.admin, identityId, assisted)) return null;

    const now = new Date();
    if (assisted) {
      const [consumed] = await tx.update(invites).set({ usedAt: now }).where(and(
        inviteFilter, eq(invites.gameId, gameId), gt(invites.expiresAt, now),
      )).returning({ id: invites.id });
      if (!consumed) return null;
    }

    const nextCode = newRecoveryCode();
    const loginToken = newToken();
    await tx.update(pinCredentials).set({
      pinHash, loginHash: tokenDigest("login", loginToken), recoveryHash: nextCode.digest,
      version: credential.version + 1, updatedAt: now,
    }).where(eq(pinCredentials.identityId, identityId));
    await revokeAssistedInvitations(tx, gameId, identityId, now);
    await revokeIdentitySessions(tx, identityId);
    await tx.insert(recoveryEvents).values({
      gameId, targetIdentityId: identityId, kind: assisted ? "assisted_redeemed" : "personal_redeemed",
    });
    return { ...await createSession(tx, identityId, gameId, request.temporary), loginToken, recoveryCode: nextCode.code };
  });
}

export async function replaceRecoveryCode(db: Database, pepper: Buffer, token: string, pin: string, origin: string) {
  if (!validPin(pin)) return null;
  const session = await authenticatedSession(db, token, true);
  if (!session || !await reserveAttempt(db, pepper, "pin-origin", origin, 20)
    || !await reserveAttempt(db, pepper, "pin-identity", session.identityId, 5)) return null;
  const [credential] = await db.select().from(pinCredentials).where(and(
    eq(pinCredentials.identityId, session.identityId), eq(pinCredentials.gameId, session.gameId),
  ));
  if (!credential || !await verifyPin(pepper, credential.pinHash, pin)) return null;

  return db.transaction(async (tx) => {
    const game = await lockGame(tx, session.gameId);
    if (!game) return null;
    const [locked] = await tx.select({ id: pinCredentials.identityId }).from(pinCredentials).where(and(
      eq(pinCredentials.identityId, session.identityId), eq(pinCredentials.version, credential.version),
      credential.recoveryHash === null ? isNull(pinCredentials.recoveryHash) : eq(pinCredentials.recoveryHash, credential.recoveryHash),
    )).for("update");
    if (!locked || !await recoverableMember(tx, session.gameId, game.admin, session.identityId, false)
      || !await lockActiveSession(tx, session)) return null;
    const nextCode = newRecoveryCode();
    await tx.update(pinCredentials).set({ recoveryHash: nextCode.digest, updatedAt: new Date() })
      .where(eq(pinCredentials.identityId, session.identityId));
    await revokeAssistedInvitations(tx, session.gameId, session.identityId);
    await tx.insert(recoveryEvents).values({
      gameId: session.gameId, actorIdentityId: session.identityId, targetIdentityId: session.identityId, kind: "code_replaced",
    });
    return nextCode.code;
  });
}
