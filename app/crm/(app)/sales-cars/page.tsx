import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { db, json } from '@/lib/db';
import { fmtDate } from '@/lib/dates';
import { rub } from '@/lib/money';
import { DEAL_KIND, SALE_STATUS, SUPPLY } from '@/lib/sales';
import { DIRECTION_URLS } from '@/lib/site';
import { saleCarOrderAction, saleDealAction } from '../../sales-actions';
import { SaleCarsTable, type Row } from './SaleCarsTable';

export const metadata = { title: 'Авто в продаже' };

export default async function SaleCars() {
  await requireUser('sales.catalog');
  const cars = await db.saleCar.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], include: { deals: { where: { status: 'active' }, orderBy: { createdAt: 'desc' }, take: 1 } } });
  const managerIds = [...new Set(cars.flatMap((c) => c.deals.map((d) => d.managerId)))];
  const managers = new Map((await db.user.findMany({ where: { id: { in: managerIds } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));

  const rows: Row[] = cars.map((c) => {
    const d = c.deals[0];
    return {
      id: c.id,
      title: c.title,
      year: c.year,
      note: c.note,
      photo: json<string[]>(c.photos, [])[0] ?? null,
      status: c.status,
      statusLabel: SALE_STATUS[c.status],
      supplyLine: c.supply !== 'stock' ? `${SUPPLY[c.supply]}${c.etaAt ? ` · ${fmtDate(c.etaAt)}` : c.etaNote ? ` · ${c.etaNote}` : ''}` : null,
      price: c.price ? rub(c.price) : 'по запросу',
      vat: c.priceVat,
      mileage: `${c.mileageKm.toLocaleString('ru-RU')} км`,
      updated: fmtDate(c.updatedAt ?? c.createdAt),
      dealLine: d ? `${DEAL_KIND[d.kind]}: ${d.clientName} · ${managers.get(d.managerId) ?? 'сотрудник'} · ${fmtDate(d.createdAt)}` : null,
      deal: d ? { clientName: d.clientName, clientPhone: d.clientPhone, price: d.price, priceVat: d.priceVat, note: d.note } : { price: c.price, priceVat: c.priceVat },
    };
  });

  return (
    <>
      <div className="toolbar">
        <h1>Авто в продаже</h1>
        <div className="grow" />
        <a className="btn btn-quiet btn-sm" href={DIRECTION_URLS.sales} target="_blank" rel="noreferrer">Открыть сайт автосалона</a>
        <Link className="btn btn-quiet btn-sm" href="/crm/sales-site">Тексты сайта</Link>
        <a className="btn btn-quiet btn-sm" href="/api/export/sales-cars" download>Выгрузить в Excel</a>
        <Link className="btn btn-primary btn-sm" href="/crm/sales-cars/new">Добавить автомобиль</Link>
      </div>
      <SaleCarsTable rows={rows} orderAction={saleCarOrderAction} dealAction={saleDealAction} />
    </>
  );
}
