import { authPepper } from "../src/lib/auth/crypto";
import { configuredOrigin } from "../src/lib/auth/origin";
import { webConnectionConfig } from "../src/lib/db/connection";

try {
  if (process.env.VERCEL_ENV !== "preview" && process.env.VERCEL_ENV !== "production") throw new Error("Selecciona un entorno de Vercel.");
  if (process.versions.node.split(".")[0] !== "24") throw new Error("Selecciona Node.js 24.x en Vercel.");
  if (!configuredOrigin()?.startsWith("https://")) throw new Error("Configura un origen HTTPS canónico.");
  webConnectionConfig();
  authPepper();
  console.log("Configuración de compilación validada.");
} catch (error) {
  // All validations above expose fixed messages and environment variable names only.
  console.error(error instanceof Error ? error.message : "Configuración de compilación inválida.");
  process.exitCode = 1;
}
