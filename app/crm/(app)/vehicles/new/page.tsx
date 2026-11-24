import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { ActionForm } from '@/components/crm/ActionForm';
import { vehicleCreateAction } from '../../../actions';
import { HourlyToggle } from '@/components/crm/HourlyToggle';
import { CarFields } from '@/components/crm/CarFields';
import { vehicleInit } from '@/lib/car-init';

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
          <CarFields kind="rental" isNew init={vehicleInit(null)} showVin={can(user, 'vehicle.sensitive')} showPlate={can(user, 'vehicle.sensitive')} />
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
