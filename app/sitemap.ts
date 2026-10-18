import type { MetadataRoute } from 'next';
import { publicVehicles } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_ORIGIN || 'http://localhost:3000';
  const cars = await publicVehicles();
  return [
    ...['/', '/avtopark', '/ceny', '/usloviya-arendy', '/kontakty', '/auto', '/service'].map((p) => ({ url: base + p })),
    ...cars.map((c) => ({ url: `${base}/avtopark/${c.slug}` })),
  ];
}
