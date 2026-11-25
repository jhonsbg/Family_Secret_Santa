import "server-only";
import { randomInt } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { authorizeOrganizer } from "../auth/authorization";
import { newToken, tokenDigest } from "../auth/crypto";
import { lockActiveSession } from "../auth/recovery-store";
import type { Database, Transaction } from "../db/connection";
import { assignments, displayAccess, draws, games, participants, revealSessions, revealTurns } from "../db/schema";
import { readDisplayLink, readEvent, readTurns } from "./snapshot";
import type { CommandInput } from "./types";

const unavailable = { ok: false, message: "No se pudo guardar el cambio. Actualiza el panel antes de reintentar." } as const;
const forbidden = { ok: false, message: "Esta operación requiere una sesión activa de organizador." } as const;
const stale = { ok: false, message: "El intercambio cambió. Revisa el estado actualizado antes de continuar." } as const;
const invalid = { ok: false, message: "Esa acción no está disponible para este turno." } as const;
const success = { ok: true } as const;
type Game = typeof games.$inferSelect;
type Event = typeof revealSessions.$inferSelect;
type Turns = Awaited<ReturnType<typeof readTurns>>;

async function withOrganizer<T>(db: Database, token: string, gameId: string, run: (tx: Transaction, game: Game) => Promise<T>) {
  try {
    const access = await authorizeOrganizer(db, token, gameId);
    if (!access) return forbidden;
    return await db.transaction(async (tx) => {
      const [game] = await tx.select().from(games)
        .where(and(eq(games.id, gameId), eq(games.adminIdentityId, access.session.identityId))).for("no key update");
      if (!game || !await lockActiveSession(tx, access.session)) return forbidden;
      return run(tx, game);
    });
  } catch {
    // PostgreSQL failures can include parameters in their messages.
    return unavailable;
  }
}

async function start(tx: Transaction, game: Game, input: CommandInput) {
  if (!input.confirmed || input.revision !== 0 || game.state !== "drawn") return invalid;
  const [draw] = await tx.select({ id: draws.id, version: draws.version }).from(draws)
    .where(and(eq(draws.gameId, game.id), isNull(draws.invalidatedAt)));
  if (!draw || draw.version !== input.drawVersion) return stale;

  const people = await tx.select({ id: participants.id, status: participants.status }).from(participants)
    .where(eq(participants.gameId, game.id));
  const confirmed = new Set(people.filter(({ status }) => status === "confirmed").map(({ id }) => id));
  const assigned = await tx.select({ giver: assignments.giverId, recipient: assignments.recipientId }).from(assignments)
    .where(and(eq(assignments.drawId, draw.id), eq(assignments.gameId, game.id)));
  if (confirmed.size < 3 || people.some(({ status }) => status === "pending") || assigned.length !== confirmed.size
    || assigned.some(({ giver, recipient }) => !confirmed.has(giver) || !confirmed.has(recipient))) {
    return { ok: false, message: "El sorteo vigente debe incluir un reparto completo antes de iniciar." } as const;
  }
  const order = assigned.map(({ recipient }) => recipient);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const selected = randomInt(index + 1);
    [order[index], order[selected]] = [order[selected], order[index]];
  }
  const [event] = await tx.insert(revealSessions).values({ drawId: draw.id, gameId: game.id }).returning({ id: revealSessions.id });
  await tx.insert(revealTurns).values(order.map((recipientId, orderIndex) => ({
    revealSessionId: event.id, drawId: draw.id, gameId: game.id, recipientId, orderIndex,
  })));
  await tx.update(games).set({ state: "revealing", updatedAt: new Date() }).where(eq(games.id, game.id));
  return success;
}

