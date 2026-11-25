import { eq, sql } from "drizzle-orm";
import type { Database } from "./connection";
import { games, identities, participants, wishlist } from "./schema";

export const fixtureGameId = "938887b1-0c9f-4920-808d-a1e9fcdc2f11";
const fixtureOrganizerId = "938887b1-0c9f-4920-808d-a1e9fcdc2f12";

export async function seedDevelopmentFixtures(db: Database, reset = false) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${fixtureGameId}))`);
    const [existing] = await tx.select({ adminIdentityId: games.adminIdentityId }).from(games)
      .where(eq(games.id, fixtureGameId)).for("update");
    if (existing && existing.adminIdentityId !== fixtureOrganizerId) {
      throw new Error("El identificador de la partida ficticia está ocupado.");
    }
    if (existing && !reset) return;
    if (existing) await tx.delete(games).where(eq(games.id, fixtureGameId));

    await tx.insert(identities).values({ id: fixtureOrganizerId }).onConflictDoNothing();
    await tx.insert(games).values({
      id: fixtureGameId, adminIdentityId: fixtureOrganizerId, name: "[Ficticia] Navidad de práctica",
      eventAt: new Date("2026-12-25T00:00:00Z"), budgetMin: 60000, budgetMax: 80000,
    });
    const [reader] = await tx.insert(participants).values([
      { gameId: fixtureGameId, displayName: "Luna de Ejemplo", source: "manual", status: "confirmed" },
      { gameId: fixtureGameId, displayName: "Pablo de Ejemplo", source: "manual", status: "confirmed" },
      { gameId: fixtureGameId, displayName: "Celia de Ejemplo", source: "manual", status: "confirmed" },
      { gameId: fixtureGameId, displayName: "Irene de Ejemplo", source: "individual", status: "pending" },
    ]).returning({ id: participants.id });
    await tx.insert(wishlist).values({ participantId: reader.id, gift: "Un libro de viajes" });
  });
}
