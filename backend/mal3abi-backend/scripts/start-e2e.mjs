const defaultE2eDatabaseUrl = "postgresql://postgres:omar@localhost:5432/mal3abk_test?schema=public";

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

function assertSafeE2eDatabaseUrl(raw) {
  const url = new URL(raw || "");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const dbName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  const isPostgres = url.protocol === "postgres:" || url.protocol === "postgresql:";
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const isTestDatabase = /test/i.test(dbName);

  if (!isPostgres || !isLocal || !isTestDatabase) {
    throw new Error(
      `[e2e] Refusing to start against a non-test database. DATABASE_URL must point to a local PostgreSQL test database. Current target: ${describeDatabaseUrl(raw)}`,
    );
  }
}

process.env.NODE_ENV = "test";
process.env.TZ ??= "Africa/Cairo";
process.env.HOST ??= "127.0.0.1";
process.env.PORT ??= "4000";
process.env.FRONTEND_URL ??= "http://127.0.0.1:3000,http://localhost:3000";
process.env.DATABASE_URL = process.env.E2E_DATABASE_URL || process.env.DATABASE_URL || defaultE2eDatabaseUrl;
process.env.JWT_SECRET ??= "test-secret-key-12345";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-12345";

assertSafeE2eDatabaseUrl(process.env.DATABASE_URL);

await import("../src/server.js");
