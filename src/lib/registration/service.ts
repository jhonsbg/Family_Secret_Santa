import { and, asc, count, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { reserveAttempt } from "../auth/attempts";
import { authorizeOrganizer } from "../auth/authorization";
import { createCredential } from "../auth/credentials";
import { hashPin, newToken, tokenDigest, validToken } from "../auth/crypto";
import { accessName, nameKey } from "../auth/name";
import { validNewPin } from "../auth/pin";
import { replacePersonalInvitation } from "../auth/invitations";
import { lockActiveSession } from "../auth/recovery-store";
import { createSession } from "../auth/sessions";
import type { Database, Transaction } from "../db/connection";
import { createGameRecord, displayName, editableGameStates, validateGameSettings, type CreateGame, type GameSettings } from "../db/games";
import { games, invites, participants, pinCredentials, sessions } from "../db/schema";

export async function createManagedGame(db: Database, pepper: Buffer, input: CreateGame & {
  organizerName: string; pin: string; confirmation: string; temporary: boolean; origin: string;
}) {
  const loginName = accessName(input.organizerName);
  if (!loginName || !validNewPin(input.pin) || input.pin !== input.confirmation) return null;
  if (!await reserveAttempt(db, pepper, "game-creation-origin", input.origin, 4)) return null;
  const pinHash = await hashPin(pepper, input.pin);
  return db.transaction(async (tx) => {
    const game = await createGameRecord(tx, input, true);
    const credential = await createCredential(tx, game.adminIdentityId, game.id, pinHash, loginName);
    return { ...await createSession(tx, game.adminIdentityId, game.id, input.temporary), ...credential };
  });
}

function activeGeneral(token: string, now: Date) {
  return and(eq(invites.tokenHash, tokenDigest("general", token)), eq(invites.purpose, "registration"),
    isNull(invites.revokedAt), gt(invites.expiresAt, now));
}

export async function publicInvitation(db: Database, token: string) {
  if (!validToken(token)) return null;
  const [event] = await db.select({
    id: games.id, name: games.name, eventAt: games.eventAt, timezone: games.timezone,
    budgetMin: games.budgetMin, budgetMax: games.budgetMax, state: games.state,
  }).from(invites).innerJoin(games, eq(invites.gameId, games.id)).where(activeGeneral(token, new Date()));
  return event ? { id: event.id, name: event.name, date: event.eventAt.toISOString(), timezone: event.timezone,
    budgetMin: event.budgetMin, budgetMax: event.budgetMax, open: event.state === "registrations_open" } : null;
}

async function nameTaken(tx: Transaction, gameId: string, name: string, except?: string, identity?: string | null) {
  const people = await tx.select({ name: participants.displayName }).from(participants).where(and(
    eq(participants.gameId, gameId), ne(participants.status, "withdrawn"),
    except ? ne(participants.id, except) : undefined,
  ));
  const key = accessName(name);
  if (!key || people.some((person) => nameKey(person.name) === key)) return true;
  const [taken] = await tx.select({ id: pinCredentials.identityId }).from(pinCredentials)
    .where(and(eq(pinCredentials.gameId, gameId), eq(pinCredentials.loginName, key), identity ? ne(pinCredentials.identityId, identity) : undefined));
  return Boolean(taken);
}

export async function requestRegistration(db: Database, pepper: Buffer, token: string, rawName: string, origin: string) {
  if (!validToken(token)) return null;
  const name = displayName(rawName);
  if (!await reserveAttempt(db, pepper, "registration-origin", origin, 8)) return null;
  const [candidate] = await db.select({ gameId: invites.gameId }).from(invites).where(activeGeneral(token, new Date()));
  if (!candidate || !await reserveAttempt(db, pepper, "registration-game", candidate.gameId, 24)) return null;
  return db.transaction(async (tx) => {
    const [game] = await tx.select({ id: games.id }).from(games).where(and(
      eq(games.id, candidate.gameId), eq(games.state, "registrations_open"),
    )).for("no key update");
    if (!game) return null;
    const [valid] = await tx.select({ id: invites.id }).from(invites).where(activeGeneral(token, new Date()));
    if (!valid) return null;
    const [pending] = await tx.select({ total: count() }).from(participants).where(and(
      eq(participants.gameId, game.id), eq(participants.status, "pending"),
    ));
    if (pending.total >= 40 || await nameTaken(tx, game.id, name)) return null;
    const [person] = await tx.insert(participants).values({
      gameId: game.id, displayName: name, status: "pending", source: "individual",
    }).returning({ id: participants.id });
    return replacePersonalInvitation(tx, game.id, person.id);
  });
}

export async function organizerPanel(db: Database, token: string, gameId: string) {
  if (!await authorizeOrganizer(db, token, gameId)) return null;
  const [game] = await db.select().from(games).where(eq(games.id, gameId));
  if (!game) return null;
  const people = await db.select({
    id: participants.id, displayName: participants.displayName, status: participants.status,
    source: participants.source, activatedAt: participants.activatedAt,
  }).from(participants).where(eq(participants.gameId, gameId)).orderBy(asc(participants.createdAt));
  const [general] = await db.select({ expiresAt: invites.expiresAt }).from(invites).where(and(
    eq(invites.gameId, gameId), eq(invites.purpose, "registration"), isNull(invites.revokedAt),
    gt(invites.expiresAt, new Date()),
  )).limit(1);
  return { game, people, general };
}

export type OrganizerOperation =
  | { kind: "settings"; settings: GameSettings }
  | { kind: "general" | "close" | "reopen" }
  | { kind: "add"; name: string }
  | { kind: "rename"; personId: string; name: string }
  | { kind: "approve" | "reject" | "withdraw" | "invite"; personId: string };

export async function manageRegistration(db: Database, token: string, gameId: string, operation: OrganizerOperation) {
  const access = await authorizeOrganizer(db, token, gameId);
  if (!access) return null;
  return db.transaction(async (tx) => {
    const [game] = await tx.select().from(games).where(and(
      eq(games.id, gameId), eq(games.adminIdentityId, access.session.identityId),
      inArray(games.state, editableGameStates),
    )).for("no key update");
    if (!game || !await lockActiveSession(tx, access.session)) return null;
    const now = new Date();
    if (operation.kind === "settings") {
      await tx.update(games).set({ ...validateGameSettings(operation.settings), updatedAt: now }).where(eq(games.id, gameId));
      return { success: true };
    }
    if (operation.kind === "close" || operation.kind === "reopen") {
      await tx.update(games).set({ state: operation.kind === "close" ? "registrations_closed" : "registrations_open", updatedAt: now })
        .where(eq(games.id, gameId));
      return { success: true };
    }
    if (operation.kind === "general") {
      await tx.update(invites).set({ revokedAt: now }).where(and(
        eq(invites.gameId, gameId), eq(invites.purpose, "registration"), isNull(invites.revokedAt),
      ));
      const shareToken = newToken();
      await tx.insert(invites).values({
        gameId, purpose: "registration", tokenHash: tokenDigest("general", shareToken), createdAt: now,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000),
      });
      return { success: true, shareToken };
    }
    if (operation.kind === "add") {
      const name = displayName(operation.name);
      if (game.state !== "registrations_open" || await nameTaken(tx, gameId, name)) return null;
      await tx.insert(participants).values({ gameId, displayName: name, status: "confirmed", source: "manual" });
      return { success: true };
    }
    if (!("personId" in operation)) return null;
    const [person] = await tx.select().from(participants).where(and(
      eq(participants.gameId, gameId), eq(participants.id, operation.personId),
      inArray(participants.status, ["confirmed", "pending"]),
    )).for("update");
    if (!person) return null;
    const personWhere = and(eq(participants.gameId, gameId), eq(participants.id, person.id));
    if (operation.kind === "invite") {
      if (person.activatedAt || person.identityId || (person.source !== "manual" && person.status !== "confirmed")) return null;
      return { success: true, personalToken: await replacePersonalInvitation(tx, gameId, person.id) };
    }
    if (operation.kind === "rename") {
      const name = displayName(operation.name);
      if (await nameTaken(tx, gameId, name, person.id, person.identityId)) return null;
      await tx.update(participants).set({ displayName: name, updatedAt: now }).where(personWhere);
      if (person.identityId) await tx.update(pinCredentials).set({ loginName: accessName(name), updatedAt: now })
        .where(and(eq(pinCredentials.identityId, person.identityId), eq(pinCredentials.loginName, nameKey(person.displayName))));
      return { success: true };
    }
    if (person.source === "organizer") return null;
    if (operation.kind === "approve" && person.status === "pending") {
      await tx.update(participants).set({ status: "confirmed", updatedAt: now }).where(personWhere);
      return { success: true };
    }
    if ((operation.kind === "reject" && person.status === "pending") || (operation.kind === "withdraw" && person.status === "confirmed")) {
      await tx.update(participants).set({ status: operation.kind === "reject" ? "rejected" : "withdrawn", updatedAt: now })
        .where(personWhere);
      await tx.update(invites).set({ revokedAt: now }).where(and(
        eq(invites.gameId, gameId), eq(invites.participantId, person.id), isNull(invites.usedAt), isNull(invites.revokedAt),
      ));
      if (person.identityId) {
        if (operation.kind === "withdraw") await tx.update(pinCredentials).set({ loginName: null, updatedAt: now })
          .where(and(eq(pinCredentials.gameId, gameId), eq(pinCredentials.identityId, person.identityId)));
        await tx.update(sessions).set({ revokedAt: now }).where(and(
          eq(sessions.gameId, gameId), eq(sessions.identityId, person.identityId), isNull(sessions.revokedAt),
        ));
      }
      return { success: true };
    }
    return null;
  });
}
