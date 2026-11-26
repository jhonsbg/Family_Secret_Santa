import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import type { Database, Transaction } from "../db/connection";
import { games, identities, invites, participants, pinCredentials } from "../db/schema";
import { reserveAttempt } from "./attempts";
import { authorizeOrganizer } from "./authorization";
import { hashPin, newToken, tokenDigest, validToken } from "./crypto";
import { accessName } from "./name";
import { validNewPin } from "./pin";
import { createCredential } from "./credentials";
import { lockActiveSession } from "./recovery-store";
import { createSession, type AuthenticatedSession } from "./sessions";

const inviteLife = 24 * 60 * 60_000;

async function issue(db: Database, gameId: string, participantId: string, adminId: string, session?: AuthenticatedSession) {
  return db.transaction(async (tx) => {
    const [game] = await tx.select({ id: games.id }).from(games).where(and(
      eq(games.id, gameId), eq(games.adminIdentityId, adminId),
    )).for("no key update");
    if (!game || (session && !await lockActiveSession(tx, session))) return null;
    const [person] = await tx.select().from(participants).where(and(
      eq(participants.gameId, gameId), eq(participants.id, participantId), eq(participants.status, "confirmed"),
    )).for("update");
    if (!person || person.activatedAt || (person.identityId && person.source !== "organizer")) return null;
    return replacePersonalInvitation(tx, gameId, participantId);
  });
}

// Caller holds the game and participant locks, or has just inserted the participant.
export async function replacePersonalInvitation(tx: Transaction, gameId: string, participantId: string) {
  const now = new Date();
  await tx.update(invites).set({ revokedAt: now }).where(and(
    eq(invites.gameId, gameId), eq(invites.participantId, participantId), eq(invites.purpose, "activation"),
    isNull(invites.usedAt), isNull(invites.revokedAt),
  ));
  const token = newToken();
  await tx.insert(invites).values({
    gameId, participantId, purpose: "activation", tokenHash: tokenDigest("invite", token),
    createdAt: now, expiresAt: new Date(now.getTime() + inviteLife),
  });
  return token;
}

export async function inviteParticipant(db: Database, sessionToken: string, gameId: string, participantId: string) {
  const organizer = await authorizeOrganizer(db, sessionToken, gameId);
  return organizer ? issue(db, gameId, participantId, organizer.session.identityId, organizer.session) : null;
}

// Intended for the fixture CLI and integration tests. Never bind this function to a web entry point.
export function issueControlledInvitation(db: Database, gameId: string, participantId: string, adminId: string) {
  return issue(db, gameId, participantId, adminId);
}

export async function activate(db: Database, pepper: Buffer, input: { invite: string; pin: string; confirmation: string; temporary: boolean; origin: string }) {
  if (!validToken(input.invite) || !validNewPin(input.pin) || input.pin !== input.confirmation) return null;
  if (!await reserveAttempt(db, pepper, "activation-origin", input.origin, 20)) return null;
  const [candidate] = await db.select({ id: invites.id, gameId: invites.gameId, participantId: invites.participantId })
    .from(invites).where(and(
      eq(invites.tokenHash, tokenDigest("invite", input.invite)), eq(invites.purpose, "activation"),
      gt(invites.expiresAt, new Date()), isNull(invites.usedAt), isNull(invites.revokedAt),
    ));
  if (!candidate?.participantId) return null;
  const participantId = candidate.participantId;
  const pinHash = await hashPin(pepper, input.pin);
  return db.transaction(async (tx) => {
    const [game] = await tx.select({ id: games.id }).from(games).where(eq(games.id, candidate.gameId)).for("no key update");
    if (!game) return null;
    const [person] = await tx.select().from(participants).where(and(
      eq(participants.id, participantId), eq(participants.gameId, candidate.gameId),
      inArray(participants.status, ["confirmed", "pending"]),
      isNull(participants.activatedAt),
    )).for("update");
    if (!person || (person.identityId && person.source !== "organizer")) return null;
    const loginName = accessName(person.displayName);
    if (!loginName) return null;
    const [taken] = await tx.select({ id: pinCredentials.identityId }).from(pinCredentials)
      .where(and(eq(pinCredentials.gameId, person.gameId), eq(pinCredentials.loginName, loginName)));
    if (taken) return null;
    if (person.identityId) {
      const [existing] = await tx.select({ version: pinCredentials.version }).from(pinCredentials)
        .where(eq(pinCredentials.identityId, person.identityId));
      if (existing) return null;
    }
    const now = new Date();
    const [claimed] = await tx.update(invites).set({ usedAt: now }).where(and(
      eq(invites.id, candidate.id), gt(invites.expiresAt, now), isNull(invites.usedAt), isNull(invites.revokedAt),
    )).returning({ id: invites.id });
    if (!claimed) return null;

    const identityId = person.identityId ?? (await tx.insert(identities).values({}).returning({ id: identities.id }))[0].id;
    const credential = await createCredential(tx, identityId, person.gameId, pinHash, loginName);
    await tx.update(participants).set({ identityId, activatedAt: now, updatedAt: now })
      .where(eq(participants.id, participantId));
    const session = await createSession(tx, identityId, person.gameId, input.temporary);
    return { ...session, ...credential };
  });
}
