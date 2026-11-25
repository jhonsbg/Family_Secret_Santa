import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Database, Transaction } from "../db/connection";
import { games, participants, pinCredentials } from "../db/schema";
import { reserveAttempt } from "./attempts";
import { hashPin, newRecoveryCode, newToken, tokenDigest, validPin, validToken, verifyPin } from "./crypto";
import { lockActiveSession, revokeAssistedInvitations } from "./recovery-store";
import { authenticatedSession, createSession, revokeIdentitySessions } from "./sessions";

export async function createCredential(tx: Transaction, identityId: string, gameId: string, pinHash: string) {
  const loginToken = newToken();
  const recovery = newRecoveryCode();
  await tx.insert(pinCredentials).values({
    identityId, gameId, loginHash: tokenDigest("login", loginToken), pinHash, recoveryHash: recovery.digest,
  });
  return { loginToken, recoveryCode: recovery.code };
}

export async function login(db: Database, pepper: Buffer, input: { link: string; pin: string; temporary: boolean; origin: string }) {
  if (!validToken(input.link) || !validPin(input.pin)) return null;
  if (!await reserveAttempt(db, pepper, "pin-origin", input.origin, 20)) return null;
  const [credential] = await db.select().from(pinCredentials)
    .where(eq(pinCredentials.loginHash, tokenDigest("login", input.link)));
  if (!credential) {
    await hashPin(pepper, input.pin);
    return null;
  }
  if (!await reserveAttempt(db, pepper, "pin-identity", credential.identityId, 5)) return null;
  if (!await verifyPin(pepper, credential.pinHash, input.pin)) return null;

  return db.transaction(async (tx) => {
    const [current] = await tx.select({ id: pinCredentials.identityId }).from(pinCredentials)
      .where(and(eq(pinCredentials.identityId, credential.identityId), eq(pinCredentials.version, credential.version))).for("update");
    if (!current) return null;
    const [member] = await tx.select({ id: participants.id }).from(participants).where(and(
      eq(participants.identityId, credential.identityId), eq(participants.gameId, credential.gameId),
      inArray(participants.status, ["pending", "confirmed", "rejected"]), isNotNull(participants.activatedAt),
    )).for("update");
    if (!member) {
      const [owner] = await tx.select({ id: games.id }).from(games).where(and(
        eq(games.id, credential.gameId), eq(games.adminIdentityId, credential.identityId),
      ));
      if (!owner) return null;
    }
    return createSession(tx, credential.identityId, credential.gameId, input.temporary);
  });
}

export async function changePin(db: Database, pepper: Buffer, token: string, input: { current: string; pin: string; confirmation: string; origin: string }) {
  if (!validPin(input.current) || !validPin(input.pin) || input.pin !== input.confirmation || input.pin === input.current) return false;
  const session = await authenticatedSession(db, token);
  if (!session || !await reserveAttempt(db, pepper, "pin-origin", input.origin, 20)
    || !await reserveAttempt(db, pepper, "pin-identity", session.identityId, 5)) return false;
  const [credential] = await db.select().from(pinCredentials).where(eq(pinCredentials.identityId, session.identityId));
  if (!credential || !await verifyPin(pepper, credential.pinHash, input.current)) return false;
  const pinHash = await hashPin(pepper, input.pin);

  return db.transaction(async (tx) => {
    const [current] = await tx.select({ version: pinCredentials.version }).from(pinCredentials).where(and(
      eq(pinCredentials.identityId, session.identityId), eq(pinCredentials.version, credential.version),
    )).for("update");
    if (!current) return false;
    if (!await lockActiveSession(tx, session)) return false;

    const [updated] = await tx.update(pinCredentials).set({
      pinHash, version: credential.version + 1, updatedAt: new Date(),
    }).where(and(eq(pinCredentials.identityId, session.identityId), eq(pinCredentials.version, credential.version))).returning({
      id: pinCredentials.identityId,
    });
    if (!updated) return false;
    await revokeAssistedInvitations(tx, session.gameId, session.identityId);
    await revokeIdentitySessions(tx, session.identityId);
    return true;
  });
}
