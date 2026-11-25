import "server-only";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { authorizeGame, authorizeOrganizer } from "../auth/authorization";
import { lockActiveSession } from "../auth/recovery-store";
import type { Database, Transaction } from "../db/connection";
import { editableGameStates } from "../db/games";
import { assignments, draws, exclusions, games, participants, revealSessions, sessions } from "../db/schema";
import { isFeasible, maxDrawParticipants, sampleDraw, type Pair } from "./engine";
import { randomRank } from "./random";

type Reader = Database | Transaction;
type Game = typeof games.$inferSelect;
type Command = "draw" | "repeat" | "void";
type Outcome = { ok: true; version: number } | { ok: false; message: string };

async function readSetup(db: Reader, gameId: string) {
  const people = await db.select({
    id: participants.id, name: participants.displayName, status: participants.status,
  }).from(participants).where(and(eq(participants.gameId, gameId), inArray(participants.status, ["confirmed", "pending"])))
    .orderBy(asc(participants.id));
  const eligible = people.filter((person) => person.status === "confirmed").map(({ id, name }) => ({ id, name }));
  const ids = new Set(eligible.map(({ id }) => id));
  const pairs = await db.select({ a: exclusions.participantA, b: exclusions.participantB })
    .from(exclusions).where(eq(exclusions.gameId, gameId)).orderBy(asc(exclusions.participantA), asc(exclusions.participantB));
  return {
    eligible, pending: people.length - eligible.length,
    pairs: pairs.filter(({ a, b }) => ids.has(a) && ids.has(b)).map(({ a, b }): Pair => [a, b]),
  };
}

async function readHistory(db: Reader, gameId: string) {
  const [latest] = await db.select({
    id: draws.id, version: draws.version, invalidatedAt: draws.invalidatedAt,
  }).from(draws).where(eq(draws.gameId, gameId)).orderBy(desc(draws.version)).limit(1);
  const [active] = await db.select({ id: draws.id, version: draws.version }).from(draws)
    .where(and(eq(draws.gameId, gameId), isNull(draws.invalidatedAt))).limit(1);
  const [event] = await db.select({ id: revealSessions.id }).from(revealSessions)
    .where(eq(revealSessions.gameId, gameId)).limit(1);
  return { latest, active, hasRevealed: Boolean(event) };
}

function prerequisites(setup: Awaited<ReturnType<typeof readSetup>>) {
  if (setup.pending) return "Resuelve todas las solicitudes pendientes antes de sortear.";
  if (setup.eligible.length < 3) return "Confirma al menos tres participantes.";
  if (setup.eligible.length > maxDrawParticipants) return `El motor admite hasta ${maxDrawParticipants} participantes confirmados.`;
  return null;
}

function lockGame(tx: Transaction, gameId: string, identityId: string) {
  return tx.select().from(games).where(and(eq(games.id, gameId), eq(games.adminIdentityId, identityId))).for("no key update");
}

function locked(state: Game["state"], hasRevealed: boolean) {
  return hasRevealed || state === "revealing" || state === "finished";
}

export async function organizerDrawStatus(db: Database, token: string, gameId: string) {
  const access = await authorizeOrganizer(db, token, gameId);
  if (!access) return null;
  return db.transaction(async (tx) => {
    const [game] = await lockGame(tx, gameId, access.session.identityId);
    if (!game) return null;
    const history = await readHistory(tx, gameId);
    const setup = await readSetup(tx, gameId);
    const blocked = locked(game.state, history.hasRevealed);
    const currentVersion = history.active?.version ?? null;
    const eligibleIds = setup.eligible.map(({ id }) => id);
    const reason = blocked ? "La revelación ya comenzó."
      : game.state === "registrations_open" ? "Cierra las inscripciones antes de sortear."
      : prerequisites(setup) ?? (isFeasible(eligibleIds, setup.pairs) ? null : "Las exclusiones impiden un reparto completo. Revisa las parejas excluidas.");
    return {
      ...setup, currentVersion, lastVersion: history.latest?.version ?? 0, blocked, reason,
      editable: !blocked && currentVersion === null && editableGameStates.some((state) => state === game.state),
    };
  });
}

export async function configureExclusion(db: Database, token: string, gameId: string, a: string, b: string, add: boolean): Promise<Outcome> {
  const access = await authorizeOrganizer(db, token, gameId);
  if (!access) return { ok: false, message: "La operación requiere acceso de organizador." };
  const [first, second] = [a.toLowerCase(), b.toLowerCase()].sort();
  if (first === second) return { ok: false, message: "Elige dos personas distintas." };
  return db.transaction(async (tx) => {
    const [game] = await lockGame(tx, gameId, access.session.identityId);
    if (!game || !await lockActiveSession(tx, access.session)) return { ok: false, message: "La sesión de organizador ya no está activa." };
    const history = await readHistory(tx, gameId);
    if (locked(game.state, history.hasRevealed) || history.active || !editableGameStates.some((state) => state === game.state)) {
      return { ok: false, message: "Las exclusiones solo se pueden editar antes de un sorteo vigente y antes de la revelación." };
    }
    const people = await tx.select({ id: participants.id }).from(participants).where(and(
      eq(participants.gameId, gameId), eq(participants.status, "confirmed"), inArray(participants.id, [first, second]),
    ));
    if (people.length !== 2) return { ok: false, message: "Elige dos participantes confirmados de esta partida." };
    if (add) {
      const [created] = await tx.insert(exclusions).values({ gameId, participantA: first, participantB: second })
        .onConflictDoNothing().returning({ a: exclusions.participantA });
      if (!created) return { ok: false, message: "Esa exclusión ya está registrada." };
    } else {
      await tx.delete(exclusions).where(and(eq(exclusions.gameId, gameId),
        eq(exclusions.participantA, first), eq(exclusions.participantB, second)));
    }
    return { ok: true, version: history.latest?.version ?? 0 };
  });
}

