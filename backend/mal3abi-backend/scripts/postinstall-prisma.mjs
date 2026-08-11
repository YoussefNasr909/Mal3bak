import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const shouldGenerate = process.env.PRISMA_GENERATE_ON_INSTALL === '1';

if (!shouldGenerate) {
  console.warn('[postinstall] Skipping automatic prisma generate. Use "npm run prisma:generate" or "npm run start:prod" when the environment is ready.');
  process.exit(0);
}

const env = { ...process.env };
if (!env.DATABASE_URL) {
  env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/mal3abk?schema=public';
}

const localPrisma = process.platform === 'win32'
  ? join(process.cwd(), 'node_modules', '.bin', 'prisma.cmd')
  : join(process.cwd(), 'node_modules', '.bin', 'prisma');

const command = existsSync(localPrisma)
  ? localPrisma
  : (process.platform === 'win32' ? 'npx.cmd' : 'npx');
const args = existsSync(localPrisma) ? ['generate'] : ['prisma', 'generate'];

const result = spawnSync(command, args, {
  stdio: 'inherit',
  env,
});

if (result.error) {
  console.error('[postinstall] prisma generate failed to start:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
