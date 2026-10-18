// Полный сброс локальной базы: удаляет файл SQLite, создаёт схему и заполняет заново.
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

for (const f of ['dev.db', 'dev.db-journal']) rmSync(join(import.meta.dirname, f), { force: true });
execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });
execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' });
