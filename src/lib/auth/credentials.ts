import { and, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import type { Database, Transaction } from "../db/connection";
import { games, participants, pinCredentials } from "../db/schema";
import { reserveAttempt } from "./attempts";
import { hashPin, newRecoveryCode, newToken, tokenDigest, verifyPin } from "./crypto";
import { accessName, nameKey } from "./name";
import { validExistingPin, validNewPin } from "./pin";
import { lockActiveSession, revokeAssistedInvitations } from "./recovery-store";
import { authenticatedSession, createSession, revokeIdentitySessions } from "./sessions";

export async function createCredential(tx: Transaction, identityId: string, gameId: string, pinHash: string, loginName: string) {
  const recovery = newRecoveryCode();
  await tx.insert(pinCredentials).values({
    identityId, gameId, loginName, loginHash: tokenDigest("login", newToken()), pinHash, recoveryHash: recovery.digest,
  });
  return { recoveryCode: recovery.code };
}

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const day = 24 * 60 * 60_000;

export async function login(db: Database, pepper: Buffer, input: { name: string; game: string; gameId?: string; pin: string; temporary: boolean; origin: string }) {
  const name = accessName(input.name);
  if (!name || !validNewPin(input.pin) || input.game.length > 400 || (input.gameId && !uuid.test(input.gameId))) return null;
  if (!await reserveAttempt(db, pepper, "pin-origin", input.origin, 20)) return null;
  const scoped = await db.select({ id: games.id }).from(games).where(input.gameId
    ? eq(games.id, input.gameId)
    : sql`lower(btrim(regexp_replace(normalize(${games.name}, NFKC), '[[:space:]]+', ' ', 'g')) COLLATE "und-x-icu") = ${nameKey(input.game)}`).limit(2);
  const [credential] = scoped.length === 1
    ? await db.select().from(pinCredentials).where(and(eq(pinCredentials.gameId, scoped[0].id), eq(pinCredentials.loginName, name)))
    : [];
  if (!credential) {
    await hashPin(pepper, input.pin);
    return null;
  }
  if (!await reserveAttempt(db, pepper, "pin-identity", credential.identityId, 5)
    || !await reserveAttempt(db, pepper, "named-pin-day", credential.identityId, 15, day)) {
    await hashPin(pepper, input.pin);
    return null;
  }
  if (!await verifyPin(pepper, credential.pinHash, input.pin)) return null;

  return db.transaction(async (tx) => {
    const [game] = await tx.select({ id: games.id }).from(games).where(eq(games.id, credential.gameId)).for("no key update");
    if (!game) return null;
    const [current] = await tx.select({ id: pinCredentials.identityId }).from(pinCredentials)
      .where(and(eq(pinCredentials.identityId, credential.identityId), eq(pinCredentials.version, credential.version), eq(pinCredentials.loginName, name))).for("update");
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
  if (!validExistingPin(input.current) || !validNewPin(input.pin) || input.pin !== input.confirmation || input.pin === input.current) return false;
  const session = await authenticatedSession(db, token, true);
  if (!session || !await reserveAttempt(db, pepper, "pin-origin", input.origin, 20)
    || !await reserveAttempt(db, pepper, "pin-identity", session.identityId, 5)) return false;
  const [credential] = await db.select().from(pinCredentials).where(eq(pinCredentials.identityId, session.identityId));
  if (!credential?.loginName || !await verifyPin(pepper, credential.pinHash, input.current)) return false;
  const pinHash = await hashPin(pepper, input.pin);

  return db.transaction(async (tx) => {
    const [game] = await tx.select({ id: games.id }).from(games).where(eq(games.id, session.gameId)).for("no key update");
    if (!game) return false;
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

export async function setMissingLoginName(db: Database, token: string, name: string) {
  const loginName = accessName(name);
  if (!loginName) return false;
  const session = await authenticatedSession(db, token, true);
  if (!session) return false;
  return db.transaction(async (tx) => {
    const [game] = await tx.select({ id: games.id }).from(games).where(eq(games.id, session.gameId)).for("no key update");
    if (!game || !await lockActiveSession(tx, session)) return false;
    const registered = await tx.select({ name: participants.displayName }).from(participants)
      .where(and(eq(participants.gameId, session.gameId), ne(participants.status, "withdrawn"),
        or(isNull(participants.identityId), ne(participants.identityId, session.identityId))));
    if (registered.some(({ name }) => nameKey(name) === loginName)) return false;
    const [taken] = await tx.select({ id: pinCredentials.identityId }).from(pinCredentials)
      .where(and(eq(pinCredentials.gameId, session.gameId), eq(pinCredentials.loginName, loginName)));
    if (taken) return false;
    const [credential] = await tx.update(pinCredentials).set({ loginName, updatedAt: new Date() })
      .where(and(eq(pinCredentials.identityId, session.identityId), eq(pinCredentials.gameId, session.gameId), isNull(pinCredentials.loginName)))
      .returning({ id: pinCredentials.identityId });
    return Boolean(credential);
  });
}
