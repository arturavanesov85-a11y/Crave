import { ActionForm } from '@/components/crm/ActionForm';
import { json } from '@/lib/db';
import { SALE_STATUS, SUPPLY } from '@/lib/sales';
import { toLocalInput } from '@/lib/dates';
import { saleCarSaveAction } from '../../sales-actions';
import { db } from '@/lib/db';
import { CAR_MODELS, COLOR_HINTS, DRIVE_HINTS, INTERIOR_HINTS, ENGINE_HINTS, TRANSMISSION_HINTS } from '@/lib/car-models';
import { CatalogFields } from './CatalogFields';
import { AVITO_COLORS, AVITO_OWNERS, avitoExtra } from '@/lib/avito';
import { PhotoInput } from '@/components/crm/PhotoInput';

/** Подсказки: справочник + всё, что уже вводилось в объявлениях и автопарке. */
async function hints() {
  const [sale, fleet] = await Promise.all([
    db.saleCar.findMany({ select: { make: true, model: true, engine: true, transmission: true, drive: true, color: true, colorInterior: true } }),
    db.vehicle.findMany({ select: { make: true, model: true, drive: true, colorExterior: true, colorInterior: true } }),
  ]);
  const models: Record<string, string[]> = Object.fromEntries(Object.entries(CAR_MODELS).map(([k, v]) => [k, [...v]]));
  for (const c of [...sale, ...fleet]) {
    const k = Object.keys(models).find((m) => m.toLowerCase() === c.make.toLowerCase()) ?? c.make;
    models[k] = [...new Set([...(models[k] ?? []), c.model])];
  }
  const uniq = (base: string[], extra: (string | null)[]) => [...new Set([...extra.filter((x): x is string => !!x), ...base])];
  return {
    models,
    engine: uniq(ENGINE_HINTS, sale.map((c) => c.engine)),
    transmission: uniq(TRANSMISSION_HINTS, sale.map((c) => c.transmission)),
    drive: uniq(DRIVE_HINTS, [...sale.map((c) => c.drive), ...fleet.map((c) => c.drive)]),
    color: uniq(COLOR_HINTS, [...sale.map((c) => c.color), ...fleet.map((c) => c.colorExterior)]),
    interior: uniq(INTERIOR_HINTS, [...sale.map((c) => c.colorInterior), ...fleet.map((c) => c.colorInterior)]),
  };
}

type Car = { id: string; make: string; model: string; year: number; mileageKm: number; price: number | null; priceVat: boolean; status: string; bodyType: string; powerHp: number | null; engine: string | null; transmission: string | null; drive: string | null; color: string | null; colorInterior: string | null; description: string | null; equipment: string | null; vin: string | null; note: string | null; title: string; avito: string | null; supply: string; etaAt: Date | null; etaNote: string | null } | null;

export async function SaleCarForm({ car, vehicles }: { car: Car; vehicles?: { id: string; title: string }[] }) {
  const v = (x: string | number | null | undefined) => (x == null ? '' : String(x));
  const h = await hints();
  const x = avitoExtra({ avito: car?.avito ?? null });
  const autoTitle = car ? [car.make, car.model, x.complectation].filter(Boolean).join(' ') : '';
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
        <div className="grid-2 stack-sm">
          <CatalogFields isNew={!car} init={{ make: v(car?.make), model: v(car?.model), year: v(car?.year), ...x, bodyType: car?.bodyType ?? '', powerHp: v(car?.powerHp), engine: v(car?.engine), transmission: v(car?.transmission), drive: v(car?.drive) }} />
          <label className="field">Пробег, км<input className="input" name="mileageKm" type="number" min={0} defaultValue={v(car?.mileageKm ?? 0)} /></label>
          <label className="field">Цвет кузова
            <select className="input" name="color" defaultValue={car?.color ?? ''}>
              <option value="">—</option>
              {car?.color && !AVITO_COLORS.includes(car.color) ? <option value={car.color}>{car.color} (не из списка Авито)</option> : null}
              {AVITO_COLORS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">Цвет салона<input className="input" name="colorInterior" list="dl-interior" autoComplete="off" placeholder="бежевый" defaultValue={v(car?.colorInterior)} /></label>
          <label className="field">Владельцев по ПТС
            <select className="input" name="owners" defaultValue={x.owners}><option value="">—</option>{AVITO_OWNERS.map((o) => <option key={o}>{o}</option>)}</select>
          </label>
          <label className="field">Состояние
            <select className="input" name="accident" defaultValue={x.accident}><option>Не битый</option><option>Битый</option></select>
          </label>
          <label className="field">Руль
            <select className="input" name="wheel" defaultValue={x.wheel}><option>Левый</option><option>Правый</option></select>
          </label>
          <label className="field">Название на сайте (пусто — марка, модель и комплектация)<input className="input" name="title" defaultValue={car && car.title !== autoTitle ? car.title : ''} placeholder={autoTitle || 'RAM 1500 TRX'} /></label>
        </div>
        <datalist id="dl-interior">{h.interior.map((x) => <option key={x} value={x} />)}</datalist>
        <label className="field">Описание<textarea className="input" name="description" rows={4} defaultValue={v(car?.description)} /></label>
        <label className="field">Комплектация — по одному пункту в строке. Строка с двоеточием на конце — заголовок группы («Салон и комфорт:»)<textarea className="input" name="equipment" rows={8} defaultValue={car ? json<string[]>(car.equipment, []).join('\n') : ''} /></label>
      </section>

      <section className="card pad stack">
        <h2>Фото</h2>
        <PhotoInput label="Добавить фото — можно несколько сразу. Перед отправкой фото уменьшаются прямо на телефоне или компьютере." />
      </section>

      <section className="card pad stack">
        <h2>Внутреннее</h2>
        <div className="grid-2 stack-sm">
          <label className="field">VIN (на сайте не показывается)<input className="input" name="vin" defaultValue={v(car?.vin)} /></label>
        </div>
        <label className="field">Заметка для сотрудников<textarea className="input" name="note" rows={2} defaultValue={v(car?.note)} /></label>
      </section>
    </ActionForm>
  );
}
