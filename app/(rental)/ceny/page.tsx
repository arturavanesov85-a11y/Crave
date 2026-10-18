import Link from 'next/link';
import { publicVehicles } from '@/lib/catalog';
import { BookingPanel } from '@/components/site/BookingPanel';
import { defaultDates } from '@/components/site/DateSearch';
import { rub } from '@/lib/money';
import { tierLabel } from '@/lib/pricing';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Цены', description: 'Стоимость аренды премиальных автомобилей: расчёт на ваши даты и все тарифы.' };

export default async function Prices({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const cars = await publicVehicles();
  const mode = sp.mode === 'all' ? 'all' : 'calc';
  const def = defaultDates();
  const tiersOf = (t: { minDays: number; dailyRate: number }[]) => [...t].sort((a, b) => a.minDays - b.minDays);

  return (
    <div className="wrap stack" style={{ paddingTop: 32, paddingBottom: 72, gap: 24 }}>
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="page-title">Цены</h1>
        <p className="text-2">Стоимость за сутки зависит от срока аренды. Залог возвращается и в стоимость не входит.</p>
      </div>
      <nav className="seg" aria-label="Режим" style={{ alignSelf: 'flex-start' }}>
        <Link href="/ceny" aria-current={mode === 'calc' ? 'page' : undefined} style={{ minHeight: 44, display: 'flex', alignItems: 'center', padding: '0 16px', borderRadius: 7, color: mode === 'calc' ? 'var(--bg)' : 'var(--text-2)', background: mode === 'calc' ? 'var(--gold)' : undefined, fontWeight: mode === 'calc' ? 600 : 400 }}>Рассчитать стоимость</Link>
        <Link href="/ceny?mode=all" aria-current={mode === 'all' ? 'page' : undefined} style={{ minHeight: 44, display: 'flex', alignItems: 'center', padding: '0 16px', borderRadius: 7, color: mode === 'all' ? 'var(--bg)' : 'var(--text-2)', background: mode === 'all' ? 'var(--gold)' : undefined, fontWeight: mode === 'all' ? 600 : 400 }}>Все тарифы</Link>
      </nav>

      {mode === 'calc' ? (
        <div style={{ maxWidth: 560 }}>
          <BookingPanel slug={sp.car && cars.some((c) => c.slug === sp.car) ? sp.car : cars[0].slug} driverPerHour={null} initialFrom={def.from} initialTo={def.to} vehicles={cars.map((c) => ({ slug: c.slug, title: c.title, driverPerHour: c.tariff.driverPerHour }))} />
        </div>
      ) : (
        <div className="car-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {cars.map((c) => (
            <details key={c.id} className="card pad" open>
              <summary style={{ listStyle: 'none' }}>
                <div className="row"><strong style={{ fontSize: 17 }}>{c.title}</strong><span className="muted small">залог от {rub(c.tariff.deposit)}</span></div>
              </summary>
              <div className="stack" style={{ gap: 6, marginTop: 12 }}>
                {tiersOf(c.tariff.tiers).map((t) => (
                  <div className="row" key={t.minDays}><span className="text-2">{tierLabel(t.minDays, c.tariff.tiers)}</span><span style={{ fontWeight: 600 }}>{rub(t.dailyRate)}</span></div>
                ))}
                <hr className="hr" />
                <div className="row small"><span className="muted">Перепробег</span><span>{rub(c.tariff.overmileagePerKm)} / км</span></div>
                <div className="row small"><span className="muted">С водителем</span><span>{c.tariff.driverPerHour ? `${rub(c.tariff.driverPerHour)} / час` : 'уточняйте'}</span></div>
                <Link className="btn btn-sm" href={`/avtopark/${c.slug}`} style={{ marginTop: 8 }}>Рассчитать на мои даты</Link>
              </div>
            </details>
          ))}
        </div>
      )}
      <p className="muted small">Лимит пробега — 250 км в сутки. Цены перенесены с текущего сайта и ожидают подтверждения владельцем.</p>
    </div>
  );
}
