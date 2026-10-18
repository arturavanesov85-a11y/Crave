'use client';

import { useActionState, useEffect, useState } from 'react';
import { createOrderAction } from '../../../actions';

type V = { id: string; slug: string; title: string; published: boolean; driverPerHour: number | null };
type Q = { ok: boolean; error?: string; days?: number; tier?: { label: string }; dailyRate?: number; total?: number; deposit?: number; available?: boolean; includedKm?: number };

const rub = (k: number) => `${(k / 100).toLocaleString('ru-RU')} ₽`;

export function NewOrderForm({ vehicles, initial }: { vehicles: V[]; initial: { vehicleId: string; from: string; to: string; name: string; phone: string; leadId: string } }) {
  const [state, action, pending] = useActionState(createOrderAction, undefined);
  const [vehicleId, setVehicleId] = useState(initial.vehicleId);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [hours, setHours] = useState(0);
  const [q, setQ] = useState<Q | null>(null);
  const v = vehicles.find((x) => x.id === vehicleId);

  useEffect(() => {
    if (!v) return;
    const ctrl = new AbortController();
    fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: v.slug, from, to, services: hours ? [{ code: 'driver', qty: hours }] : [] }), signal: ctrl.signal })
      .then((r) => r.json())
      .then(setQ)
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [v, from, to, hours]);

  return (
    <form action={action} className="cols">
      <div className="main card pad stack">
        {initial.leadId ? <input type="hidden" name="leadId" value={initial.leadId} /> : null}
        <label className="field">Автомобиль
          <select className="input" name="vehicleId" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            {vehicles.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
        </label>
        <div className="grid-2 stack-sm">
          <label className="field">Получение<input className="input" type="datetime-local" name="from" value={from} onChange={(e) => setFrom(e.target.value)} required /></label>
          <label className="field">Возврат<input className="input" type="datetime-local" name="to" value={to} onChange={(e) => setTo(e.target.value)} required /></label>
        </div>
        <div className="grid-2 stack-sm">
          <label className="field">Имя клиента<input className="input" name="name" defaultValue={initial.name} required /></label>
          <label className="field">Телефон<input className="input" name="phone" type="tel" defaultValue={initial.phone} required placeholder="+7" /></label>
        </div>
        <div className="grid-2 stack-sm">
          <label className="field">E-mail (необязательно)<input className="input" name="email" type="email" /></label>
          <label className="field">Часов с водителем{v?.driverPerHour ? '' : ' (недоступно)'}<input className="input" name="driverHours" type="number" min={0} value={hours} disabled={!v?.driverPerHour} onChange={(e) => setHours(Math.max(0, Number(e.target.value) || 0))} /></label>
        </div>
        {state?.error ? <p className="error-text" role="alert">{state.error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={pending || (q ? !q.ok || q.available === false : false)}>{pending ? 'Создаём…' : 'Создать заказ с резервом'}</button>
        <p className="muted small">Заказ создаётся в статусе «Согласование» с временным резервом. Бронь подтверждается в карточке заказа.</p>
      </div>
      <aside className="aside card pad stack" style={{ gap: 8 }} aria-live="polite">
        <h2>Расчёт</h2>
        {!q ? <span className="muted">Считаем…</span> : !q.ok ? <span className="warn">{q.error}</span> : (
          <>
            {q.available === false ? <div className="notice warn">Автомобиль занят на эти даты (с учётом подготовки).</div> : <div className="notice ok">Свободен</div>}
            <div className="row"><span className="muted">Срок</span><span>{q.days} сут.</span></div>
            <div className="row"><span className="muted">Тариф</span><span>{q.tier?.label} · {rub(q.dailyRate!)}</span></div>
            <div className="row" style={{ fontWeight: 600, fontSize: 18 }}><span>Итого</span><span>{rub(q.total!)}</span></div>
            <div className="row"><span className="muted">Залог</span><span>{rub(q.deposit!)}</span></div>
            <div className="row"><span className="muted">Включено</span><span>{q.includedKm} км</span></div>
          </>
        )}
      </aside>
    </form>
  );
}