export async function runDraw(db: Database, token: string, gameId: string, command: Command, expectedVersion: number, confirmed: boolean): Promise<Outcome> {
  if (!confirmed) return { ok: false, message: "Confirma la operación para continuar." };
  const access = await authorizeOrganizer(db, token, gameId);
  if (!access) return { ok: false, message: "La operación requiere acceso de organizador." };

  // Keep failures at this boundary generic. Database errors can include assignment parameters.
  try {
    return await db.transaction(async (tx) => {
      const [game] = await lockGame(tx, gameId, access.session.identityId);
      if (!game || !await lockActiveSession(tx, access.session)) return { ok: false, message: "La sesión de organizador ya no está activa." };
      const history = await readHistory(tx, gameId);
      if (locked(game.state, history.hasRevealed)) return { ok: false, message: "La revelación ya comenzó." };
      const latestVersion = history.latest?.version ?? 0;
      if (expectedVersion !== latestVersion) return { ok: false, message: "La versión cambió. Actualiza el panel y revisa el estado." };
      const active = history.active;
      const expectedState = command === "draw" ? !active && game.state === "registrations_closed"
        : active && active.version === latestVersion && game.state === "drawn";
      if (!expectedState) return { ok: false, message: "El estado de la partida cambió. Revisa las inscripciones y el sorteo vigente." };

      const now = new Date();
      if (command === "void" && active) {
        await tx.update(draws).set({ invalidatedAt: sql`greatest(${draws.createdAt}, clock_timestamp())` }).where(eq(draws.id, active.id));
        await tx.update(games).set({ state: "registrations_closed", updatedAt: now }).where(eq(games.id, gameId));
        return { ok: true, version: latestVersion };
      }
      const setup = await readSetup(tx, gameId);
      const reason = prerequisites(setup);
      if (reason) return { ok: false, message: reason };
      const ids = setup.eligible.map(({ id }) => id);
      if (!isFeasible(ids, setup.pairs)) return { ok: false, message: "Las exclusiones impiden un reparto completo. Revisa las parejas excluidas." };
      const pairs = sampleDraw(ids, setup.pairs, randomRank);
      if (!pairs || pairs.length !== ids.length) return { ok: false, message: "No se pudo completar el reparto." };
      if (active) await tx.update(draws).set({ invalidatedAt: sql`greatest(${draws.createdAt}, clock_timestamp())` }).where(eq(draws.id, active.id));
      const version = latestVersion + 1;
      const [record] = await tx.insert(draws).values({ gameId, version }).returning({ id: draws.id });
      await tx.insert(assignments).values(pairs.map(([giverId, recipientId]) => ({
        gameId, drawId: record.id, giverId, recipientId,
      })));
      await tx.update(games).set({ state: "drawn", updatedAt: now }).where(eq(games.id, gameId));
      return { ok: true, version };
    });
  } catch {
    return { ok: false, message: "No se pudo guardar el sorteo. Actualiza el panel antes de reintentar." };
  }
}

export async function ownDrawStatus(db: Database, token: string) {
  const access = await authorizeGame(db, token);
  if (!access?.participantId) return null;
  const [current] = await db.select({ version: draws.version }).from(draws)
    .where(and(eq(draws.gameId, access.gameId), isNull(draws.invalidatedAt))).limit(1);
  return current ?? null;
}

// Server contract for E3.2. The caller supplies a version, never a participant identifier.
export async function readOwnAssignment(db: Database, token: string, expectedVersion: number) {
  const access = await authorizeGame(db, token);
  if (!access?.participantId || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) return null;
  const own = await readScopedAssignment(db, access, expectedVersion);
  return own ? { recipientId: own.recipientId } : null;
}

export async function readScopedAssignment(
  db: Reader, access: NonNullable<Awaited<ReturnType<typeof authorizeGame>>>, expectedVersion: number,
) {
  if (!access.participantId) return null;
  const now = new Date();
  const [own] = await db.select({ recipientId: assignments.recipientId, drawId: assignments.drawId }).from(assignments)
    .innerJoin(draws, and(eq(draws.id, assignments.drawId), eq(draws.gameId, assignments.gameId)))
    .innerJoin(participants, and(eq(participants.id, assignments.giverId), eq(participants.gameId, assignments.gameId)))
    .innerJoin(sessions, and(eq(sessions.id, access.session.id), eq(sessions.identityId, participants.identityId),
      eq(sessions.gameId, assignments.gameId)))
    .where(and(eq(assignments.gameId, access.gameId), eq(assignments.giverId, access.participantId),
      eq(draws.version, expectedVersion), isNull(draws.invalidatedAt), eq(participants.status, "confirmed"),
      isNotNull(participants.activatedAt), isNull(sessions.revokedAt), gt(sessions.expiresAt, now), gt(sessions.idleExpiresAt, now)));
  return own ?? null;
}
