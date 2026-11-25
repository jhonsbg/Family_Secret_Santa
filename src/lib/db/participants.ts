import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "./connection";
import { displayName, editableGameStates } from "./games";
import { games, participants } from "./schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function lockEditableGame(tx: Transaction, gameId: string, requireOpen = false) {
  const [game] = await tx.select({ id: games.id }).from(games).where(and(
    eq(games.id, gameId),
    requireOpen ? eq(games.state, "registrations_open") : inArray(games.state, editableGameStates),
  )).for("update");
  if (!game) throw new Error("La partida no existe o ya no admite esta operación.");
}

function participantInGame(gameId: string, id: string) {
  return and(eq(participants.gameId, gameId), eq(participants.id, id));
}

export function participantRepository(db: Database) {
  return {
    async add(gameId: string, name: string, source: "individual" | "manual") {
      const normalized = displayName(name);
      if (source !== "individual" && source !== "manual") throw new Error("Origen de inscripción inválido.");
      return db.transaction(async (tx) => {
        await lockEditableGame(tx, gameId, true);
        const [participant] = await tx.insert(participants).values({
          gameId, displayName: normalized, source, status: source === "manual" ? "confirmed" : "pending",
        }).returning();
        return participant;
      });
    },
    async get(gameId: string, id: string) {
      const [participant] = await db.select().from(participants).where(participantInGame(gameId, id));
      return participant ?? null;
    },
    list(gameId: string) {
      return db.select().from(participants).where(eq(participants.gameId, gameId))
        .orderBy(asc(participants.createdAt), asc(participants.id));
    },
    async rename(gameId: string, id: string, name: string) {
      const normalized = displayName(name);
      return db.transaction(async (tx) => {
        await lockEditableGame(tx, gameId);
        const [participant] = await tx.update(participants).set({ displayName: normalized, updatedAt: new Date() })
          .where(participantInGame(gameId, id)).returning();
        return participant ?? null;
      });
    },
    async resolve(gameId: string, id: string, decision: "confirmed" | "rejected") {
      if (decision !== "confirmed" && decision !== "rejected") throw new Error("Decisión de inscripción inválida.");
      return db.transaction(async (tx) => {
        await lockEditableGame(tx, gameId);
        const [participant] = await tx.update(participants).set({ status: decision, updatedAt: new Date() })
          .where(and(participantInGame(gameId, id), eq(participants.status, "pending"))).returning();
        return participant ?? null;
      });
    },
  };
}
