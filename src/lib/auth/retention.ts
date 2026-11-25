import { count, lt } from "drizzle-orm";
import type { Database } from "../db/connection";
import { authAttempts, recoveryEvents } from "../db/schema";

const day = 24 * 60 * 60_000;

function retentionDays(name: string, fallback: number, env: Readonly<Record<string, string | undefined>>) {
  const value = env[name];
  if (value === undefined || value === "") return fallback;
  if (!/^\d{1,4}$/.test(value) || Number(value) < 1 || Number(value) > 3650) {
    throw new Error(`${name} debe ser un número entero entre 1 y 3650.`);
  }
  return Number(value);
}

export function retentionPolicy(env: Readonly<Record<string, string | undefined>> = process.env) {
  return {
    attempts: retentionDays("AUTH_ATTEMPTS_RETENTION_DAYS", 7, env),
    events: retentionDays("AUTH_EVENTS_RETENTION_DAYS", 90, env),
  };
}

export async function cleanAuthHistory(db: Database, policy: ReturnType<typeof retentionPolicy>, apply = false, now = new Date()) {
  const expiredAttempts = lt(authAttempts.windowExpiresAt, new Date(+now - policy.attempts * day));
  const expiredEvents = lt(recoveryEvents.createdAt, new Date(+now - policy.events * day));
  return db.transaction(async (tx) => {
    if (apply) {
      const attemptResult = await tx.delete(authAttempts).where(expiredAttempts);
      const eventResult = await tx.delete(recoveryEvents).where(expiredEvents);
      return { attempts: attemptResult.rowCount ?? 0, events: eventResult.rowCount ?? 0 };
    }
    const [attempts] = await tx.select({ total: count() }).from(authAttempts).where(expiredAttempts);
    const [events] = await tx.select({ total: count() }).from(recoveryEvents).where(expiredEvents);
    return { attempts: attempts.total, events: events.total };
  });
}
