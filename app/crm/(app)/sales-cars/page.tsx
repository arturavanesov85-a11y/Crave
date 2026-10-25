import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { db, json } from '@/lib/db';
import { fmtDate } from '@/lib/dates';
import { rub } from '@/lib/money';
import { SALE_STATUS } from '@/lib/sales';
import { DIRECTION_URLS } from '@/lib/site';

export const metadata = { title: 'Авто в продаже' };

export default async function SaleCars() {
  await requireUser('sales.catalog');
  const cars = await db.saleCar.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
  return (
    <>
      <div className="toolbar">
        <h1>Авто в продаже</h1>
        <div className="grow" />
        <a className="btn btn-quiet btn-sm" href={DIRECTION_URLS.sales} target="_blank" rel="noreferrer">Открыть сайт автосалона</a>
        <Link className="btn btn-quiet btn-sm" href="/crm/sales-site">Тексты сайта</Link>
        <Link className="btn btn-primary btn-sm" href="/crm/sales-cars/new">Добавить автомобиль</Link>
      </div>
      <div className="table-box">
        <table className="table">
          <thead><tr><th>Фото</th><th>Автомобиль</th><th>Статус</th><th className="num">Цена</th><th className="num">Пробег</th><th>Обновлено</th></tr></thead>
          <tbody>
            {cars.map((c) => {
              const photo = json<string[]>(c.photos, [])[0];
              return (
                <tr key={c.id}>
                  <td style={{ width: 96 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {photo ? <img src={photo} alt="" style={{ width: 84, height: 63, objectFit: 'cover', borderRadius: 6 }} /> : <span className="muted small">нет фото</span>}
                  </td>
                  <td><Link href={`/crm/sales-cars/${c.id}`} style={{ fontWeight: 600 }}>{c.title}</Link><div className="muted small">{c.year}{c.note ? ` · ${c.note}` : ''}</div></td>
                  <td><span className={`tag ${c.status === 'published' ? 'ok' : c.status === 'sold' ? '' : c.status === 'reserved' ? 'gold' : ''}`}>{SALE_STATUS[c.status]}</span></td>
                  <td className="num">{c.price ? rub(c.price) : <span className="muted">по запросу</span>}</td>
                  <td className="num">{c.mileageKm.toLocaleString('ru-RU')} км</td>
                  <td className="small">{fmtDate(c.updatedAt ?? c.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!cars.length ? <p className="muted pad">Пока нет автомобилей. Нажмите «Добавить автомобиль».</p> : null}
      </div>
    </>
  );
}
