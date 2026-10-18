'use client';

// Калькулятор и заявка на странице автомобиля. Расчёт всегда приходит с сервера.
import { useActionState, useEffect, useMemo, useState } from 'react';
import { submitRentalRequest, type FormState } from '@/app/actions';

type QuoteResp =
  | { ok: false; error: string }
  | {
      ok: true;
      days: number;
      minutes: number;
      tier: { label: string };
      dailyRate: number;
      rent: number;
      services: { name: string; qty: number; unit: string; amount: number }[];
      servicesTotal: number;
      discount: number;
      total: number;
      payNow: number | null;
      remainder: number | null;
      deposit: number;
      includedKm: number;
      overmileagePerKm: number;
      assumptions: string[];
      available: boolean;
      pastPickup: boolean;
    };

const rub = (k: number) => `${(k / 100).toLocaleString('ru-RU')} ₽`;
const fmt = (s: string) => {
  const d = new Date(s + ':00+03:00');
  return d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export function BookingPanel({ slug, driverPerHour, initialFrom, initialTo, utm, vehicles }: { slug: string; driverPerHour: number | null; initialFrom: string; initialTo: string; utm?: Record<string, string>; vehicles?: { slug: string; title: string; driverPerHour: number | null }[] }) {
  const [car, setCar] = useState(slug);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [driver, setDriver] = useState(false);
  const [hours, setHours] = useState(4);
  const [q, setQ] = useState<QuoteResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [key, setKey] = useState('');
  const [state, action, pending] = useActionState<FormState, FormData>(submitRentalRequest, undefined);
  const driverRate = vehicles ? vehicles.find((v) => v.slug === car)?.driverPerHour ?? null : driverPerHour;

  useEffect(() => setKey(crypto.randomUUID()), []);
  useEffect(() => {
    if (!driverRate) setDriver(false);
  }, [driverRate]);

  const body = useMemo(() => JSON.stringify({ slug: car, from, to, services: driver ? [{ code: 'driver', qty: hours }] : [] }), [car, from, to, driver, hours]);
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: QuoteResp) => setQ(d))
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [body]);

  const ok = q && q.ok ? q : null;
  const canSend = !!ok && ok.available && !ok.pastPickup;

  return (
    <div className="calc">
      {vehicles ? (
        <label className="field">
          Автомобиль
          <select className="input" value={car} onChange={(e) => setCar(e.target.value)}>
            {vehicles.map((v) => <option key={v.slug} value={v.slug}>{v.title}</option>)}
          </select>
        </label>
      ) : null}
      <div className="grid-2 stack-sm">
        <label className="field">
          Получение
          <input className="input" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </label>
        <label className="field">
          Возврат
          <input className="input" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} required />
        </label>
      </div>

      <section className="card pad calc-lines" aria-live="polite" aria-busy={loading} style={{ opacity: loading ? 0.6 : 1 }}>
        {!q ? <span className="muted">Считаем…</span> : null}
        {q && !q.ok ? <span className="warn">{q.error}</span> : null}
        {ok ? (
          <>
            {!ok.available ? <div className="notice warn">Автомобиль занят на эти даты. Выберите другие даты или другой автомобиль.</div> : null}
            {ok.pastPickup ? <div className="notice warn">Время получения уже прошло.</div> : null}
            <div className="row"><span className="muted">Период</span><span style={{ textAlign: 'right' }}>{fmt(from)} — {fmt(to)}</span></div>
            <div className="row"><span className="muted">Оплачиваемый срок</span><span>{ok.days} сут.{ok.minutes % 1440 ? <span className="muted small"> ({Math.round(ok.minutes / 60)} ч)</span> : null}</span></div>
            <div className="row"><span className="muted">Тариф</span><span>{ok.tier.label} · {rub(ok.dailyRate)}</span></div>
            <hr className="hr" />
            <div className="row"><span>Аренда, {ok.days} × {rub(ok.dailyRate)}</span><span>{rub(ok.rent)}</span></div>
            {ok.services.map((s) => <div className="row" key={s.name}><span>{s.name}, {s.qty} {s.unit}</span><span>{rub(s.amount)}</span></div>)}
            {!ok.services.length ? <div className="row"><span className="muted">Услуги</span><span className="muted">не выбраны</span></div> : null}
            {ok.discount ? <div className="row"><span className="muted">Скидка</span><span>−{rub(ok.discount)}</span></div> : null}
            <hr className="hr" />
            <div className="row" style={{ fontSize: 20, fontWeight: 600 }}><span>Итого</span><span>{rub(ok.total)}</span></div>
            <div className="row"><span className="muted">К оплате сейчас</span><span className="gold" style={{ textAlign: 'right' }}>{ok.payNow == null ? 'сообщит менеджер' : rub(ok.payNow)}</span></div>
            {ok.remainder != null ? <div className="row"><span className="muted">Остаток</span><span>{rub(ok.remainder)}</span></div> : null}
            <div className="box gold" style={{ marginTop: 6 }}>
              <div className="row" style={{ fontWeight: 600 }}><span>Залог</span><span>от {rub(ok.deposit)}</span></div>
              <span className="text-2 small">Не входит в стоимость аренды. Возвращается при возврате автомобиля, 20 000 ₽ — через 21 день после проверки штрафов.</span>
            </div>
            <div className="row"><span className="muted">Включено</span><span>{ok.includedKm.toLocaleString('ru-RU')} км · сверх — {rub(ok.overmileagePerKm)} / км</span></div>
          </>
        ) : null}
      </section>

      <div className="stack" style={{ gap: 8 }}>
        <label className="check">
          <input type="checkbox" checked={driver} disabled={!driverRate} onChange={(e) => setDriver(e.target.checked)} />
          <span className="grow">С водителем</span>
          <span className="text-2">{driverRate ? `${rub(driverRate)} / час` : 'уточняйте у менеджера'}</span>
        </label>
        {driver ? (
          <label className="field" style={{ maxWidth: 200 }}>
            Часов с водителем
            <input className="input" type="number" min={1} max={240} value={hours} onChange={(e) => setHours(Math.max(1, Number(e.target.value) || 1))} />
          </label>
        ) : null}
      </div>

      <form action={action} className="card pad stack" style={{ gap: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Заявка на бронирование</h2>
        <input type="hidden" name="slug" value={car} />
        <input type="hidden" name="from" value={from} />
        <input type="hidden" name="to" value={to} />
        <input type="hidden" name="driverHours" value={driver ? hours : 0} />
        <input type="hidden" name="key" value={key} />
        {utm ? Object.entries(utm).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: -9999 }} />
        <label className="field">Имя<input className="input" name="name" required autoComplete="name" /></label>
        <label className="field">Телефон<input className="input" name="phone" type="tel" required autoComplete="tel" placeholder="+7" /></label>
        <label className="field">Комментарий<textarea className="input" name="comment" rows={2} /></label>
        <label className="check small"><input type="checkbox" name="consent" required />Согласен на обработку персональных данных</label>
        {state?.error ? <p className="error-text" role="alert">{state.error}</p> : null}
        <button className="btn btn-primary btn-block" type="submit" disabled={!canSend || pending || !key}>
          {pending ? 'Отправляем…' : 'Отправить заявку'}
        </button>
        <p className="muted small">Это заявка, а не подтверждённая бронь: менеджер проверит даты и свяжется с вами. {ok?.assumptions.length ? 'Расчёт предварительный.' : ''}</p>
      </form>
    </div>
  );
}
