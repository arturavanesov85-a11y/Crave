import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { ActionForm } from '@/components/crm/ActionForm';
import { vehicleCreateAction } from '../../../actions';
import { HourlyToggle } from '@/components/crm/HourlyToggle';
import { BODY_LABEL } from '@/lib/site';

export const metadata = { title: 'Новый автомобиль' };

export default async function NewVehicle() {
  const user = await requireUser('fleet.write');
  const tariffs = can(user, 'tariff.edit');
  return (
    <>
      <Link href="/crm/vehicles" className="small">← Автомобили</Link>
      <h1>Новый автомобиль</h1>
      <ActionForm action={vehicleCreateAction} submit="Добавить автомобиль" className="stack" style={{ maxWidth: 820 }}>
        <section className="card pad stack">
          <h2>Автомобиль</h2>
          <div className="grid-2 stack-sm">
            <label className="field">Марка<input className="input" name="make" required placeholder="BMW" /></label>
            <label className="field">Модель<input className="input" name="model" required placeholder="M5 F90 Competition" /></label>
            <label className="field">Год<input className="input" name="year" type="number" min={1990} max={2100} required /></label>
            <label className="field">Тип кузова<select className="input" name="bodyType">{Object.entries(BODY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="field">Мощность, л.с.<input className="input" name="powerHp" type="number" min={1} required /></label>
            <label className="field">Разгон 0–100, с<input className="input" name="accel" placeholder="3,9" required /></label>
            <label className="field">Привод<select className="input" name="drive"><option value="полный">Полный</option><option value="задний">Задний</option><option value="передний">Передний</option></select></label>
            <label className="field">Топливо<select className="input" name="fuel"><option value="бензин">Бензин</option><option value="дизель">Дизель</option><option value="гибрид">Гибрид</option><option value="электро">Электро</option></select></label>
            <label className="field">Мест<input className="input" name="seats" type="number" min={1} max={9} defaultValue={5} /></label>
            <label className="field">Пробег, км<input className="input" name="mileageKm" type="number" min={0} defaultValue={0} /></label>
            <label className="field">Цвет кузова<input className="input" name="colorExterior" /></label>
            <label className="field">Цвет салона<input className="input" name="colorInterior" /></label>
            {can(user, 'vehicle.sensitive') ? (
              <>
                <label className="field">VIN<input className="input" name="vin" /></label>
                <label className="field">Госномер<input className="input" name="plate" /></label>
              </>
            ) : null}
          </div>
          <label className="field">Описание для сайта<textarea className="input" name="description" rows={3} /></label>
          <label className="field">Комплектация — по одному пункту в строке<textarea className="input" name="equipment" rows={4} /></label>
        </section>

        {tariffs ? (
          <section className="card pad stack">
            <h2>Тариф</h2>
            <p className="muted small">Цена за сутки по сроку аренды, в рублях. Без тарифа машина не показывается на сайте.</p>
            <HourlyToggle />
            <div className="grid-2 stack-sm daily-only" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              {[1, 3, 7, 14, 30].map((d) => <label key={d} className="field">{d === 1 ? '1–2 сут' : `от ${d} сут`}<input className="input" name={`t${d}`} inputMode="decimal" /></label>)}
            </div>
            <div className="grid-2 stack-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              <label className="field">Залог, ₽<input className="input" name="deposit" inputMode="decimal" defaultValue="50000" /></label>
              <label className="field daily-only">Км в сутки<input className="input" name="km" type="number" defaultValue={250} /></label>
              <label className="field daily-only">Перепробег, ₽/км<input className="input" name="overmileage" inputMode="decimal" defaultValue="150" /></label>
              <label className="field">С водителем, ₽/ч<input className="input" name="driver" inputMode="decimal" placeholder="нет" /></label>
            </div>
          </section>
        ) : <p className="notice">Тариф задаст руководитель — до этого машина не будет показана на сайте.</p>}

        <label className="check"><input type="checkbox" name="isPublished" defaultChecked />Показывать на сайте (если задан тариф)</label>
      </ActionForm>
    </>
  );
}
