import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Transaction } from "../db/connection";
import { invites, participants, sessions } from "../db/schema";
import type { AuthenticatedSession } from "./sessions";

export async function lockActiveSession(tx: Transaction, session: AuthenticatedSession) {
  const scope = and(eq(sessions.id, session.id), eq(sessions.identityId, session.identityId), eq(sessions.gameId, session.gameId));
  const [locked] = await tx.select({ id: sessions.id }).from(sessions).where(scope).for("update");
  if (!locked) return false;
  const [active] = await tx.select({ id: sessions.id }).from(sessions).where(and(
    scope, isNull(sessions.revokedAt), gt(sessions.expiresAt, sql`statement_timestamp()`), gt(sessions.idleExpiresAt, sql`statement_timestamp()`),
  ));
  return Boolean(active);
}

export function revokeAssistedInvitations(tx: Transaction, gameId: string, identityId: string, now = new Date()) {
  const member = tx.select({ id: participants.id }).from(participants)
    .where(and(eq(participants.identityId, identityId), eq(participants.gameId, gameId)));
  return tx.update(invites).set({ revokedAt: now }).where(and(
    eq(invites.gameId, gameId), eq(invites.purpose, "recovery"), isNull(invites.usedAt), isNull(invites.revokedAt),
    eq(invites.participantId, member),
  ));
}
