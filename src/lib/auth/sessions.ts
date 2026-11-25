import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database, Transaction } from "../db/connection";
import { games, participants, sessions } from "../db/schema";
import { newToken, tokenDigest, validToken } from "./crypto";

export const sessionPolicy = {
  regular: { idle: 2 * 60 * 60_000, max: 7 * 24 * 60 * 60_000 },
  borrowed: { idle: 10 * 60_000, max: 30 * 60_000 },
};

export async function createSession(tx: Transaction, identityId: string, gameId: string, temporary: boolean) {
  const token = newToken();
  const policy = temporary ? sessionPolicy.borrowed : sessionPolicy.regular;
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + policy.max);
  await tx.insert(sessions).values({
    identityId, gameId, tokenHash: tokenDigest("session", token), temporary, createdAt,
    expiresAt, idleExpiresAt: new Date(createdAt.getTime() + policy.idle),
  });
  return { token, temporary, expiresAt };
}

export async function authenticatedSession(db: Database, token: string, allowRegistrationStatus = false, touch = true) {
  if (!validToken(token)) return null;
  const now = new Date();
  const valid = and(
    eq(sessions.tokenHash, tokenDigest("session", token)),
    isNull(sessions.revokedAt), gt(sessions.expiresAt, now), gt(sessions.idleExpiresAt, now),
    sql`(exists (select 1 from ${games} where ${games.id} = ${sessions.gameId} and ${games.adminIdentityId} = ${sessions.identityId})
         or exists (select 1 from ${participants} where ${participants.gameId} = ${sessions.gameId}
           and ${participants.identityId} = ${sessions.identityId} and (${participants.status} = 'confirmed' or (${allowRegistrationStatus} and ${participants.status} in ('pending', 'rejected')))
           and ${participants.activatedAt} is not null))`,
  );
  const fields = { id: sessions.id, gameId: sessions.gameId, identityId: sessions.identityId, temporary: sessions.temporary };
  const [session] = touch
    ? await db.update(sessions).set({
        idleExpiresAt: sql`least(${sessions.expiresAt}, greatest(${sessions.idleExpiresAt},
          statement_timestamp() + case when ${sessions.temporary} then interval '10 minutes' else interval '2 hours' end))`,
      }).where(valid).returning(fields)
    : await db.select(fields).from(sessions).where(valid);
  return session ?? null;
}

export type AuthenticatedSession = NonNullable<Awaited<ReturnType<typeof authenticatedSession>>>;

export async function revokeSession(db: Database, token: string) {
  if (!validToken(token)) return;
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(
    eq(sessions.tokenHash, tokenDigest("session", token)), isNull(sessions.revokedAt),
  ));
}

export function revokeIdentitySessions(tx: Transaction, identityId: string) {
  return tx.update(sessions).set({ revokedAt: new Date() })
    .where(and(eq(sessions.identityId, identityId), isNull(sessions.revokedAt)));
}
