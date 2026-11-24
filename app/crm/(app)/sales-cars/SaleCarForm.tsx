import { ActionForm } from '@/components/crm/ActionForm';
import { SALE_STATUS, SUPPLY } from '@/lib/sales';
import { toLocalInput } from '@/lib/dates';
import { saleCarSaveAction } from '../../sales-actions';
import { CarFields } from '@/components/crm/CarFields';
import { saleCarInit } from '@/lib/car-init';
import { PhotoInput } from '@/components/crm/PhotoInput';

type Car = { id: string; make: string; model: string; year: number; mileageKm: number; price: number | null; priceVat: boolean; status: string; bodyType: string; powerHp: number | null; engine: string | null; transmission: string | null; drive: string | null; color: string | null; colorInterior: string | null; description: string | null; equipment: string | null; vin: string | null; note: string | null; title: string; avito: string | null; supply: string; etaAt: Date | null; etaNote: string | null } | null;

export function SaleCarForm({ car, vehicles }: { car: Car; vehicles?: { id: string; title: string }[] }) {
  const v = (x: string | number | null | undefined) => (x == null ? '' : String(x));
  return (
    <ActionForm action={saleCarSaveAction} submit={car ? 'Сохранить' : 'Добавить автомобиль'} hidden={car ? { id: car.id } : undefined} className="stack">
      {!car && vehicles?.length ? (
        <section className="card pad stack" style={{ gap: 8 }}>
          <h2>Быстрое заполнение</h2>
          <label className="field">Взять характеристики и фото из автопарка проката
            <select className="input" name="copyFrom" defaultValue="">
              <option value="">— не копировать —</option>
              {vehicles.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
          </label>
          <p className="muted small">Пустые поля ниже заполнятся из выбранной машины. Заполненные вами — останутся как есть.</p>
        </section>
      ) : null}

      <section className="card pad stack">
        <h2>Объявление</h2>
        <div className="grid-2 stack-sm">
          {car && ['reserved', 'sold'].includes(car.status) ? (
            <label className="field">Статус
              <input className="input" value={SALE_STATUS[car.status]} readOnly disabled />
              <span className="muted small">Меняется в блоке «Сделка» выше</span>
            </label>
          ) : (
            <label className="field">Статус
              <select className="input" name="status" defaultValue={car?.status ?? 'draft'}>
                <option value="draft">{SALE_STATUS.draft}</option>
                <option value="published">{SALE_STATUS.published}</option>
              </select>
            </label>
          )}
          <div className="stack" style={{ gap: 4 }}>
            <label className="field">Цена, ₽ (пусто — «цена по запросу»)<input className="input" name="price" inputMode="decimal" defaultValue={car?.price ? String(car.price / 100) : ''} /></label>
            <label className="check"><input type="checkbox" name="priceVat" defaultChecked={!!car?.priceVat} />Цена с НДС — на сайте будет «Цена с НДС» перед суммой</label>
          </div>
        </div>
        <div className="grid-2 stack-sm">
          <label className="field">Наличие
            <select className="input" name="supply" defaultValue={car?.supply ?? 'stock'}>
              {Object.entries(SUPPLY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="field">Ожидаемая дата прибытия (для «в пути»)<input className="input" type="date" name="etaAt" defaultValue={car?.etaAt ? toLocalInput(car.etaAt).slice(0, 10) : ''} /></label>
          <label className="field">Срок поставки текстом<input className="input" name="etaNote" list="dl-eta" placeholder="6–8 недель" defaultValue={v(car?.etaNote)} /></label>
        </div>
        <datalist id="dl-eta"><option value="2–4 недели" /><option value="4–6 недель" /><option value="6–8 недель" /><option value="8–12 недель" /></datalist>
        <p className="muted small">На сайте автосалона видны только машины «В наличии» со статусом «В продаже» или «Забронирован». «В пути» и «Под заказ» — для сотрудников в мини-приложении Telegram.</p>
      </section>

      <section className="card pad stack">
        <h2>Автомобиль</h2>
        <CarFields kind="sale" isNew={!car} init={saleCarInit(car)} />
      </section>

      <section className="card pad stack">
        <h2>Фото</h2>
        <PhotoInput label="Добавить фото — можно несколько сразу. Перед отправкой фото уменьшаются прямо на телефоне или компьютере." />
      </section>

      <section className="card pad stack">
        <h2>Внутреннее</h2>
        <label className="field">Заметка для сотрудников<textarea className="input" name="note" rows={2} defaultValue={v(car?.note)} /></label>
      </section>
    </ActionForm>
  );
}
