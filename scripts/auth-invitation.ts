import { open, unlink } from "node:fs/promises";
import { and, eq, isNull } from "drizzle-orm";
import { issueControlledInvitation } from "../src/lib/auth/invitations";
import { openDevelopmentDatabase } from "../src/lib/db/connection";
import { fixtureGameId } from "../src/lib/db/development-fixtures";
import { games, participants } from "../src/lib/db/schema";

const fileName = ".env.auth-invitation";

async function main() {
  const origin = new URL(process.env.AUTH_ORIGIN ?? "");
  if (origin.origin !== process.env.AUTH_ORIGIN || !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) {
    throw new Error("La invitación de prueba requiere un origen local.");
  }
  const connection = openDevelopmentDatabase();
  try {
    const file = await open(fileName, "wx", 0o600);
    let written = false;
    try {
      const [fixture] = await connection.db.select({ id: participants.id, adminId: games.adminIdentityId })
        .from(participants).innerJoin(games, eq(games.id, participants.gameId)).where(and(
          eq(games.id, fixtureGameId), eq(games.name, "[Ficticia] Navidad de práctica"),
          eq(participants.displayName, "Luna de Ejemplo"), eq(participants.source, "manual"), isNull(participants.activatedAt),
        ));
      if (!fixture) throw new Error("Falta el participante ficticio.");
      const token = await issueControlledInvitation(connection.db, fixtureGameId, fixture.id, fixture.adminId);
      if (!token) throw new Error("No se pudo emitir la invitación.");
      await file.writeFile(`${origin.origin}/acceso/activar#${token}\n`);
      written = true;
    } finally {
      await file.close();
      if (!written) await unlink(fileName);
    }
    console.log("Invitación ficticia disponible en .env.auth-invitation.");
  } finally {
    await connection.close();
  }
}

void main().catch(() => {
  console.error("No se emitió la invitación. Revisa la configuración y el sembrado ficticio, y usa un archivo de invitación nuevo.");
  process.exitCode = 1;
});
