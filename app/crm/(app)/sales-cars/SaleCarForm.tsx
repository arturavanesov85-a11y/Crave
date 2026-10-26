import { ActionForm } from '@/components/crm/ActionForm';
import { json } from '@/lib/db';
import { SALE_STATUS } from '@/lib/sales';
import { saleCarSaveAction } from '../../sales-actions';
import { db } from '@/lib/db';
import { CAR_MODELS, COLOR_HINTS, DRIVE_HINTS, ENGINE_HINTS, TRANSMISSION_HINTS } from '@/lib/car-models';
import { MakeModelFields } from './MakeModelFields';

/** Подсказки: справочник + всё, что уже вводилось в объявлениях и автопарке. */
async function hints() {
  const [sale, fleet] = await Promise.all([
    db.saleCar.findMany({ select: { make: true, model: true, engine: true, transmission: true, drive: true, color: true } }),
    db.vehicle.findMany({ select: { make: true, model: true, drive: true, colorExterior: true } }),
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
  };
}

type Car = { id: string; make: string; model: string; year: number; mileageKm: number; price: number | null; status: string; bodyType: string; powerHp: number | null; engine: string | null; transmission: string | null; drive: string | null; color: string | null; description: string | null; equipment: string | null; vin: string | null; note: string | null; sortOrder: number } | null;

export async function SaleCarForm({ car, vehicles }: { car: Car; vehicles?: { id: string; title: string }[] }) {
  const v = (x: string | number | null | undefined) => (x == null ? '' : String(x));
  const h = await hints();
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
          <label className="field">Статус
            <select className="input" name="status" defaultValue={car?.status ?? 'draft'}>
              {Object.entries(SALE_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="field">Цена, ₽ (пусто — «цена по запросу»)<input className="input" name="price" inputMode="decimal" defaultValue={car?.price ? String(car.price / 100) : ''} /></label>
        </div>
        <p className="muted small">На сайте видны статусы «В продаже» и «Забронирован». Черновик и «Продан» скрыты.</p>
      </section>

      <section className="card pad stack">
        <h2>Автомобиль</h2>
        <div className="grid-2 stack-sm">
          <MakeModelFields make={v(car?.make)} model={v(car?.model)} models={h.models} required={!!car} />
          <label className="field">Год<input className="input" name="year" type="number" min={1950} max={2100} defaultValue={v(car?.year)} /></label>
          <label className="field">Пробег, км<input className="input" name="mileageKm" type="number" min={0} defaultValue={v(car?.mileageKm ?? 0)} /></label>
          <label className="field">Кузов
            <select className="input" name="bodyType" defaultValue={car?.bodyType ?? ''}>
              {!car ? <option value="">— как в выбранной машине —</option> : null}
              <option value="sedan">Седан</option><option value="suv">Внедорожник</option><option value="coupe">Купе</option><option value="pickup">Пикап</option>
            </select>
          </label>
          <label className="field">Мощность, л.с.<input className="input" name="powerHp" type="number" min={1} defaultValue={v(car?.powerHp)} /></label>
          <label className="field">Двигатель<input className="input" name="engine" list="dl-engine" autoComplete="off" placeholder="бензин, 3.0 л" defaultValue={v(car?.engine)} /></label>
          <label className="field">Коробка<input className="input" name="transmission" list="dl-transmission" autoComplete="off" placeholder="автомат" defaultValue={v(car?.transmission)} /></label>
          <label className="field">Привод<input className="input" name="drive" list="dl-drive" autoComplete="off" placeholder="полный" defaultValue={v(car?.drive)} /></label>
          <label className="field">Цвет<input className="input" name="color" list="dl-color" autoComplete="off" defaultValue={v(car?.color)} /></label>
        </div>
        <datalist id="dl-engine">{h.engine.map((x) => <option key={x} value={x} />)}</datalist>
        <datalist id="dl-transmission">{h.transmission.map((x) => <option key={x} value={x} />)}</datalist>
        <datalist id="dl-drive">{h.drive.map((x) => <option key={x} value={x} />)}</datalist>
        <datalist id="dl-color">{h.color.map((x) => <option key={x} value={x} />)}</datalist>
        <label className="field">Описание<textarea className="input" name="description" rows={4} defaultValue={v(car?.description)} /></label>
        <label className="field">Комплектация — по одному пункту в строке<textarea className="input" name="equipment" rows={5} defaultValue={car ? json<string[]>(car.equipment, []).join('\n') : ''} /></label>
      </section>

      <section className="card pad stack">
        <h2>Фото</h2>
        <label className="field">Добавить фото (можно несколько; сохраняются в WebP до 1600 px)
          <input className="input" style={{ paddingTop: 10 }} type="file" name="photos" accept="image/*" multiple />
        </label>
      </section>

      <section className="card pad stack">
        <h2>Внутреннее</h2>
        <div className="grid-2 stack-sm">
          <label className="field">VIN (на сайте не показывается)<input className="input" name="vin" defaultValue={v(car?.vin)} /></label>
          <label className="field">Порядок в каталоге (меньше — выше)<input className="input" name="sortOrder" type="number" defaultValue={v(car?.sortOrder ?? 0)} /></label>
        </div>
        <label className="field">Заметка для сотрудников<textarea className="input" name="note" rows={2} defaultValue={v(car?.note)} /></label>
      </section>
    </ActionForm>
  );
}
