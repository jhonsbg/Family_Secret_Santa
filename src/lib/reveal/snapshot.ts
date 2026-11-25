import "server-only";
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { authorizeOrganizer } from "../auth/authorization";
import { tokenDigest, validToken } from "../auth/crypto";
import type { Database, Transaction } from "../db/connection";
import { assignments, displayAccess, draws, games, participants, revealSessions, revealTurns } from "../db/schema";

export function readEvent(tx: Transaction, gameId: string): Promise<typeof revealSessions.$inferSelect | null> {
  return tx.select().from(revealSessions)
    .innerJoin(draws, and(eq(draws.id, revealSessions.drawId), eq(draws.gameId, revealSessions.gameId), isNull(draws.invalidatedAt)))
    .where(eq(revealSessions.gameId, gameId)).then(([row]) => row?.reveal_sessions ?? null);
}

export function readTurns(tx: Transaction, eventId: string) {
  return tx.select().from(revealTurns).where(eq(revealTurns.revealSessionId, eventId)).orderBy(asc(revealTurns.orderIndex));
}

export function readDisplayLink(tx: Transaction, gameId: string): Promise<{ id: string; expiresAt: Date } | null> {
  return tx.select({ id: displayAccess.id, expiresAt: displayAccess.expiresAt }).from(displayAccess)
    .where(and(eq(displayAccess.gameId, gameId), isNull(displayAccess.revokedAt))).then(([link]) => link ?? null);
}

const recipients = alias(participants, "reveal_recipients");
const givers = alias(participants, "revealed_givers");

async function snapshot(tx: Transaction, game: { id: string; name: string; guessingEnabled: boolean }) {
  const event = await readEvent(tx, game.id);
  const turns = event ? await tx.select({
    id: revealTurns.id, order: revealTurns.orderIndex, status: revealTurns.status,
    recipientId: revealTurns.recipientId, recipient: recipients.displayName,
    guessId: revealTurns.guessId, guessSkipped: revealTurns.guessSkipped,
  }).from(revealTurns)
    .innerJoin(recipients, and(eq(recipients.gameId, revealTurns.gameId), eq(recipients.id, revealTurns.recipientId)))
    .where(eq(revealTurns.revealSessionId, event.id)).orderBy(asc(revealTurns.orderIndex)) : [];

  // Hidden turns cannot participate in the assignment projection.
  const revealed = event ? await tx.select({
    order: revealTurns.orderIndex, recipient: recipients.displayName, giver: givers.displayName, correct: revealTurns.guessCorrect,
  }).from(revealTurns)
    .innerJoin(assignments, and(eq(assignments.drawId, revealTurns.drawId), eq(assignments.gameId, revealTurns.gameId),
      eq(assignments.recipientId, revealTurns.recipientId)))
    .innerJoin(recipients, and(eq(recipients.id, revealTurns.recipientId), eq(recipients.gameId, revealTurns.gameId)))
    .innerJoin(givers, and(eq(givers.id, assignments.giverId), eq(givers.gameId, revealTurns.gameId)))
    .where(and(eq(revealTurns.revealSessionId, event.id), inArray(revealTurns.status, ["revealed", "completed"])))
    .orderBy(asc(revealTurns.revealedAt), asc(revealTurns.orderIndex)) : [];

  const current = turns.find(({ status }) => status === "in_progress" || status === "revealed");
  const completed = turns.filter(({ status }) => status === "completed").length;
  return {
    event, current, turns,
    public: {
      name: game.name, guessing: game.guessingEnabled, revision: event?.revision ?? 0,
      state: event?.state ?? ("waiting" as const), total: turns.length, completed,
      current: current ? {
        recipient: current.recipient, guessingRecorded: Boolean(current.guessId || current.guessSkipped),
        result: revealed.find(({ order }) => order === current.order) ?? null,
      } : null,
      history: revealed.filter(({ order }) => order !== current?.order),
    },
  };
}

export type Presentation = Awaited<ReturnType<typeof snapshot>>["public"];

export async function organizerReveal(db: Database, token: string, gameId: string) {
  if (!await authorizeOrganizer(db, token, gameId)) return null;
  return db.transaction(async (tx) => {
    const [game] = await tx.select({ id: games.id, name: games.name, guessingEnabled: games.guessingEnabled })
      .from(games).where(eq(games.id, gameId));
    if (!game) return null;
    const { public: presentation, current, turns } = await snapshot(tx, game);
    const link = await readDisplayLink(tx, gameId);
    return {
      ...presentation, link: link && { id: link.id, expiresAt: link.expiresAt.toISOString() },
      current: current && presentation.current ? { ...presentation.current, id: current.id, revealed: current.status === "revealed",
        guessId: current.guessId, guessSkipped: current.guessSkipped } : null,
      canNext: turns.some(({ status }) => status === "pending"),
      postponed: turns.filter(({ status }) => status === "postponed").map(({ id, recipient }) => ({ id, recipient })),
      candidates: turns.filter(({ id }) => id !== current?.id)
        .map(({ recipientId, recipient }) => ({ id: recipientId, name: recipient }))
        .sort((a, b) => a.name.localeCompare(b.name, "es") || a.id.localeCompare(b.id)),
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export type OrganizerReveal = NonNullable<Awaited<ReturnType<typeof organizerReveal>>>;

export async function publicReveal(db: Database, token: string): Promise<Presentation | null> {
  if (!validToken(token)) return null;
  return db.transaction(async (tx) => {
    const [game] = await tx.select({ id: games.id, name: games.name, guessingEnabled: games.guessingEnabled })
      .from(displayAccess).innerJoin(games, eq(games.id, displayAccess.gameId))
      .where(and(eq(displayAccess.tokenHash, tokenDigest("display", token)), isNull(displayAccess.revokedAt),
        gt(displayAccess.expiresAt, sql`statement_timestamp()`)));
    return game ? (await snapshot(tx, game)).public : null;
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