async function changeTurn(tx: Transaction, game: Game, event: Event, turns: Turns, input: CommandInput) {
  const current = turns.find(({ status }) => status === "in_progress" || status === "revealed");
  const update = (id: string, change: PgUpdateSetSource<typeof revealTurns>) =>
    tx.update(revealTurns).set(change).where(and(eq(revealTurns.id, id), eq(revealTurns.revealSessionId, event.id)));
  if (input.kind === "next" || input.kind === "resume-turn") {
    if (current) return false;
    const picked = input.kind === "next" ? turns.find(({ status }) => status === "pending")
      : turns.find(({ id, status }) => id === input.turnId && status === "postponed");
    if (!picked) return false;
    await update(picked.id, { status: "in_progress" });
    return true;
  }
  if (!current || current.id !== input.turnId) return false;
  if (input.kind === "complete" && current.status === "revealed") {
    await update(current.id, { status: "completed", completedAt: sql`greatest(${revealTurns.revealedAt}, clock_timestamp())` });
    return true;
  }
  if (current.status !== "in_progress") return false;
  if (input.kind === "postpone") {
    await update(current.id, { status: "postponed" });
    return true;
  }
  if (input.kind === "guess") {
    if (!game.guessingEnabled || input.guessId === current.recipientId
      || (input.guessId && !turns.some(({ recipientId }) => recipientId === input.guessId))) return false;
    await update(current.id, { guessId: input.guessId, guessSkipped: input.guessId === null });
    return true;
  }
  if (input.kind !== "reveal" || !input.confirmed || (game.guessingEnabled && !current.guessId && !current.guessSkipped)) return false;
  const [assignment] = await tx.select({ giver: assignments.giverId }).from(assignments)
    .innerJoin(draws, and(eq(draws.id, assignments.drawId), eq(draws.gameId, assignments.gameId), isNull(draws.invalidatedAt)))
    .where(and(eq(assignments.drawId, event.drawId), eq(assignments.gameId, game.id), eq(assignments.recipientId, current.recipientId)));
  if (!assignment) return false;
  await update(current.id, { status: "revealed", revealedAt: sql`clock_timestamp()`,
    guessCorrect: current.guessId ? current.guessId === assignment.giver : null });
  return true;
}

export function runReveal(db: Database, token: string, gameId: string, input: CommandInput) {
  return withOrganizer(db, token, gameId, async (tx, game) => {
    const event = await readEvent(tx, game.id);
    if (input.kind === "start") return event ? stale : start(tx, game, input);
    if (!event || input.revision !== event.revision) return stale;
    if (event.state === "finished" || game.state !== "revealing") return invalid;
    let state: Event["state"] = event.state;
    if (input.kind === "pause" && state === "running") state = "paused";
    else if (input.kind === "resume" && state === "paused") state = "running";
    else {
      if (state !== "running") return invalid;
      const turns = await readTurns(tx, event.id);
      if (input.kind === "finish") {
        if (!input.confirmed || !turns.length || turns.some(({ status }) => status !== "completed")) return invalid;
        state = "finished";
        await tx.update(games).set({ state, updatedAt: new Date() }).where(eq(games.id, game.id));
      } else if (!await changeTurn(tx, game, event, turns, input)) return invalid;
    }
    await tx.update(revealSessions).set({ state, revision: event.revision + 1, updatedAt: new Date() })
      .where(eq(revealSessions.id, event.id));
    return success;
  });
}

export function changeDisplayLink(db: Database, token: string, gameId: string, expected: string | null, issue: boolean) {
  return withOrganizer<typeof stale | { ok: true; issued: false } | { ok: true; issued: true; path: string; linkId: string }>(db, token, gameId, async (tx, game) => {
    const link = await readDisplayLink(tx, gameId);
    if ((link?.id ?? null) !== expected) return stale;
    if (link) await tx.update(displayAccess).set({ revokedAt: sql`greatest(${displayAccess.createdAt}, clock_timestamp())` })
      .where(eq(displayAccess.id, link.id));
    if (!issue) return { ok: true, issued: false };
    const secret = newToken();
    const [created] = await tx.insert(displayAccess).values({
      gameId: game.id, tokenHash: tokenDigest("display", secret),
      expiresAt: sql`statement_timestamp() + interval '12 hours'`,
    }).returning({ id: displayAccess.id });
    return { ok: true, issued: true, path: "/presentacion#" + secret, linkId: created.id };
  });
}
