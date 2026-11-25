import assert from "node:assert/strict";
import { test } from "node:test";
import { configuredOrigin } from "../src/lib/auth/origin";
import { pendingMigrations } from "../src/lib/db/migration-history";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { developmentConnectionConfig, pooledAuthConnectionConfig, releaseMigrationConfig, webConnectionConfig } from "../src/lib/db/connection";

const neon = "postgresql://example:example@ep-example.us-east-2.aws.neon.tech/Family_Secret_Santa?sslmode=require";

test("Neon uses certificate validation and explicit development database", () => {
  const options = developmentConnectionConfig("development", { DATABASE_URL_DEV: neon });
  assert.equal(options.database, "Family_Secret_Santa");
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  assert.equal(options.enableChannelBinding, true);
});

test("production, pooler endpoints and insecure Neon TLS are rejected", () => {
  for (const environment of [{ NODE_ENV: "production" }, { VERCEL_ENV: "production" }, { VERCEL_ENV: "preview" }]) {
    assert.throws(() => developmentConnectionConfig("development", { ...environment, DATABASE_URL_DEV: neon }), /exclusiva de desarrollo/);
  }
  assert.throws(() => developmentConnectionConfig("development", { DATABASE_URL_DEV: neon.replace("ep-example.", "ep-example-pooler.") }), /endpoint directo/);
  assert.throws(() => developmentConnectionConfig("development", { DATABASE_URL_DEV: neon.replace("require", "disable") }), /TLS/);
  assert.throws(() => developmentConnectionConfig("development", { DATABASE_URL_DEV: neon.replace("Family_Secret_Santa", "neondb") }), /Family_Secret_Santa/);
  assert.throws(() => developmentConnectionConfig("development", { DATABASE_URL: neon }), /DATABASE_URL_DEV/);
});

test("integration tests can only connect to a dedicated loopback database", () => {
  const local = "postgresql://example@127.0.0.1:55432/amigo_secreto_test";
  assert.equal(developmentConnectionConfig("test", { DATABASE_URL_TEST: local }).ssl, false);
  assert.throws(() => developmentConnectionConfig("test", { DATABASE_URL_TEST: local.replace("127.0.0.1", "ep-example.neon.tech") }), /PostgreSQL local/);
  assert.throws(() => developmentConnectionConfig("test", { DATABASE_URL_TEST: local.replace("_test", "_dev") }), /amigo_secreto_test/);
});


test("web authentication requires pooled Neon with validated TLS", () => {
  const pooled = neon.replace("ep-example.", "ep-example-pooler.");
  assert.deepEqual(pooledAuthConnectionConfig(pooled).ssl, { rejectUnauthorized: true });
  assert.throws(() => pooledAuthConnectionConfig(neon), /endpoint agrupado/);
  assert.throws(() => pooledAuthConnectionConfig(pooled.replace("require", "disable")), /TLS/);
});

const previewDirect = neon.replace("Family_Secret_Santa", "amigo_secreto_preview");
const previewPool = previewDirect.replace("ep-example.", "ep-example-pooler.");
const productionPool = previewPool.replace("_preview", "_production").replace("ep-example-", "ep-production-");

test("Vercel selects the intended Neon database and has no development fallback", () => {
  assert.equal(webConnectionConfig({ VERCEL_ENV: "preview", DATABASE_URL_AUTH_PREVIEW: previewPool }).database, "amigo_secreto_preview");
  assert.equal(webConnectionConfig({ VERCEL_ENV: "production", DATABASE_URL_AUTH_PRODUCTION: productionPool }).database, "amigo_secreto_production");
  assert.throws(() => webConnectionConfig({ VERCEL_ENV: "preview", DATABASE_URL_DEV: neon }), /DATABASE_URL_AUTH_PREVIEW/);
  assert.throws(() => webConnectionConfig({ VERCEL_ENV: "preview", DATABASE_URL_AUTH_PREVIEW: productionPool }), /amigo_secreto_preview/);
  assert.throws(() => webConnectionConfig({ VERCEL_ENV: "production", DATABASE_URL_AUTH_PRODUCTION: previewPool }), /amigo_secreto_production/);
  assert.throws(() => webConnectionConfig({ NODE_ENV: "production", DATABASE_URL_AUTH: previewPool }), /Vercel/);
});

test("release migrations require matching direct and pooled endpoints outside deployments", () => {
  const env = { DATABASE_URL_MIGRATION_PREVIEW: previewDirect, DATABASE_URL_AUTH_PREVIEW: previewPool };
  assert.equal(releaseMigrationConfig("preview", env).host, "ep-example.us-east-2.aws.neon.tech");
  assert.throws(() => releaseMigrationConfig("preview", { ...env, VERCEL_ENV: "preview" }), /mantenimiento/);
  assert.throws(() => releaseMigrationConfig("preview", { ...env, DATABASE_URL_MIGRATION_PREVIEW: previewPool }), /directo/);
  assert.throws(() => releaseMigrationConfig("preview", { ...env, DATABASE_URL_MIGRATION_PREVIEW: neon }), /amigo_secreto_preview/);
  assert.throws(() => releaseMigrationConfig("preview", { ...env, DATABASE_URL_AUTH_PREVIEW: previewPool.replace("ep-example", "ep-other") }), /misma rama/);
});

test("web forms use one canonical HTTPS origin in releases", () => {
  assert.equal(configuredOrigin({ AUTH_ORIGIN: "http://localhost:3000", NODE_ENV: "development" }), "http://localhost:3000");
  assert.equal(configuredOrigin({ AUTH_ORIGIN: "http://localhost:3000", VERCEL_ENV: "production" }), null);
  assert.equal(configuredOrigin({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "amigo-preview.vercel.app" }), "https://amigo-preview.vercel.app");
  assert.equal(configuredOrigin({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "amigo-preview.vercel.app/elsewhere" }), null);
  assert.equal(configuredOrigin({ VERCEL_ENV: "preview", VERCEL_URL: "amigo-deployment.vercel.app" }), "https://amigo-deployment.vercel.app");
  assert.equal(configuredOrigin({ VERCEL_ENV: "production", VERCEL_URL: "amigo-deployment.vercel.app" }), null);
  for (const AUTH_ORIGIN of ["https://example.test/", "https://example.test/path", "https://example.test?q=1", "https://user@example.test", "file:///tmp/example"]) {
    assert.equal(configuredOrigin({ AUTH_ORIGIN, NODE_ENV: "production" }), null);
  }
});

test("migration inspection rejects modified, missing and divergent history", () => {
  const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
  const rows = migrations.map(({ hash, folderMillis }) => ({ hash, created_at: String(folderMillis) }));
  assert.equal(pendingMigrations(migrations, rows).length, 0);
  assert.equal(pendingMigrations(migrations, rows.slice(0, -1)).length, 1);
  assert.throws(() => pendingMigrations(migrations, rows.slice(1)), /historial/);
  assert.throws(() => pendingMigrations(migrations, [{ ...rows[0], hash: "invalid" }]), /historial/);
  assert.throws(() => pendingMigrations(migrations, [...rows, rows[0]]), /historial/);
});
