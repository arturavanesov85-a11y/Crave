import Link from 'next/link';
import { CarFiles } from '@/components/crm/CarFiles';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { db, json } from '@/lib/db';
import { fmtDateTime } from '@/lib/dates';
import { SALE_STATUS } from '@/lib/sales';
import { DIRECTION_URLS } from '@/lib/site';
import { ActionForm } from '@/components/crm/ActionForm';
import { PhotoSorter } from '@/components/crm/PhotoSorter';
import { PhotoInput } from '@/components/crm/PhotoInput';
import { saleCarAvitoAction, saleCarDeleteAction, saleCarPhotoAction } from '../../../sales-actions';
import { adFromCar, avitoExtra, avitoProblems } from '@/lib/avito';
import { AvitoSection } from '../AvitoSection';
import { SaleCarForm } from '../SaleCarForm';
import { DealSection } from '../DealSection';
import { KpForm } from '../KpForm';

export const metadata = { title: 'Автомобиль в продаже' };

export default async function EditSaleCar({ params }: { params: Promise<{ id: string }> }) {
  await requireUser('sales.catalog');
  const car = await db.saleCar.findUnique({ where: { id: (await params).id } });
  if (!car) notFound();
  const photos = json<string[]>(car.photos, []);
  const onSite = ['published', 'reserved'].includes(car.status);
  const siteBase = DIRECTION_URLS.sales.replace(/\/$/, '');
  const problems = await avitoProblems(car, adFromCar(car));
  if (!onSite) problems.unshift('машина не опубликована на сайте');

  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <Link href="/crm/sales-cars" className="small">← Авто в продаже</Link>
      <div className="toolbar">
        <h1>{car.title}, {car.year}</h1>
        <span className={`tag ${onSite ? 'ok' : ''}`}>{SALE_STATUS[car.status]}</span>
        <div className="grow" />
        {onSite ? <a className="btn btn-quiet btn-sm" href={`${siteBase}/${car.slug}`} target="_blank" rel="noreferrer">Открыть на сайте</a> : <span className="muted small">не показывается на сайте</span>}
      </div>

      <DealSection car={car} />

      <KpForm carId={car.id} price={car.price} vat={car.priceVat} />

      <section className="card pad stack">
        <h2>Фото · {photos.length}</h2>
        {photos.length ? (
          <PhotoSorter photos={photos} action={saleCarPhotoAction} hidden={{ id: car.id }} />
        ) : <p className="muted">Фото пока нет.</p>}
        <ActionForm action={saleCarPhotoAction} hidden={{ id: car.id, op: 'upload' }} submit="Загрузить" className="wrap-row" style={{ gap: 8, alignItems: 'flex-end' }}>
          <div className="grow"><PhotoInput required label="Добавить фото — можно несколько сразу. Первое фото — обложка; новые встают в конец." /></div>
        </ActionForm>
        {photos.length > 1 ? (
          <ActionForm action={saleCarPhotoAction} hidden={{ id: car.id, op: 'platePhoto', on: car.platePhoto ? '0' : '1' }} submit={car.platePhoto ? 'Показывать последнее фото на сайте' : 'Последнее фото — только для Авито'} variant="quiet" className="wrap-row" style={{ gap: 8, alignItems: 'center' }}>
            <span className="small">{car.platePhoto ? <><span className="tag avito-tag">Только Авито</span> Последнее фото (с госномером) уходит только на Авито, на сайте и в КП его нет.</> : <span className="muted">Если машина на учёте, Авито требует фото с госномером: загрузите его последним и нажмите кнопку — на сайте оно не появится.</span>}</span>
          </ActionForm>
        ) : null}
      </section>

      <CarFiles carType="salecar" carId={car.id} canWrite />

      <SaleCarForm car={car} />

      <AvitoSection avitoId={avitoExtra(car).avitoId ?? ''} carId={car.id} status={car.avitoStatus} problems={problems} since={car.avitoSince ? fmtDateTime(car.avitoSince) : null} action={saleCarAvitoAction} />

      <section className="card pad stack" style={{ gap: 8 }}>
        <h2>Удаление</h2>
        <p className="muted small">Если машина продана — лучше поставить статус «Продан»: объявление исчезнет с сайта, но останется в CRM. Удаление необратимо.</p>
        <ActionForm action={saleCarDeleteAction} hidden={{ id: car.id }} submit="Удалить объявление" variant="danger" confirm={`Удалить объявление «${car.title}» вместе с загруженными фото? Это нельзя отменить.`} />
        <span className="muted small">Создано {fmtDateTime(car.createdAt)}{car.updatedAt ? ` · изменено ${fmtDateTime(car.updatedAt)}` : ''}</span>
      </section>
    </div>
  );
}
