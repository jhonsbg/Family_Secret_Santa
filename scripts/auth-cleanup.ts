import { cleanAuthHistory, retentionPolicy } from "../src/lib/auth/retention";
import { openDevelopmentDatabase } from "../src/lib/db/connection";

async function main() {
  const apply = process.argv.includes("--apply");
  const policy = retentionPolicy();
  const connection = openDevelopmentDatabase();
  try {
    const counts = await cleanAuthHistory(connection.db, policy, apply);
    console.log(apply ? "Registros eliminados." : "Vista previa, registros que cumplen la retención.", counts);
  } finally {
    await connection.close();
  }
}

void main().catch(() => {
  console.error("No se pudo revisar la retención de autenticación. Comprueba la configuración y la migración de desarrollo.");
  process.exitCode = 1;
});
