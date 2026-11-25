import { migrate } from "drizzle-orm/node-postgres/migrator";
import { openDevelopmentDatabase } from "../src/lib/db/connection";
import { seedDevelopmentFixtures } from "../src/lib/db/development-fixtures";

async function main() {
  const action = process.argv[2];
  if (action !== "migrate" && action !== "seed" && action !== "reset") {
    console.error("Acción requerida: migrate, seed o reset.");
    process.exitCode = 1;
    return;
  }

  let connection: ReturnType<typeof openDevelopmentDatabase>;
  try {
    connection = openDevelopmentDatabase();
  } catch (error) {
    // Connection validation errors contain only fixed messages, never URL components.
    console.error(error instanceof Error ? error.message : "Configuración inválida.");
    process.exitCode = 1;
    return;
  }

  try {
    if (action === "migrate") {
      await migrate(connection.db, { migrationsFolder: "./drizzle" });
      console.log("Migraciones de desarrollo aplicadas.");
    } else {
      await seedDevelopmentFixtures(connection.db, action === "reset");
      console.log(action === "reset" ? "Partida ficticia reiniciada." : "Partida ficticia disponible.");
    }
  } catch {
    console.error("Falló la operación de desarrollo. Verifica el acceso a la base y el estado de sus migraciones.");
    process.exitCode = 1;
  } finally {
    await connection.close();
  }
}

void main();
