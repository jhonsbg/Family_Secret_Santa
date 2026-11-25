import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { Client } from "pg";
import { releaseMigrationConfig } from "../src/lib/db/connection";
import { pendingMigrations } from "../src/lib/db/migration-history";

async function main() {
  const [target, ...options] = process.argv.slice(2);
  if (target !== "preview" && target !== "production") throw new Error();
  const apply = options.length === 2 && options[0] === "--apply" && options[1] === "--confirm=amigo_secreto_" + target;
  if (options.length && !apply) throw new Error();

  const client = new Client(releaseMigrationConfig(target));
  client.on("error", () => { process.exitCode = 1; });
  try {
    await client.connect();
    // Direct connection keeps this session-level lock across Drizzle's transaction.
    const { rows: [lock] } = await client.query("select pg_try_advisory_lock(10501, 51) as acquired");
    if (lock.acquired !== true) throw new Error();
    await client.query("set lock_timeout = '5s'");
    await client.query("set statement_timeout = '120s'");
    const { rows: [info] } = await client.query(`select
      to_regclass('drizzle.__drizzle_migrations') is not null as ledger,
      exists (select 1 from pg_tables where schemaname = 'public') as tables`);
    if (!info.ledger && info.tables) throw new Error();
    const applied = info.ledger
      ? (await client.query<{ hash: string; created_at: string }>("select hash, created_at from drizzle.__drizzle_migrations order by created_at")).rows
      : [];
    if (!applied.length && info.tables) throw new Error();
    const config = { migrationsFolder: "./drizzle" };
    const migrations = readMigrationFiles(config);
    const pending = pendingMigrations(migrations, applied);
    console.log("Entorno", target, "Aplicadas", applied.length, "Pendientes", pending.length);
    if (apply && pending.length) await migrate(drizzle(client), config);
    if (apply) {
      const { rows } = await client.query<{ hash: string; created_at: string }>(
        "select hash, created_at from drizzle.__drizzle_migrations order by created_at",
      );
      if (pendingMigrations(migrations, rows).length) throw new Error();
      console.log("Historial verificado tras la aplicación.");
    }
  } finally {
    await client.end();
  }
}

void main().catch(() => {
  console.error("Migración detenida. Verifica destino, acceso directo, exclusión mutua e historial antes de reintentar.");
  process.exitCode = 1;
});
