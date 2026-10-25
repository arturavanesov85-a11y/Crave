import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { db, json } from '@/lib/db';
import { fmtDateTime } from '@/lib/dates';
import { SALE_STATUS } from '@/lib/sales';
import { DIRECTION_URLS } from '@/lib/site';
import { ActionForm } from '@/components/crm/ActionForm';
import { saleCarDeleteAction, saleCarPhotoAction } from '../../../sales-actions';
import { SaleCarForm } from '../SaleCarForm';

export const metadata = { title: 'Автомобиль в продаже' };

export default async function EditSaleCar({ params }: { params: Promise<{ id: string }> }) {
  await requireUser('sales.catalog');
  const car = await db.saleCar.findUnique({ where: { id: (await params).id } });
  if (!car) notFound();
  const photos = json<string[]>(car.photos, []);
  const onSite = ['published', 'reserved'].includes(car.status);
  const siteBase = DIRECTION_URLS.sales.replace(/\/$/, '');

  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <Link href="/crm/sales-cars" className="small">← Авто в продаже</Link>
      <div className="toolbar">
        <h1>{car.title}, {car.year}</h1>
        <span className={`tag ${onSite ? 'ok' : ''}`}>{SALE_STATUS[car.status]}</span>
        <div className="grow" />
        {onSite ? <a className="btn btn-quiet btn-sm" href={`${siteBase}/${car.slug}`} target="_blank" rel="noreferrer">Открыть на сайте</a> : <span className="muted small">не показывается на сайте</span>}
      </div>

      <section className="card pad stack">
        <h2>Фото · {photos.length}</h2>
        {photos.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
            {photos.map((p, i) => (
              <figure key={p} style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt={`Фото ${i + 1}`} style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 8, border: `2px solid ${i === 0 ? 'var(--gold)' : 'var(--line)'}` }} />
                <figcaption className="wrap-row" style={{ gap: 4 }}>
                  {i === 0 ? <span className="tag gold">обложка</span> : <ActionForm action={saleCarPhotoAction} hidden={{ id: car.id, photo: p, op: 'cover' }} submit="Обложка" variant="quiet" />}
                  {i > 0 ? <ActionForm action={saleCarPhotoAction} hidden={{ id: car.id, photo: p, op: 'left' }} submit="←" variant="quiet" /> : null}
                  {i < photos.length - 1 ? <ActionForm action={saleCarPhotoAction} hidden={{ id: car.id, photo: p, op: 'right' }} submit="→" variant="quiet" /> : null}
                  <ActionForm action={saleCarPhotoAction} hidden={{ id: car.id, photo: p, op: 'remove' }} submit="Удалить" variant="danger" confirm="Удалить это фото?" />
                </figcaption>
              </figure>
            ))}
          </div>
        ) : <p className="muted">Фото нет — добавьте ниже, в разделе «Фото».</p>}
      </section>

      <SaleCarForm car={car} />

      <section className="card pad stack" style={{ gap: 8 }}>
        <h2>Удаление</h2>
        <p className="muted small">Если машина продана — лучше поставить статус «Продан»: объявление исчезнет с сайта, но останется в CRM. Удаление необратимо.</p>
        <ActionForm action={saleCarDeleteAction} hidden={{ id: car.id }} submit="Удалить объявление" variant="danger" confirm={`Удалить объявление «${car.title}» вместе с загруженными фото? Это нельзя отменить.`} />
        <span className="muted small">Создано {fmtDateTime(car.createdAt)}{car.updatedAt ? ` · изменено ${fmtDateTime(car.updatedAt)}` : ''}</span>
      </section>
    </div>
  );
}
