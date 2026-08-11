import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import dotenv from 'dotenv';

dotenv.config({ path: existsSync('.env.test') ? '.env.test' : '.env' });

const defaultDevDatabaseUrl = 'postgresql://postgres:omar@localhost:5432/mal3abk?schema=public';
let databaseUrl = process.env.DATABASE_URL || defaultDevDatabaseUrl;

function describeDatabaseUrl(raw) {
  try {
    const url = new URL(raw || '');
    const dbName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const port = url.port ? `:${url.port}` : '';
    return `${url.protocol}//${url.hostname}${port}/${dbName}`;
  } catch {
    return '<invalid DATABASE_URL>';
  }
}

function assertSafeTestDatabaseUrl(raw) {
  const url = new URL(raw || '');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const dbName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const isPostgres = url.protocol === 'postgres:' || url.protocol === 'postgresql:';
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const isTestDatabase = /test/i.test(dbName);

  if (!isPostgres || !isLocal || !isTestDatabase) {
    throw new Error(
      `[test:prepare] Refusing to prepare a non-test database. DATABASE_URL must point to a local PostgreSQL test database. Current target: ${describeDatabaseUrl(raw)}`,
    );
  }
}

if (!databaseUrl.includes('test')) {
  const url = new URL(databaseUrl);
  url.pathname = url.pathname.replace(/_v\d+$/, '') + '_test';
  if (!url.searchParams.has('schema')) {
    url.searchParams.set('schema', 'public');
  }
  if (!url.searchParams.has('connection_limit')) {
    url.searchParams.set('connection_limit', '100');
  }
  if (!url.searchParams.has('pool_timeout')) {
    url.searchParams.set('pool_timeout', '0');
  }
  databaseUrl = url.toString();
}

assertSafeTestDatabaseUrl(databaseUrl);

const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  JWT_SECRET: process.env.JWT_SECRET || 'test-secret-key-12345',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-12345',
};

const prismaBin = process.platform === 'win32'
  ? join(process.cwd(), 'node_modules', '.bin', 'prisma.cmd')
  : join(process.cwd(), 'node_modules', '.bin', 'prisma');
// On Windows, always use npx.cmd to avoid shell path-with-spaces issues when cwd contains spaces.
const command = process.platform === 'win32'
  ? 'npx.cmd'
  : (existsSync(prismaBin) ? prismaBin : 'npx');
const generatedClientEntry = join(process.cwd(), 'node_modules', '.prisma', 'client', 'index.js');
const generatedClientEngine = join(process.cwd(), 'node_modules', '.prisma', 'client', 'query_engine-windows.dll.node');

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function hasUsableWindowsPrismaClient() {
  return process.platform === 'win32' && existsSync(generatedClientEntry) && existsSync(generatedClientEngine);
}

function runPrismaCommand(args, label, { retries = 0 } = {}) {
  // On Windows we always use npx.cmd, so always prepend "prisma". On other platforms, only prepend when bin is absent.
  const finalArgs = (process.platform === 'win32' || !existsSync(prismaBin)) ? ["prisma", ...args] : args;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const result = spawnSync(command, finalArgs, {
      stdio: 'inherit',
      env,
      shell: process.platform === 'win32',
    });

    if (!result.error && result.status === 0) {
      return;
    }

    if (attempt < retries) {
      const nextAttempt = attempt + 2;
      console.warn(
        `[test:prepare] prisma ${label} failed on attempt ${attempt + 1}. Retrying (${nextAttempt}/${retries + 1})...`,
      );
      sleep(750);
      continue;
    }

    if (label === "generate" && hasUsableWindowsPrismaClient()) {
      console.warn(
        "[test:prepare] prisma generate is still locked on Windows. Reusing the existing generated Prisma client for this run.",
      );
      return;
    }

    console.error(`[test:prepare] prisma ${label} failed`);
    process.exit(result.status ?? 1);
  }
}

runPrismaCommand(["generate"], "generate", {
  retries: process.platform === 'win32' ? 3 : 0,
});
runPrismaCommand(["db", "push", "--accept-data-loss"], "db push --accept-data-loss");
