import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { isIP } from "node:net";
import { cookies, headers } from "next/headers";
import { connectDatabase, webConnectionConfig, type Database } from "../db/connection";
import { configuredOrigin } from "./origin";
import { authorizeAccount } from "./authorization";

let database: Database | undefined;

export function authDatabase() {
  if (database) return database;
  const connection = connectDatabase(webConnectionConfig(), () => console.warn("database_idle_connection_closed"));
  if (process.env.VERCEL === "1") attachDatabasePool(connection.pool);
  database = connection.db;
  return database;
}

export async function mutationOrigin() {
  const config = configuredOrigin();
  const incoming = await headers();
  // Vercel owns this header. On other hosts use a shared bucket until a trusted proxy is configured.
  if (!config || incoming.get("origin") !== config) return null;
  const ip = process.env.VERCEL === "1" ? incoming.get("x-vercel-forwarded-for") : null;
  return ip && isIP(ip) ? ip : "shared";
}

function cookiePolicy() {
  const secure = process.env.NODE_ENV === "production" || configuredOrigin()?.startsWith("https://") === true;
  return {
    name: secure ? "__Host-amigo-session" : "amigo-session",
    options: { secure, httpOnly: true, sameSite: "lax" as const, path: "/" },
  };
}

export async function sessionToken() {
  return (await cookies()).get(cookiePolicy().name)?.value ?? "";
}

export async function writeSession(session: { token: string; temporary: boolean; expiresAt: Date }) {
  const { name, options } = cookiePolicy();
  (await cookies()).set(name, session.token, {
    ...options, ...(session.temporary ? {} : { expires: session.expiresAt }),
  });
}

export async function clearSessionCookie() {
  const { name, options } = cookiePolicy();
  (await cookies()).set(name, "", { ...options, maxAge: 0 });
}

export async function currentGame() {
  const token = await sessionToken();
  return token ? authorizeAccount(authDatabase(), token) : null;
}
