import Link from 'next/link';
import { publicVehicles } from '@/lib/catalog';
import { CarCard } from '@/components/site/CarCard';
import { DateSearch, defaultDates } from '@/components/site/DateSearch';
import { addMinutes, daysWord, parseLocal } from '@/lib/dates';
import { quote } from '@/lib/pricing';
import { loadSettings } from '@/lib/rules';
import { findConflict } from '@/lib/booking';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Автопарк', description: 'Премиальные автомобили в аренду: цены на ваши даты, залог и включённый пробег.' };

type SP = Promise<Record<string, string | undefined>>;

const BUDGETS: [string, string][] = [['', 'Любой'], ['lt25', 'до 25 000 ₽'], ['25_40', '25–40 тыс. ₽'], ['gt40', 'от 40 000 ₽']];
const BODIES: [string, string][] = [['', 'Все'], ['sedan', 'Седаны'], ['suv', 'Внедорожники'], ['coupe', 'Купе'], ['pickup', 'Пикапы']];

export default async function Catalog({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const def = defaultDates();
  const fromStr = sp.from || def.from, toStr = sp.to || def.to;
  const pickupAt = parseLocal(fromStr), returnAt = parseLocal(toStr);
  const [cars, settings] = await Promise.all([publicVehicles(), loadSettings()]);
  const brands = [...new Set(cars.map((c) => c.make))];

  const datesOk = !!pickupAt && !!returnAt && returnAt > pickupAt;
  const rows = await Promise.all(
    cars.map(async (v) => {
      if (!datesOk) return { v, calc: null };
      const q = quote({ pickupAt: pickupAt!, returnAt: returnAt!, tariff: v.tariff, rules: settings.rules });
      if (!q.ok) return { v, calc: null };
      const vehicle = await db.vehicle.findUnique({ where: { id: v.id }, select: { condition: true } });
      const busy = vehicle?.condition === 'unavailable' || !!(await findConflict(db, v.id, pickupAt!, addMinutes(returnAt!, settings.prepBufferMinutes), settings.prepBufferMinutes));
      return { v, calc: { days: q.days, tierLabel: q.tier.label, dailyRate: q.dailyRate, total: q.total, available: !busy } };
    }),
  );

  const filtered = rows.filter(({ v, calc }) => {
    if (sp.body && v.bodyType !== sp.body) return false;
    if (sp.brand && v.make !== sp.brand) return false;
    const rate = calc?.dailyRate ?? v.shortRate;
    if (sp.budget === 'lt25' && !(rate < 2500000)) return false;
    if (sp.budget === '25_40' && !(rate >= 2500000 && rate <= 4000000)) return false;
    if (sp.budget === 'gt40' && !(rate > 4000000)) return false;
    if (sp.free === '1' && calc && !calc.available) return false;
    return true;
  });

  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ from: fromStr, to: toStr, ...(sp.body ? { body: sp.body } : {}), ...(sp.brand ? { brand: sp.brand } : {}), ...(sp.budget ? { budget: sp.budget } : {}), ...(sp.free ? { free: sp.free } : {}) });
    for (const [k, val] of Object.entries(patch)) val ? p.set(k, val) : p.delete(k);
    return `/avtopark?${p}`;
  };
  const carQuery = new URLSearchParams({ from: fromStr, to: toStr }).toString();
  const days = filtered.find((r) => r.calc)?.calc?.days;

  return (
    <>
      <section style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap stack" style={{ paddingTop: 28, paddingBottom: 28 }}>
          <div>
            <h1 className="page-title">Автопарк</h1>
            <p className="text-2">Укажите даты — покажем, какие машины свободны и сколько стоит поездка.</p>
          </div>
          <DateSearch from={fromStr} to={toStr} body={sp.body} compact />
          {!datesOk ? <p className="error-text">Проверьте даты: возврат должен быть позже получения.</p> : null}
        </div>
      </section>

      <div className="wrap layout-2" style={{ paddingTop: 32, paddingBottom: 72 }}>
        <aside className="aside stack" aria-label="Фильтры" style={{ flex: '1 1 240px', gap: 24 }}>
          <div className="stack" style={{ gap: 10 }}>
            <span className="eyebrow">Тип кузова</span>
            <div className="wrap-row" style={{ gap: 8 }}>{BODIES.map(([k, l]) => <Link key={k} className={`chip${(sp.body ?? '') === k ? ' on' : ''}`} href={link({ body: k })}>{l}</Link>)}</div>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            <span className="eyebrow">Бюджет в сутки</span>
            <div className="wrap-row" style={{ gap: 8 }}>{BUDGETS.map(([k, l]) => <Link key={k} className={`chip${(sp.budget ?? '') === k ? ' on' : ''}`} href={link({ budget: k })}>{l}</Link>)}</div>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            <span className="eyebrow">Марка</span>
            <div className="wrap-row" style={{ gap: 8 }}>
              <Link className={`chip${!sp.brand ? ' on' : ''}`} href={link({ brand: '' })}>Все</Link>
              {brands.map((b) => <Link key={b} className={`chip${sp.brand === b ? ' on' : ''}`} href={link({ brand: b })}>{b}</Link>)}
            </div>
          </div>
          <Link className={`chip${sp.free === '1' ? ' on' : ''}`} href={link({ free: sp.free === '1' ? '' : '1' })} style={{ alignSelf: 'flex-start' }}>
            Только свободные на эти даты
          </Link>
        </aside>

        <section className="main stack" aria-label="Результаты">
          <p className="text-2">
            {filtered.length} из {cars.length} автомобилей{days ? ` · ${daysWord(days)} · цены посчитаны на весь срок` : ''}
          </p>
          {filtered.length ? (
            <div className="car-grid">{filtered.map(({ v, calc }) => <CarCard key={v.id} v={v} calc={calc} query={carQuery} />)}</div>
          ) : (
            <div className="empty">Под эти условия машин нет. Измените фильтры или <Link href="/kontakty#help">попросите менеджера помочь с выбором</Link>.</div>
          )}
          <p className="muted small">Расчёт предварительный: стоимость подтверждает менеджер. {settings.rules.assumptions.length ? 'Правила округления суток и предоплаты ещё не утверждены.' : ''}</p>
        </section>
      </div>
    </>
  );
}
