import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { currentUser } from '@/lib/auth';
import { db, json } from '@/lib/db';
import { fmtDate } from '@/lib/dates';
import { rub } from '@/lib/money';
import { can } from '@/lib/permissions';
import { SUPPLY } from '@/lib/sales';
import { TgTop } from '@/components/tg/TgTop';
import { CarPhoto } from '@/components/site/CarCard';
import { TgLogin } from '@/components/tg/TgLogin';

export const dynamic = 'force-dynamic';

const TABS = ['stock', 'transit', 'order', 'drafts'] as const;
const TAB_LABEL: Record<string, string> = { ...SUPPLY, drafts: 'Черновики' };

export default async function TgCatalog({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await currentUser();
  if (!user) return <TgLogin />;
  if (!can(user, 'tg.app')) {
    if (can(user, 'tg.rental')) redirect('/tg/rental');
    return <div className="card pad stack" style={{ margin: 16 }}><h1 style={{ fontSize: 20 }}>Нет доступа</h1><p className="text-2">У вашей учётной записи нет права «Мини-приложение Telegram».</p></div>;
  }
  const sp = await searchParams;
  // Черновики — отдельной вкладкой и только руководителю автосалона и владельцу (право «Черновики»).
  const drafts = can(user, 'tg.drafts');
  const tabs = TABS.filter((t) => t !== 'drafts' || drafts);
  const tab = (tabs as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as (typeof TABS)[number]) : 'stock';
  const q = (sp.q ?? '').trim();
  const make = sp.make ?? '';

  const base: Prisma.SaleCarWhereInput = { status: { in: ['published', 'reserved'] } };
  const draftWhere: Prisma.SaleCarWhereInput = { status: 'draft' };
  const [counts, draftCount, all] = await Promise.all([
    db.saleCar.groupBy({ by: ['supply'], where: base, _count: true }),
    drafts ? db.saleCar.count({ where: draftWhere }) : 0,
    // При поиске — по всем вкладкам сразу: менеджеру важнее найти машину, чем помнить, где она.
    db.saleCar.findMany({ where: tab === 'drafts' ? draftWhere : q ? base : { ...base, supply: tab }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] }),
  ]);
  const makes = [...new Set(all.map((c) => c.make))].sort();
  // Каждое слово запроса должно встретиться: «bmw x5», «x5 2023», «камри черный».
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const cars = all.filter((c) => {
    if (make && c.make !== make) return false;
    const hay = `${c.make} ${c.model} ${c.title} ${c.year} ${c.color ?? ''} ${c.colorInterior ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ tab, ...(q ? { q } : {}), ...(make ? { make } : {}) });
    for (const [k, v] of Object.entries(patch)) (v ? p.set(k, v) : p.delete(k));
    return `/tg?${p}`;
  };

  return (
    <div className="stack" style={{ gap: 14, padding: '12px 14px 32px' }}>
      <TgTop user={user} active="sales" />

      <nav className="tg-tabs" aria-label="Наличие">
        {tabs.map((t) => (
          <Link key={t} href={link({ tab: t, make: '' })} aria-current={t === tab ? 'page' : undefined}>
            {TAB_LABEL[t]} <span className="muted">{t === 'drafts' ? draftCount : counts.find((c) => c.supply === t)?._count ?? 0}</span>
          </Link>
        ))}
      </nav>

      <form className="wrap-row" style={{ gap: 8 }}>
        <input type="hidden" name="tab" value={tab} />
        {make ? <input type="hidden" name="make" value={make} /> : null}
        <input className="input grow" name="q" defaultValue={q} placeholder="Поиск: марка, модель, год, цвет" style={{ minHeight: 44, flex: '1 1 200px' }} />
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
                    {c.status === 'reserved' ? <span className="tag">бронь</span> : c.status === 'draft' ? <span className="tag">черновик</span> : null}
                  </div>
                  <span className="text-2 small">{c.year} · {c.mileageKm.toLocaleString('ru-RU')} км{c.color ? ` · ${c.color}` : ''}</span>
                  {q && tab !== 'drafts' && c.supply !== tab ? <span className="muted small">{SUPPLY[c.supply]}</span> : null}
                  {c.supply !== 'stock' ? <span className="gold small">{c.etaAt ? `Прибытие ${fmtDate(c.etaAt)}` : c.etaNote ? `Срок: ${c.etaNote}` : SUPPLY[c.supply]}</span> : null}
                  <span style={{ fontWeight: 600, fontSize: 16 }}>{c.price ? `${rub(c.price)}${c.priceVat ? ' с НДС' : ''}` : 'Цена по запросу'}</span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="empty">{q || make ? 'Ничего не найдено — измените поиск.' : `В разделе «${TAB_LABEL[tab]}» пока пусто. Машины добавляются в CRM → «Авто в продаже».`}</div>
      )}
    </div>
  );
}
