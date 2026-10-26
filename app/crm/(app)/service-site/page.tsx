import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { rub } from '@/lib/money';
import { SERVICE_FIELDS, serviceTexts } from '@/lib/site-settings';
import { DIRECTION_URLS } from '@/lib/site';
import { ActionDialog, ActionForm } from '@/components/crm/ActionForm';
import { serviceItemDeleteAction, serviceItemMoveAction, serviceItemSaveAction, serviceTextsAction } from '../../service-actions';

export const metadata = { title: 'Сайт сервиса' };

function ItemFields({ item }: { item?: { name: string; description: string | null; priceFrom: number | null; isPublished: boolean } }) {
  return (
    <>
      <label className="field">Название<input className="input" name="name" defaultValue={item?.name ?? ''} list="service-names" required /></label>
      <label className="field">Описание<textarea className="input" name="description" rows={3} defaultValue={item?.description ?? ''} /></label>
      <label className="field">Цена «от», ₽ (пусто — «по запросу»)<input className="input" name="priceFrom" inputMode="decimal" defaultValue={item?.priceFrom ? String(item.priceFrom / 100) : ''} /></label>
      <label className="check"><input type="checkbox" name="isPublished" defaultChecked={item?.isPublished ?? true} />Показывать на сайте</label>
    </>
  );
}

const SUGGEST = ['Плановое ТО', 'Диагностика', 'Замена масла и фильтров', 'Тормозная система', 'Подвеска', 'Шиномонтаж и хранение шин', 'Кузовной ремонт', 'Детейлинг и полировка', 'Защитная плёнка', 'Чип-тюнинг', 'Выхлопная система', 'Электрика', 'Кондиционер', 'Предпродажная подготовка'];

export default async function ServiceSite() {
  await requireUser('service.site');
  const [t, items] = await Promise.all([serviceTexts(), db.serviceItem.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })]);
  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <div className="toolbar">
        <h1>Сайт сервиса</h1>
        <div className="grow" />
        <a className="btn btn-quiet btn-sm" href={DIRECTION_URLS.service} target="_blank" rel="noreferrer">Открыть сайт</a>
      </div>

      <section className="card pad stack">
        <div className="row">
          <h2>Услуги · {items.length}</h2>
          <ActionDialog label="Добавить услугу" title="Новая услуга" action={serviceItemSaveAction} submit="Добавить" variant="primary">
            <ItemFields />
          </ActionDialog>
        </div>
        <datalist id="service-names">{SUGGEST.map((s) => <option key={s} value={s} />)}</datalist>
        {items.length ? (
          <ul className="list">
            {items.map((x, i) => (
              <li key={x.id} style={x.isPublished ? undefined : { opacity: 0.55 }}>
                <span style={{ flex: '2 1 260px' }}><strong>{x.name}</strong>{x.description ? <><br /><span className="text-2 small">{x.description}</span></> : null}</span>
                <span style={{ flex: '0 0 130px' }}>{x.priceFrom ? `от ${rub(x.priceFrom)}` : <span className="muted">по запросу</span>}</span>
                {!x.isPublished ? <span className="tag">скрыта</span> : null}
                <span className="wrap-row" style={{ gap: 4 }}>
                  {i > 0 ? <ActionForm action={serviceItemMoveAction} hidden={{ id: x.id, dir: 'up' }} submit="↑" variant="quiet" /> : null}
                  {i < items.length - 1 ? <ActionForm action={serviceItemMoveAction} hidden={{ id: x.id, dir: 'down' }} submit="↓" variant="quiet" /> : null}
                  <ActionDialog label="Изменить" title={x.name} action={serviceItemSaveAction} submit="Сохранить" hidden={{ id: x.id }}>
                    <ItemFields item={x} />
                  </ActionDialog>
                  <ActionForm action={serviceItemDeleteAction} hidden={{ id: x.id }} submit="Удалить" variant="danger" confirm={`Удалить услугу «${x.name}»?`} />
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="muted">Услуг пока нет — на сайте показывается текст из поля «Текст, когда услуги не добавлены».</p>}
      </section>

      <section className="stack" style={{ gap: 8 }}>
        <h2>Тексты страницы</h2>
        <p className="muted small">Очистите поле, чтобы вернуть текст по умолчанию. Телефон, адрес и часы — если пусто, берутся общие контакты CRAVE.</p>
        <ActionForm action={serviceTextsAction} submit="Сохранить тексты" className="card pad stack">
          {SERVICE_FIELDS.map((f) => (
            <label key={f.key} className="field">
              {f.label}
              {'multiline' in f && f.multiline ? <textarea className="input" name={f.key} rows={3} defaultValue={t[f.key]} placeholder={f.default} /> : <input className="input" name={f.key} defaultValue={t[f.key]} placeholder={f.default || 'общие контакты CRAVE'} />}
            </label>
          ))}
        </ActionForm>
      </section>
    </div>
  );
}
