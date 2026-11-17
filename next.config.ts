import type { NextConfig } from 'next';

// Постоянные перенаправления со старых адресов WordPress (docs/00-audit.md).
const legacyCars = [
  ['/mercedes-amg-gt63-s', 'mercedes-amg-gt63-s'],
  ['/bmw-m5-f90-competition-stage', 'bmw-m5-f90-competition'],
  ['/porsche-cayenne-s-iii', 'porsche-cayenne-s-iii'],
  ['/mercedes-benz-g63-first-edition', 'mercedes-benz-g63-first-edition'],
  ['/bmw-m340i-xdrive-lci', 'bmw-m340i-xdrive-lci'],
  ['/bmw-540i', 'bmw-540i'],
  ['/dodge-ram-trx', 'dodge-ram-trx'],
  ['/toyota-land-cruiser-300-70th-anniversary', 'toyota-land-cruiser-300-70th-anniversary'],
];

const config: NextConfig = {
  // На сервере новая версия собирается в отдельную папку (NEXT_DIST_DIR=.next-new) и подменяет .next
  // только при перезапуске — пока идёт сборка, работающий сайт не теряет свои файлы.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Декодер HEIC (libheif на WebAssembly) грузится из node_modules как есть, без упаковки в бандл.
  serverExternalPackages: ['heic-decode', 'libheif-js'],
  async redirects() {
    return [
      { source: '/prajs', destination: '/ceny', permanent: true },
      { source: '/contact', destination: '/kontakty', permanent: true },
      { source: '/politika-konfidenczialnosti', destination: '/politika-konfidencialnosti', permanent: true },
      { source: '/en/:path*', destination: '/', permanent: true },
      ...legacyCars.map(([from, slug]) => ({ source: from, destination: `/avtopark/${slug}`, permanent: true })),
    ];
  },
  // Фото с телефона весят 5–10 МБ: без этих лимитов форма с несколькими фото обрезается
  // (middleware по умолчанию пропускает только 10 МБ тела запроса — ошибка «Unexpected end of form»).
  experimental: { serverActions: { bodySizeLimit: '300mb' }, middlewareClientMaxBodySize: '300mb' },
};

export default config;
