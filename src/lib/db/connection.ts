import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

type DatabaseTarget = "development" | "test";
export type ReleaseTarget = "preview" | "production";
type Environment = Readonly<Record<string, string | undefined>>;

const release = {
  preview: { database: "amigo_secreto_preview", pooled: "DATABASE_URL_AUTH_PREVIEW", direct: "DATABASE_URL_MIGRATION_PREVIEW" },
  production: { database: "amigo_secreto_production", pooled: "DATABASE_URL_AUTH_PRODUCTION", direct: "DATABASE_URL_MIGRATION_PRODUCTION" },
} as const;

export function developmentConnectionConfig(
  target: DatabaseTarget,
  env: Readonly<Record<string, string | undefined>> = process.env,
): PoolConfig {
  const development = !env.NODE_ENV || env.NODE_ENV === "development";
  const testing = target === "test" && env.NODE_ENV === "test";
  if ((!development && !testing) || (env.VERCEL_ENV && env.VERCEL_ENV !== "development")) {
    throw new Error("La persistencia de E2.1 es exclusiva de desarrollo y pruebas locales.");
  }

  const variable = target === "test" ? "DATABASE_URL_TEST" : "DATABASE_URL_DEV";
  let url: URL;
  try {
    url = new URL(env[variable] ?? "");
  } catch {
    throw new Error(`Configura ${variable} con una URL PostgreSQL válida.`);
  }

  const database = target === "test" ? "amigo_secreto_test" : "Family_Secret_Santa";
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.pathname !== `/${database}`) {
    throw new Error(`${variable} debe apuntar a la base ${database}.`);
  }

  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const neon = url.hostname.endsWith(".neon.tech") && !url.hostname.includes("-pooler.");
  if (!(local || (target === "development" && neon))) {
    throw new Error("Usa PostgreSQL local o un endpoint directo de Neon para desarrollo.");
  }
  const sslMode = url.searchParams.get("sslmode");
  if (neon && sslMode && !["require", "verify-full"].includes(sslMode)) {
    throw new Error("La conexión a Neon requiere TLS con validación de certificado.");
  }

  try {
    return {
      host: url.hostname === "[::1]" ? "::1" : url.hostname,
      port: url.port ? Number(url.port) : 5432,
      database,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      // Use explicit TLS options so URL query parameters cannot weaken verification.
      ssl: neon ? { rejectUnauthorized: true } : false,
      enableChannelBinding: neon,
      connectionTimeoutMillis: 5000,
      max: 4,
    };
  } catch {
    throw new Error(`Revisa la codificación de las credenciales de ${variable}.`);
  }
}

function neonConnection(value: string | undefined, variable: string, pooled: boolean, database?: string): PoolConfig {
  let url: URL;
  try {
    url = new URL(value ?? "");
  } catch {
    throw new Error(`Configura ${variable}.`);
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !url.hostname.endsWith(".neon.tech") || url.hostname.split(".")[0].endsWith("-pooler") !== pooled
    || url.pathname.length < 2) {
    throw new Error(`${variable} requiere un endpoint ${pooled ? "agrupado" : "directo"} de Neon.`);
  }
  const sslMode = url.searchParams.get("sslmode");
  if (sslMode && !["require", "verify-full"].includes(sslMode)) {
    throw new Error("La conexión a Neon requiere TLS con validación de certificado.");
  }
  if (database && url.pathname !== "/" + database) throw new Error(`${variable} debe apuntar a la base ${database}.`);
  try {
    return {
      host: url.hostname, port: url.port ? Number(url.port) : 5432, database: decodeURIComponent(url.pathname.slice(1)),
      user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
      ssl: { rejectUnauthorized: true }, enableChannelBinding: true, connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 5000, max: pooled ? 3 : 1,
    };
  } catch {
    throw new Error(`Revisa la codificación de ${variable}.`);
  }
}

export function pooledAuthConnectionConfig(value: string | undefined): PoolConfig {
  return neonConnection(value, "DATABASE_URL_AUTH", true, "Family_Secret_Santa");
}

export function webConnectionConfig(env: Environment = process.env): PoolConfig {
  if (env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "production") {
    const target = release[env.VERCEL_ENV];
    return neonConnection(env[target.pooled], target.pooled, true, target.database);
  }
  if (env.NODE_ENV !== "development" || (env.VERCEL_ENV && env.VERCEL_ENV !== "development")) {
    throw new Error("Configura el entorno de ejecución de Vercel antes de conectar la aplicación.");
  }
  return env.DATABASE_URL_AUTH
    ? pooledAuthConnectionConfig(env.DATABASE_URL_AUTH)
    : developmentConnectionConfig("development", env);
}

export function releaseMigrationConfig(target: ReleaseTarget, env: Environment = process.env): PoolConfig {
  if (env.VERCEL === "1" || env.VERCEL_ENV) throw new Error("Ejecuta las migraciones desde un entorno de mantenimiento.");
  const config = release[target];
  const direct = neonConnection(env[config.direct], config.direct, false, config.database);
  const pooled = neonConnection(env[config.pooled], config.pooled, true, config.database);
  if (direct.host !== pooled.host?.replace(/-pooler(?=\.)/, "")) {
    throw new Error("Los endpoints de migración y tráfico deben pertenecer a la misma rama.");
  }
  return direct;
}

export function openDevelopmentDatabase(target: DatabaseTarget = "development") {
  return connectDatabase(developmentConnectionConfig(target));
}

export function connectDatabase(options: PoolConfig, onIdleError?: () => void) {
  const pool = new Pool(options);
  // node-postgres emits these errors outside any request when an idle connection drops.
  pool.on("error", () => onIdleError?.());
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

export type Database = ReturnType<typeof openDevelopmentDatabase>["db"];

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
