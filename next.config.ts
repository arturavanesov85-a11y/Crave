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
  async redirects() {
    return [
      { source: '/prajs', destination: '/ceny', permanent: true },
      { source: '/contact', destination: '/kontakty', permanent: true },
      { source: '/politika-konfidenczialnosti', destination: '/politika-konfidencialnosti', permanent: true },
      { source: '/en/:path*', destination: '/', permanent: true },
      ...legacyCars.map(([from, slug]) => ({ source: from, destination: `/avtopark/${slug}`, permanent: true })),
    ];
  },
  experimental: { serverActions: { bodySizeLimit: '25mb' } },
};

export default config;
