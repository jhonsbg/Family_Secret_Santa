import "server-only";
import { and, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { authorizeGame, inspectGameAccess } from "../auth/authorization";
import { tokenDigest } from "../auth/crypto";
import { lockActiveSession } from "../auth/recovery-store";
import type { Database, Transaction } from "../db/connection";
import { assignments, draws, envelopeViews, games, participants, revealSessions, sessions, wishlist } from "../db/schema";
import { readScopedAssignment } from "../draw/service";
import { emptyWishes, wishLimit } from "./wishes";

type Access = NonNullable<Awaited<ReturnType<typeof authorizeGame>>> & { participantId: string };
type Reader = Database | Transaction;

const stale = { ok: false, reason: "stale" } as const;
const denied = { ok: false, reason: "denied" } as const;
const invalid = { ok: false, reason: "invalid" } as const;
export type ParticipantFailure = typeof stale | typeof denied | typeof invalid;

const wishColumns = { gift: wishlist.gift, likes: wishlist.likes, avoid: wishlist.avoid };

async function readStatus(db: Reader, access: Access) {
  const revealExists = db.select({ id: revealSessions.id }).from(revealSessions).where(eq(revealSessions.gameId, games.id));
  const now = new Date();
  const [status] = await db.select({
    version: sql<number | null>`case when ${assignments.drawId} is not null then ${draws.version} end`,
    revision: sql<number>`coalesce((select max(history.version) from draws as history where history.game_id = ${games.id}), 0)`,
    opened: sql<boolean>`${envelopeViews.drawId} is not null`,
    wishesEnabled: games.wishesEnabled,
    editable: sql<boolean>`${games.wishesEnabled} and ${games.state} in ('registrations_open', 'registrations_closed', 'drawn') and not exists (${revealExists})`,
  }).from(games)
    .innerJoin(participants, and(eq(participants.gameId, games.id), eq(participants.id, access.participantId),
      eq(participants.identityId, access.session.identityId), eq(participants.status, "confirmed"), isNotNull(participants.activatedAt)))
    .innerJoin(sessions, and(eq(sessions.id, access.session.id), eq(sessions.identityId, participants.identityId),
      eq(sessions.gameId, games.id), isNull(sessions.revokedAt), gt(sessions.expiresAt, now), gt(sessions.idleExpiresAt, now)))
    .leftJoin(draws, and(eq(draws.gameId, games.id), isNull(draws.invalidatedAt)))
    .leftJoin(assignments, and(eq(assignments.drawId, draws.id), eq(assignments.gameId, games.id), eq(assignments.giverId, participants.id)))
    .leftJoin(envelopeViews, and(eq(envelopeViews.drawId, assignments.drawId), eq(envelopeViews.participantId, participants.id)))
    .where(eq(games.id, access.gameId));
  return status ? { ...status, sessionView: tokenDigest("session-view", access.session.id) } : null;
}

export type ParticipantStatus = NonNullable<Awaited<ReturnType<typeof readStatus>>>;

export async function participantStatus(db: Database, token: string) {
  // Background checks must never renew the inactivity deadline.
  const access = await inspectGameAccess(db, token);
  if (!access?.participantId) return null;
  return readStatus(db, { ...access, participantId: access.participantId });
}

async function withParticipant<T>(
  db: Database, token: string, run: (tx: Transaction, access: Access, status: ParticipantStatus) => Promise<T>, expectedSession?: string,
) {
  const access = await authorizeGame(db, token);
  if (!access?.participantId) return denied;
  const member = { ...access, participantId: access.participantId };
  return db.transaction(async (tx) => {
    // Serialize against enrollment, draw changes and the future reveal transition.
    const [game] = await tx.select({ id: games.id }).from(games).where(eq(games.id, member.gameId)).for("no key update");
    if (!game || !await lockActiveSession(tx, member.session)) return denied;
    const status = await readStatus(tx, member);
    if (!status || (expectedSession !== undefined && expectedSession !== status.sessionView)) return denied;
    return run(tx, member, status);
  });
}

export function participantHome(db: Database, token: string) {
  return withParticipant(db, token, async (tx, access, status) => {
    const [own] = status.wishesEnabled
      ? await tx.select(wishColumns).from(wishlist).where(eq(wishlist.participantId, access.participantId))
      : [];
    return { ok: true, status, wishes: own ?? emptyWishes } as const;
  });
}

function validVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export async function openEnvelope(db: Database, token: string, version: unknown, expectedSession?: string) {
  if (!validVersion(version)) return stale;
  return withParticipant(db, token, async (tx, access, status) => {
    if (status.version !== version) return stale;
    const own = await readScopedAssignment(tx, access, version);
    if (!own) return stale;
    const [recipient] = await tx.select({ name: participants.displayName }).from(participants)
      .where(and(eq(participants.gameId, access.gameId), eq(participants.id, own.recipientId), eq(participants.status, "confirmed")));
    if (!recipient) return stale;
    const first = await tx.insert(envelopeViews).values({ drawId: own.drawId, participantId: access.participantId })
      .onConflictDoNothing().returning({ drawId: envelopeViews.drawId });
    return { ok: true, version, name: recipient.name, first: first.length === 1 } as const;
  }, expectedSession);
}

export async function assignedWishes(db: Database, token: string, version: unknown, expectedSession?: string) {
  if (!validVersion(version)) return stale;
  return withParticipant(db, token, async (tx, access, status) => {
    if (status.version !== version) return stale;
    if (!status.opened || !status.wishesEnabled) return denied;
    const own = await readScopedAssignment(tx, access, version);
    if (!own) return stale;
    const [wishes] = await tx.select(wishColumns).from(wishlist).innerJoin(participants, eq(participants.id, wishlist.participantId))
      .where(and(eq(participants.gameId, access.gameId), eq(participants.id, own.recipientId), eq(participants.status, "confirmed")));
    return { ok: true, version, wishes: wishes ?? emptyWishes } as const;
  }, expectedSession);
}

function clean(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.length > wishLimit || /[^\P{Cc}\n\r\t]/u.test(value)) return null;
  return value.trim();
}

export async function saveWishes(db: Database, token: string, revision: unknown, version: unknown, form: FormData, expectedSession?: string) {
  const gift = clean(form.get("gift"));
  const likes = clean(form.get("likes"));
  const avoid = clean(form.get("avoid"));
  if (gift === null || likes === null || avoid === null) return invalid;
  return withParticipant(db, token, async (tx, access, status) => {
    if (status.revision !== revision || status.version !== version) return stale;
    if (!status.editable) return denied;
    const wishes = { gift, likes, avoid };
    await tx.insert(wishlist).values({ participantId: access.participantId, ...wishes }).onConflictDoUpdate({
      target: wishlist.participantId, set: { ...wishes, updatedAt: new Date() },
    });
    return { ok: true, wishes } as const;
  }, expectedSession);
}
