import type { MetadataRoute } from 'next';
import { publicVehicles } from '@/lib/catalog';
import { publicSaleCars } from '@/lib/sales';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_ORIGIN || 'http://localhost:3000';
  const [cars, sale] = await Promise.all([publicVehicles(), publicSaleCars()]);
  return [
    ...['/', '/avtopark', '/ceny', '/usloviya-arendy', '/kontakty', '/auto', '/service'].map((p) => ({ url: base + p })),
    ...cars.map((c) => ({ url: `${base}/avtopark/${c.slug}` })),
    ...sale.map((c) => ({ url: `${base}/auto/${c.slug}` })),
  ];
}
