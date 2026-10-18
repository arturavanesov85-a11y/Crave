// Отдельная тестовая база prisma/test.db: файл пересоздаётся перед каждым прогоном.
// Рабочая база prisma/dev.db не затрагивается.
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

export default function setup() {
  for (const f of ['test.db', 'test.db-journal']) rmSync(join(process.cwd(), 'prisma', f), { force: true });
  const env = { ...process.env, DATABASE_URL: 'file:./test.db', SEED_DEMO: '0' };
  execSync('npx prisma db push --skip-generate', { env, stdio: 'ignore' });
  execSync('npx tsx prisma/seed.ts', { env, stdio: 'ignore' });
}
