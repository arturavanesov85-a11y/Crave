// Создаёт .env из .env.example при первом запуске, если его нет.
import { copyFileSync, existsSync } from 'node:fs';

if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env');
  console.log('Создан .env из .env.example');
}
