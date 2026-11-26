import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import type { Database } from "../db/connection";
import { games, participants, pinCredentials } from "../db/schema";
import { authenticatedSession } from "./sessions";

function membershipQuery(db: Database, identityId: string, allowRegistrationStatus = false) {
  return db.select({
    gameId: games.id, gameName: games.name, eventAt: games.eventAt, timezone: games.timezone,
    budgetMin: games.budgetMin, budgetMax: games.budgetMax, adminIdentityId: games.adminIdentityId,
    participantId: participants.id, participantName: participants.displayName, status: participants.status, loginName: pinCredentials.loginName,
  }).from(games).leftJoin(participants, and(
    eq(participants.gameId, games.id), eq(participants.identityId, identityId),
    inArray(participants.status, allowRegistrationStatus ? ["confirmed", "pending", "rejected"] : ["confirmed"]), isNotNull(participants.activatedAt),
  )).leftJoin(pinCredentials, and(eq(pinCredentials.gameId, games.id), eq(pinCredentials.identityId, identityId)));
}

export async function listGameMemberships(db: Database, token: string) {
  const session = await authenticatedSession(db, token);
  if (!session) return [];
  const memberships = await membershipQuery(db, session.identityId).where(or(
    eq(games.adminIdentityId, session.identityId), isNotNull(participants.id),
  ));
  return memberships.map(({ adminIdentityId, ...membership }) => ({
    ...membership, organizer: adminIdentityId === session.identityId,
  }));
}

async function readAccess(db: Database, sessionToken: string, gameId?: string, allowRegistrationStatus = false, touch = true) {
  const session = await authenticatedSession(db, sessionToken, allowRegistrationStatus, touch);
  if (!session || (gameId !== undefined && gameId !== session.gameId)) return null;

  const [access] = await membershipQuery(db, session.identityId, allowRegistrationStatus).where(eq(games.id, session.gameId));
  if (!access) return null;
  const organizer = access.adminIdentityId === session.identityId;
  if (!organizer && !access.participantId) return null;
  return {
    session, gameId: access.gameId, gameName: access.gameName, organizer,
    eventAt: access.eventAt, timezone: access.timezone, budgetMin: access.budgetMin, budgetMax: access.budgetMax,
    participantId: access.participantId, participantName: access.participantName, status: access.status, loginName: access.loginName,
  };
}

export function authorizeGame(db: Database, token: string, gameId?: string) {
  return readAccess(db, token, gameId);
}

export function inspectGameAccess(db: Database, token: string) {
  return readAccess(db, token, undefined, false, false);
}

export function authorizeAccount(db: Database, token: string) {
  return readAccess(db, token, undefined, true);
}

export async function authorizeOrganizer(db: Database, token: string, gameId: string) {
  const access = await authorizeGame(db, token, gameId);
  return access?.organizer ? access : null;
}

// Private participant data requires ownership even for a game organizer.
export async function authorizeOwnParticipant(db: Database, token: string, gameId: string, participantId: string) {
  const access = await authorizeGame(db, token, gameId);
  return access?.participantId && access.participantId === participantId ? access : null;
}
