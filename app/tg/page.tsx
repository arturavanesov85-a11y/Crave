import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { currentUser } from '@/lib/auth';
import { db, json } from '@/lib/db';
import { fmtDate } from '@/lib/dates';
import { rub } from '@/lib/money';
import { can } from '@/lib/permissions';
import { SUPPLY } from '@/lib/sales';
import { Logo } from '@/components/site/Logo';
import { CarPhoto } from '@/components/site/CarCard';
import { TgLogin } from '@/components/tg/TgLogin';

export const dynamic = 'force-dynamic';

const TABS = ['stock', 'transit', 'order'] as const;

export default async function TgCatalog({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await currentUser();
  if (!user) return <TgLogin />;
  if (!can(user, 'tg.app')) {
    return <div className="card pad stack" style={{ margin: 16 }}><h1 style={{ fontSize: 20 }}>Нет доступа</h1><p className="text-2">У вашей учётной записи нет права «Мини-приложение Telegram».</p></div>;
  }
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as (typeof TABS)[number]) : 'stock';
  const q = (sp.q ?? '').trim();
  const make = sp.make ?? '';

  const base: Prisma.SaleCarWhereInput = { status: { in: ['published', 'reserved'] } };
  const [counts, all] = await Promise.all([
    db.saleCar.groupBy({ by: ['supply'], where: base, _count: true }),
    db.saleCar.findMany({ where: { ...base, supply: tab }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] }),
  ]);
  const makes = [...new Set(all.map((c) => c.make))].sort();
  const cars = all.filter((c) => (!make || c.make === make) && (!q || `${c.title} ${c.year} ${c.color ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ tab, ...(q ? { q } : {}), ...(make ? { make } : {}) });
    for (const [k, v] of Object.entries(patch)) (v ? p.set(k, v) : p.delete(k));
    return `/tg?${p}`;
  };

  return (
    <div className="stack" style={{ gap: 14, padding: '12px 14px 32px' }}>
      <header className="row" style={{ alignItems: 'center' }}>
        <Logo variant="auto" height={40} />
        <span className="muted small" style={{ textAlign: 'right' }}>{user.fullName}</span>
      </header>

      <nav className="tg-tabs" aria-label="Наличие">
        {TABS.map((t) => (
          <Link key={t} href={link({ tab: t, make: '' })} aria-current={t === tab ? 'page' : undefined}>
            {SUPPLY[t]} <span className="muted">{counts.find((c) => c.supply === t)?._count ?? 0}</span>
          </Link>
        ))}
      </nav>

      <form className="wrap-row" style={{ gap: 8 }}>
        <input type="hidden" name="tab" value={tab} />
        {make ? <input type="hidden" name="make" value={make} /> : null}
        <input className="input grow" name="q" defaultValue={q} placeholder="Марка, модель, год, цвет" style={{ minHeight: 44, flex: '1 1 200px' }} />
        <button className="btn btn-quiet btn-sm" type="submit" style={{ minHeight: 44 }}>Найти</button>
      </form>

      {makes.length > 1 ? (
        <div className="tg-chips">
          <Link className={`chip${!make ? ' on' : ''}`} href={link({ make: '' })}>Все</Link>
          {makes.map((m) => <Link key={m} className={`chip${make === m ? ' on' : ''}`} href={link({ make: m })}>{m}</Link>)}
        </div>
      ) : null}

      {cars.length ? (
        <div className="tg-grid">
          {cars.map((c) => {
            const photo = json<string[]>(c.photos, [])[0];
            return (
              <Link key={c.id} href={`/tg/car/${c.id}`} className="card tg-card">
                <CarPhoto title={c.title} src={photo} />
                <div className="stack" style={{ gap: 4, padding: '10px 12px 12px' }}>
                  <div className="row" style={{ alignItems: 'center' }}>
                    <strong style={{ fontSize: 15 }}>{c.title}</strong>
                    {c.status === 'reserved' ? <span className="tag">бронь</span> : null}
                  </div>
                  <span className="text-2 small">{c.year} · {c.mileageKm.toLocaleString('ru-RU')} км{c.color ? ` · ${c.color}` : ''}</span>
                  {c.supply !== 'stock' ? <span className="gold small">{c.etaAt ? `Прибытие ${fmtDate(c.etaAt)}` : c.etaNote ? `Срок: ${c.etaNote}` : SUPPLY[c.supply]}</span> : null}
                  <span style={{ fontWeight: 600, fontSize: 16 }}>{c.price ? rub(c.price) : 'Цена по запросу'}</span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="empty">{q || make ? 'Ничего не найдено — измените поиск.' : `В разделе «${SUPPLY[tab]}» пока пусто. Машины добавляются в CRM → «Авто в продаже».`}</div>
      )}
    </div>
  );
}
