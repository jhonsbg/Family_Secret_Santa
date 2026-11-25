import assert from "node:assert/strict";
import { test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { openDevelopmentDatabase } from "../src/lib/db/connection";
import { fixtureGameId, seedDevelopmentFixtures } from "../src/lib/db/development-fixtures";
import { gameRepository } from "../src/lib/db/games";
import { participantRepository } from "../src/lib/db/participants";
import { assignments, draws, exclusions, games, identities, invites, participants, revealSessions, revealTurns, sessions, wishlist } from "../src/lib/db/schema";

function constraint(name: string) {
  return (error: unknown) => {
    const cause = (error as { cause?: { constraint?: string } }).cause;
    assert.equal(cause?.constraint, name);
    return true;
  };
}

test("migraciones, persistencia e integridad sobre PostgreSQL", async (t) => {
  const connection = openDevelopmentDatabase("test");
  const { db } = connection;
  const game = gameRepository(db);
  const people = participantRepository(db);
  const gameIds: string[] = [];
  const adminIds: string[] = [];
  const base = { name: "[Ficticia] Integración", eventAt: new Date("2027-01-01T00:00:00Z"), budgetMin: 40000, budgetMax: 70000 };

  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    await migrate(db, { migrationsFolder: "./drizzle" });
    const first = await game.create({ ...base, organizerDisplayName: "Organizador de prueba" });
    gameIds.push(first.id);
    adminIds.push(first.adminIdentityId);
    const second = await game.create(base);
    gameIds.push(second.id);
    adminIds.push(second.adminIdentityId);
    const [organizer] = await people.list(first.id);
    const one = await people.add(first.id, "  Persona de prueba  ", "manual");
    const two = await people.add(first.id, "Persona de prueba", "individual");
    const other = await people.add(second.id, "Otra partida", "manual");

    await t.test("crea y consulta desde una conexión independiente", async () => {
      assert.equal(organizer.identityId, first.adminIdentityId);
      assert.equal(organizer.source, "organizer");
      assert.equal(one.displayName, "Persona de prueba");
      assert.equal(one.status, "confirmed");
      assert.equal(one.activatedAt, null);
      assert.equal(two.status, "pending");
      assert.notEqual(one.id, two.id);
      const reader = openDevelopmentDatabase("test");
      try {
        assert.equal((await gameRepository(reader.db).get(first.id))?.timezone, "America/Bogota");
        assert.equal((await gameRepository(reader.db).listByOrganizer(first.adminIdentityId)).length, 1);
        assert.equal((await participantRepository(reader.db).list(first.id)).length, 3);
        assert.equal(await participantRepository(reader.db).get(first.id, other.id), null);
      } finally {
        await reader.close();
      }
    });

    await t.test("cierra inscripciones y resuelve una solicitud una sola vez", async () => {
      assert.equal((await game.update(first.id, { ...base, name: "Nombre nuevo" }))?.name, "Nombre nuevo");
      let queuedRegistration: Promise<unknown> | undefined;
      await db.transaction(async (tx) => {
        await tx.update(games).set({ state: "registrations_closed" }).where(eq(games.id, first.id));
        queuedRegistration = assert.rejects(people.add(first.id, "Concurrente", "manual"), /ya no admite/);
      });
      await queuedRegistration;
      await assert.rejects(people.add(first.id, "Inscripción tardía", "individual"), /ya no admite/);
      const decisions = await Promise.all([
        people.resolve(first.id, two.id, "confirmed"),
        people.resolve(first.id, two.id, "rejected"),
      ]);
      assert.equal(decisions.filter(Boolean).length, 1);
      assert.equal(await people.rename(first.id, other.id, "No se debe modificar"), null);
      assert.equal((await people.rename(first.id, one.id, "Participante editado"))?.displayName, "Participante editado");
      await db.update(games).set({ state: "drawn" }).where(inArray(games.id, [first.id]));
      assert.equal(await game.setRegistrations(first.id, true), null);
      assert.equal(await game.update(first.id, base), null);
      await assert.rejects(people.rename(first.id, one.id, "Fuera de etapa"), /ya no admite/);
    });

    await t.test("la base rechaza vínculos cruzados, duplicados y estados inválidos", async () => {
      await assert.rejects(db.insert(games).values({ ...base, adminIdentityId: first.adminIdentityId, budgetMax: 0 }), constraint("games_budget_range"));
      await assert.rejects(db.insert(participants).values({ gameId: first.id, identityId: first.adminIdentityId, displayName: "Duplicado", status: "confirmed", source: "manual" }), constraint("participants_game_identity_key"));
      await assert.rejects(db.insert(participants).values({
        gameId: second.id, identityId: first.adminIdentityId, displayName: "Organizador ajeno", status: "confirmed", source: "organizer",
      }), constraint("participants_organizer_identity_fk"));
      await assert.rejects(db.insert(participants).values({
        gameId: second.id, displayName: "Organizador sin identidad", status: "confirmed", source: "organizer",
      }), constraint("participants_organizer_confirmed"));
      await db.insert(wishlist).values({ participantId: one.id });
      await assert.rejects(db.insert(wishlist).values({ participantId: one.id }), constraint("wishlist_pkey"));
      const [a, b] = [one.id, two.id].sort();
      const [crossA, crossB] = [one.id, other.id].sort();
      await assert.rejects(db.insert(exclusions).values({
        gameId: first.id, participantA: crossA, participantB: crossB,
      }), constraint(crossA === other.id ? "exclusions_person_a_fk" : "exclusions_person_b_fk"));
      await db.insert(exclusions).values({ gameId: first.id, participantA: a, participantB: b });
      await assert.rejects(db.insert(exclusions).values({ gameId: first.id, participantA: b, participantB: a }), constraint("exclusions_canonical_order"));
      const [draw] = await db.insert(draws).values({ gameId: first.id, version: 1 }).returning();
      await assert.rejects(db.insert(draws).values({ gameId: first.id, version: 2 }), constraint("draws_one_current_idx"));
      const assignment = { gameId: first.id, drawId: draw.id, giverId: one.id, recipientId: two.id };
      await assert.rejects(db.insert(assignments).values({ ...assignment, recipientId: one.id }), constraint("assignments_no_self"));
      await assert.rejects(db.insert(assignments).values({ ...assignment, recipientId: other.id }), constraint("assignments_recipient_fk"));
      await db.insert(assignments).values(assignment);
      await assert.rejects(db.insert(assignments).values({ ...assignment, giverId: organizer.id }), constraint("assignments_draw_recipient_key"));
      await assert.rejects(db.insert(assignments).values({ ...assignment, recipientId: organizer.id }), constraint("assignments_draw_id_giver_id_pk"));
      const [reveal] = await db.insert(revealSessions).values({ gameId: first.id, drawId: draw.id }).returning();
      const turn = { revealSessionId: reveal.id, gameId: first.id, drawId: draw.id, recipientId: two.id, orderIndex: 0 };
      await assert.rejects(db.insert(revealTurns).values({ ...turn, guessId: other.id }), constraint("reveal_turns_guess_fk"));
      await assert.rejects(db.insert(revealTurns).values({ ...turn, status: "completed" }), constraint("reveal_turns_timing"));
      await assert.rejects(db.insert(revealTurns).values({ ...turn, recipientId: organizer.id }), constraint("reveal_turns_recipient_fk"));
      await assert.rejects(db.insert(revealTurns).values({ ...turn, gameId: second.id }), constraint("reveal_turns_session_fk"));
      await db.insert(revealTurns).values(turn);
      const expiresAt = new Date(Date.now() + 60_000);
      await assert.rejects(db.insert(invites).values({
        gameId: first.id, participantId: other.id, purpose: "activation", tokenHash: "fixture-hash", expiresAt,
      }), constraint("invites_participant_fk"));
      await assert.rejects(db.insert(sessions).values({
        gameId: first.id, identityId: first.adminIdentityId, tokenHash: "fixture-hash", expiresAt: new Date(0),
      }), constraint("sessions_timing"));
    });

    await t.test("sembrado idempotente y reinicio limitado a la partida ficticia", async () => {
      await Promise.all([seedDevelopmentFixtures(db), seedDevelopmentFixtures(db)]);
      const original = await people.list(fixtureGameId);
      assert.equal(original.length, 4);
      await seedDevelopmentFixtures(db);
      assert.deepEqual((await people.list(fixtureGameId)).map(({ id }) => id), original.map(({ id }) => id));
      await people.add(fixtureGameId, "Cambio de prueba", "manual");
      await Promise.all([seedDevelopmentFixtures(db, true), seedDevelopmentFixtures(db, true)]);
      assert.equal((await people.list(fixtureGameId)).length, 4);
      assert.equal((await people.list(second.id)).length, 1);
      assert.equal((await game.get(second.id))?.name, base.name);
    });
  } finally {
    try {
      if (gameIds.length) await db.delete(games).where(inArray(games.id, gameIds));
      if (adminIds.length) await db.delete(identities).where(inArray(identities.id, adminIds));
    } finally {
      await connection.close();
    }
  }
});
