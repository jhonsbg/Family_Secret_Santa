import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database, Transaction } from "./connection";
import { games, identities, participants } from "./schema";

type GameSettings = Pick<typeof games.$inferInsert, "name" | "eventAt" | "timezone" | "budgetMin" | "budgetMax" | "wishesEnabled" | "guessingEnabled">;
export type CreateGame = GameSettings & { organizerDisplayName?: string };

export function displayName(value: string, limit = 60) {
  const name = value.trim();
  if (!name || [...name].length > limit) throw new Error("Nombre inválido.");
  return name;
}

function validateSettings(input: GameSettings) {
  const name = displayName(input.name, 100);
  const timezone = input.timezone ?? "America/Bogota";
  if (!(input.eventAt instanceof Date) || !Number.isFinite(input.eventAt.valueOf())) {
    throw new Error("Fecha del encuentro inválida.");
  }
  try {
    new Intl.DateTimeFormat("es-CO", { timeZone: timezone });
  } catch {
    throw new Error("Zona horaria inválida.");
  }
  const { budgetMin, budgetMax } = input;
  if (![budgetMin, budgetMax].every(Number.isInteger) || budgetMin < 0 || budgetMax < budgetMin || budgetMax > 2_147_483_647) {
    throw new Error("Presupuesto inválido.");
  }
  return {
    name, timezone, budgetMin, budgetMax, eventAt: input.eventAt,
    wishesEnabled: input.wishesEnabled ?? true,
    guessingEnabled: input.guessingEnabled ?? true,
  };
}

export const editableGameStates = ["registrations_open", "registrations_closed"] as const;

export async function createGameRecord(tx: Transaction, input: CreateGame, activated = false) {
  const settings = validateSettings(input);
  const organizer = input.organizerDisplayName === undefined ? undefined : displayName(input.organizerDisplayName);
  const [identity] = await tx.insert(identities).values({}).returning();
  const [game] = await tx.insert(games).values({ ...settings, adminIdentityId: identity.id }).returning();
  if (organizer) {
    await tx.insert(participants).values({
      gameId: game.id, identityId: identity.id, displayName: organizer, source: "organizer",
      status: "confirmed", activatedAt: activated ? new Date() : null,
    });
  }
  return game;
}

export function gameRepository(db: Database) {
  return {
    async create(input: CreateGame) {
      return db.transaction((tx) => createGameRecord(tx, input));
    },
    async get(id: string) {
      const [game] = await db.select().from(games).where(eq(games.id, id)).limit(1);
      return game ?? null;
    },
    listByOrganizer(adminIdentityId: string) {
      return db.select().from(games).where(eq(games.adminIdentityId, adminIdentityId)).orderBy(desc(games.createdAt), desc(games.id));
    },
    async update(id: string, input: GameSettings) {
      const settings = validateSettings(input);
      const [game] = await db.update(games).set({ ...settings, updatedAt: new Date() })
        .where(and(eq(games.id, id), inArray(games.state, editableGameStates))).returning();
      return game ?? null;
    },
    async setRegistrations(id: string, open: boolean) {
      const state = open ? "registrations_open" : "registrations_closed";
      const [game] = await db.update(games).set({ state, updatedAt: new Date() })
        .where(and(eq(games.id, id), inArray(games.state, editableGameStates))).returning();
      return game ?? null;
    },
  };
}
