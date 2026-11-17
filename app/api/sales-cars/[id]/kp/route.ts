// КП в PDF из CRM: открывается в браузере, его можно сохранить или переслать.
// ?price=рубли&vat=1 — стоимость, которую указал менеджер; без price — цена из объявления.
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { buildKp, kpFileName } from '@/lib/kp-pdf';
import { parseRub } from '@/lib/money';
import { audit } from '@/lib/orders';
import { can } from '@/lib/permissions';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || !(can(user, 'sales.catalog') || can(user, 'tg.app'))) return new Response('Нет доступа', { status: 403 });
  const car = await db.saleCar.findUnique({ where: { id: (await params).id } });
  if (!car) return new Response('Автомобиль не найден', { status: 404 });
  const u = new URL(req.url);
  const raw = u.searchParams.get('price')?.trim();
  const price = raw ? parseRub(raw) : car.price;
  if (raw && !price) return new Response('Стоимость — только цифры, в рублях', { status: 400 });
  const vat = u.searchParams.has('price') ? u.searchParams.get('vat') === '1' : car.priceVat;
  const pdf = await buildKp(car, { price, vat });
  await audit(db, user.id, 'salecar.kp', 'salecar', car.id, { price, vat, via: 'crm' });
  const name = kpFileName(car);
  return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="kp.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'no-store' } });
}
