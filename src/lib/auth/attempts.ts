import { sql } from "drizzle-orm";
import type { Database } from "../db/connection";
import { authAttempts } from "../db/schema";
import { keyedDigest } from "./crypto";

export const attemptWindow = 15 * 60_000;

export async function reserveAttempt(db: Database, pepper: Buffer, scope: string, subject: string, limit: number) {
  const key = keyedDigest(pepper, scope, subject).toString("hex");
  const now = sql`statement_timestamp()`;
  const expiry = sql`${now} + (${attemptWindow} * interval '1 millisecond')`;
  // PostgreSQL serializes reservations per key, even across serverless instances.
  const [entry] = await db.insert(authAttempts).values({ key, count: 1, windowExpiresAt: expiry })
    .onConflictDoUpdate({
      target: authAttempts.key,
      set: {
        count: sql`case when ${authAttempts.windowExpiresAt} <= ${now} then 1 else ${authAttempts.count} + 1 end`,
        windowExpiresAt: sql`case when ${authAttempts.windowExpiresAt} <= ${now} then ${expiry} else ${authAttempts.windowExpiresAt} end`,
      },
      setWhere: sql`${authAttempts.windowExpiresAt} <= ${now} or ${authAttempts.count} < ${limit}`,
    }).returning({ key: authAttempts.key });
  return Boolean(entry);
}

