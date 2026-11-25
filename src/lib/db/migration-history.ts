import type { MigrationMeta } from "drizzle-orm/migrator";

export function pendingMigrations(migrations: MigrationMeta[], rows: { hash: string; created_at: string | number }[]) {
  if (rows.length > migrations.length || rows.some((row, index) =>
    row.hash !== migrations[index].hash || Number(row.created_at) !== migrations[index].folderMillis)) {
    throw new Error("El historial de Drizzle no coincide con los archivos versionados.");
  }
  return migrations.slice(rows.length);
}
