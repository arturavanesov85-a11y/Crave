import { notFound } from 'next/navigation';
import Link from 'next/link';
import { publicVehicle } from '@/lib/catalog';
import { CarPhoto } from '@/components/site/CarCard';
import { BookingPanel } from '@/components/site/BookingPanel';
import { defaultDates } from '@/components/site/DateSearch';
import { rub } from '@/lib/money';
import { tierLabel } from '@/lib/pricing';
import { BODY_LABEL } from '@/lib/site';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: Props) {
  const v = await publicVehicle((await params).slug);
  if (!v) return {};
  return { title: `${v.title} — аренда`, description: `${v.title}: ${v.powerHp} л.с., ${v.accel} с до 100 км/ч. Цены по срокам аренды, залог, включённый пробег.` };
}

export default async function CarPage({ params, searchParams }: Props) {
  const v = await publicVehicle((await params).slug);
  if (!v) notFound();
  const sp = await searchParams;
  const def = defaultDates();
  const utm = Object.fromEntries(Object.entries(sp).filter(([k, val]) => k.startsWith('utm_') && val)) as Record<string, string>;
  const tiers = [...v.tariff.tiers].sort((a, b) => a.minDays - b.minDays);

  return (
    <div className="wrap" style={{ paddingTop: 24, paddingBottom: 72 }}>
      <nav className="small" style={{ marginBottom: 16 }}><Link href="/avtopark">← Автопарк</Link></nav>
      <div className="layout-2">
        <div className="main stack" style={{ gap: 28 }}>
          <div className="stack" style={{ gap: 10 }}>
            <CarPhoto title={v.title} rounded />
            <div className="grid-2" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              {['сзади', 'профиль', 'салон', 'панель'].map((a) => (
                <div key={a} className="photo" style={{ borderRadius: 10, fontSize: 11, padding: 6 }} role="img" aria-label={`Фото: ${a}`}>{a}</div>
              ))}
            </div>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <span className="eyebrow">{BODY_LABEL[v.bodyType]} · {v.year}</span>
            <h1 className="page-title">{v.title}</h1>
            <p className="text-2" style={{ fontSize: 17 }}>{v.description}</p>
          </div>

          <section className="stack" style={{ gap: 12 }}>
            <h2 className="section-title" style={{ fontSize: 28 }}>Характеристики</h2>
            <div className="facts">
              <div><b>{v.powerHp} л.с.</b><span className="muted small">мощность</span></div>
              <div><b>{v.accel} с</b><span className="muted small">разгон до 100 км/ч</span></div>
              <div><b>{v.drive}</b><span className="muted small">привод · автомат</span></div>
              <div><b>{v.fuel}</b><span className="muted small">топливо{v.seats ? ` · ${v.seats} мест` : ''}</span></div>
            </div>
            <p className="text-2 small">Кузов: {v.colorExterior}. Салон: {v.colorInterior}.</p>
            {v.equipment.length ? (
              <ul className="text-2" style={{ margin: 0, paddingLeft: 20, columns: '2 260px' }}>
                {v.equipment.map((e) => <li key={e}>{e}</li>)}
              </ul>
            ) : null}
          </section>

          <section className="stack" style={{ gap: 12 }}>
            <h2 className="section-title" style={{ fontSize: 28 }}>Тарифы</h2>
            <div className="tier-list">
              {tiers.map((t) => (
                <div className="tier-item" key={t.minDays}>
                  <span className="text-2">{tierLabel(t.minDays, tiers)}</span>
                  <span style={{ fontWeight: 600 }}>{rub(t.dailyRate)} <span className="muted small" style={{ fontWeight: 400 }}>/ сутки</span></span>
                </div>
              ))}
            </div>
            <div className="boxes">
              <div className="box"><span className="muted small">Включённый пробег</span><b>{v.tariff.includedKmPerDay} км / сутки</b><span className="text-2 small">Перепробег — {rub(v.tariff.overmileagePerKm)} / км</span></div>
              <div className="box gold"><span className="muted small">Залог</span><b>от {rub(v.tariff.deposit)}</b><span className="text-2 small">Не входит в стоимость, возвращается после аренды</span></div>
              <div className="box"><span className="muted small">С водителем</span><b>{v.tariff.driverPerHour ? `${rub(v.tariff.driverPerHour)} / час` : 'по согласованию'}</b></div>
            </div>
          </section>

          <section className="stack" style={{ gap: 8 }}>
            <h2 className="section-title" style={{ fontSize: 28 }}>Получение и возврат</h2>
            <p className="text-2">Возраст от 20 лет, стаж от 1,5 лет. Нужны паспорт и водительское удостоверение. Подробнее — в <Link href="/usloviya-arendy">условиях аренды</Link>.</p>
          </section>
        </div>

        <aside className="aside" style={{ position: 'sticky', top: 90 }}>
          <BookingPanel slug={v.slug} driverPerHour={v.tariff.driverPerHour} initialFrom={sp.from || def.from} initialTo={sp.to || def.to} utm={utm} />
        </aside>
      </div>
    </div>
  );
}
