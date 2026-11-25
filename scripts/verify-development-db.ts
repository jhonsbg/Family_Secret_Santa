import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { openDevelopmentDatabase } from "../src/lib/db/connection";
import { gameRepository } from "../src/lib/db/games";
import { participantRepository } from "../src/lib/db/participants";
import { games, identities } from "../src/lib/db/schema";

async function verify() {
  const writer = openDevelopmentDatabase();
  const reader = openDevelopmentDatabase();
  const game = gameRepository(writer.db);
  const people = participantRepository(writer.db);
  const settings = { name: "[Ficticia] Validación E2.1", eventAt: new Date("2027-12-25T00:00:00Z"), budgetMin: 50000, budgetMax: 80000 };
  let created: Awaited<ReturnType<typeof game.create>> | undefined;
  try {
    const result = await writer.db.execute(sql`select current_setting('server_version_num') as version,
      (select count(*)::int from pg_tables where schemaname = 'public') as tables`);
    console.log("Conexión PostgreSQL disponible.", result.rows[0]);
    if (process.argv.includes("--inspect")) return;

    created = await game.create({ ...settings, organizerDisplayName: "Organizador de validación" });
    const person = await people.add(created.id, "Participante de validación", "individual");
    const persistedGame = gameRepository(reader.db);
    const persistedPeople = participantRepository(reader.db);
    assert.ok(await persistedGame.get(created.id));
    assert.equal((await persistedPeople.get(created.id, person.id))?.status, "pending");
    await game.update(created.id, { ...settings, name: "[Ficticia] Validación E2.1 editada" });
    await game.setRegistrations(created.id, false);
    const decisions = await Promise.all([
      people.resolve(created.id, person.id, "confirmed"),
      persistedPeople.resolve(created.id, person.id, "rejected"),
    ]);
    assert.equal(decisions.filter(Boolean).length, 1);
    assert.equal((await persistedPeople.get(created.id, person.id))?.status, decisions.find(Boolean)?.status);
    assert.equal((await persistedGame.get(created.id))?.name, "[Ficticia] Validación E2.1 editada");
    assert.equal((await persistedGame.get(created.id))?.state, "registrations_closed");
    console.log("Alta, lectura, cambios y concurrencia verificados desde conexiones independientes.");
  } finally {
    try {
      if (created) {
        const { id, adminIdentityId } = created;
        await writer.db.transaction(async (tx) => {
          await tx.delete(games).where(eq(games.id, id));
          await tx.delete(identities).where(eq(identities.id, adminIdentityId));
        });
        assert.equal(await gameRepository(reader.db).get(id), null);
        console.log("Partida temporal retirada.");
      }
    } finally {
      await Promise.all([writer.close(), reader.close()]);
    }
  }
}

void verify().catch(() => {
  console.error("Falló la validación. Revisa DATABASE_URL_DEV, las migraciones y los permisos de la rama.");
  process.exitCode = 1;
});
