import { existsSync } from "node:fs";
import dotenv from "dotenv";

dotenv.config({ path: existsSync(".env.test") ? ".env.test" : ".env" });

process.env.FRONTEND_URL ||= "http://localhost:3000";
process.env.JWT_SECRET ||= "test-secret-key-12345";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-12345";

const defaultDevDatabaseUrl = "postgresql://postgres:omar@localhost:5432/mal3abk?schema=public";

function describeDatabaseUrl(raw) {
  try {
    const url = new URL(raw || "");
    const dbName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const port = url.port ? `:${url.port}` : "";
    return `${url.protocol}//${url.hostname}${port}/${dbName}`;
  } catch {
    return "<invalid DATABASE_URL>";
  }
}

function assertSafeTestDatabaseUrl(raw) {
  const url = new URL(raw || "");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const dbName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  const isPostgres = url.protocol === "postgres:" || url.protocol === "postgresql:";
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const isTestDatabase = /test/i.test(dbName);

  if (!isPostgres || !isLocal || !isTestDatabase) {
    throw new Error(
      `[jest] Refusing to run tests against a non-test database. DATABASE_URL must point to a local PostgreSQL test database. Current target: ${describeDatabaseUrl(raw)}`,
    );
  }
}

if (!process.env.DATABASE_URL?.includes("test")) {
  const current = process.env.DATABASE_URL || defaultDevDatabaseUrl;
  const url = new URL(current);
  // Robust pathname replacement
  url.pathname = url.pathname.replace(/_v\d+$/, "") + "_test";
  if (!url.searchParams.has("schema")) {
    url.searchParams.set("schema", "public");
  }
  process.env.DATABASE_URL = url.toString();
  console.log("JEST: Overriding DATABASE_URL to:", process.env.DATABASE_URL);
}

process.env.NODE_ENV = "test";
assertSafeTestDatabaseUrl(process.env.DATABASE_URL);
