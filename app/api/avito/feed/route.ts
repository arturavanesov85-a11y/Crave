// Файл автозагрузки Авито. Адрес указывается в кабинете Авито → Автозагрузка.
// В файл попадают только машины, которые в CRM отправлены на Авито и не проданы:
// убрали из файла — Авито снимает объявление при следующей загрузке.
import { db } from '@/lib/db';
import { adFromCar, avitoAdXml, avitoProblems } from '@/lib/avito';
import { DIRECTION_URLS } from '@/lib/site';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const key = process.env.AVITO_FEED_KEY;
  if (key && new URL(req.url).searchParams.get('key') !== key) return new Response('Нет доступа', { status: 403 });
  const base = DIRECTION_URLS.sales.startsWith('http') ? DIRECTION_URLS.sales.replace(/\/$/, '') : new URL(req.url).origin;
  const cars = await db.saleCar.findMany({ where: { avitoStatus: 'live', status: { in: ['published', 'reserved'] } }, orderBy: { sortOrder: 'asc' } });
  const ads: string[] = [];
  for (const c of cars) {
    const ad = adFromCar(c);
    if ((await avitoProblems(c, ad)).length) continue;
    ads.push(await avitoAdXml(c, ad, (p) => `${base}/api/avito/photo${p.replace(/\.[a-z]+$/i, '')}.jpg`));
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Ads formatVersion="3" target="Avito.ru">\n${ads.join('\n')}\n</Ads>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } });
}
