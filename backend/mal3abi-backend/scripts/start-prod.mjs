import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const env = { ...process.env };
const prismaBin = process.platform === 'win32'
  ? join(process.cwd(), 'node_modules', '.bin', 'prisma.cmd')
  : join(process.cwd(), 'node_modules', '.bin', 'prisma');
const nodeBin = process.execPath;
const generatedClientEntry = join(process.cwd(), 'node_modules', '.prisma', 'client', 'index.js');
const generatedClientEngine = join(process.cwd(), 'node_modules', '.prisma', 'client', 'query_engine-windows.dll.node');
const shouldRunMigrationsOnStart = /^(1|true|yes)$/i.test(
  String(env.RUN_PRISMA_MIGRATE_DEPLOY || env.PRISMA_MIGRATE_ON_START || ''),
);

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function hasUsableWindowsPrismaClient() {
  return process.platform === 'win32' && existsSync(generatedClientEntry) && existsSync(generatedClientEngine);
}

function run(label, args, { retries = 0 } = {}) {
  const command = existsSync(prismaBin) ? prismaBin : (process.platform === 'win32' ? 'npx.cmd' : 'npx');
  const finalArgs = existsSync(prismaBin) ? args : ['prisma', ...args];

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const result = spawnSync(command, finalArgs, { stdio: 'inherit', env });
    if (!result.error && result.status === 0) {
      return;
    }

    if (attempt < retries) {
      const nextAttempt = attempt + 2;
      console.warn(
        `[start:prod] ${label} failed on attempt ${attempt + 1}. Retrying (${nextAttempt}/${retries + 1})...`,
      );
      sleep(750);
      continue;
    }

    if (label === 'prisma generate' && hasUsableWindowsPrismaClient()) {
      console.warn(
        '[start:prod] prisma generate is still locked on Windows. Reusing the existing generated Prisma client for startup.',
      );
      return;
    }

    console.error(`[start:prod] ${label} failed`);
    process.exit(result.status ?? 1);
  }
}

run('prisma generate', ['generate'], {
  retries: process.platform === 'win32' ? 3 : 0,
});
if (shouldRunMigrationsOnStart) {
  run('prisma migrate deploy', ['migrate', 'deploy']);
} else {
  console.log('[start:prod] skipping prisma migrate deploy (set RUN_PRISMA_MIGRATE_DEPLOY=true to enable)');
}

const startResult = spawnSync(nodeBin, ['src/server.js'], { stdio: 'inherit', env });
if (startResult.error) {
  console.error('[start:prod] server failed to start:', startResult.error.message);
  process.exit(1);
}
process.exit(startResult.status ?? 0);
