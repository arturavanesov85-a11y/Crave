import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { db, json } from '@/lib/db';
import { fmtDate } from '@/lib/dates';
import { rub } from '@/lib/money';
import { can } from '@/lib/permissions';
import { SUPPLY } from '@/lib/sales';
import { BODY_LABEL } from '@/lib/site';
import { Gallery } from '@/components/site/Gallery';

export const dynamic = 'force-dynamic';

export default async function TgCar({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || !can(user, 'tg.app')) redirect('/tg');
  const c = await db.saleCar.findUnique({ where: { id: (await params).id } });
  if (!c || !['published', 'reserved'].includes(c.status)) notFound();
  const photos = json<string[]>(c.photos, []);
  const equipment = json<string[]>(c.equipment, []);
  const specs: [string, string | null][] = [
    ['Наличие', c.supply === 'stock' ? 'В наличии' : `${SUPPLY[c.supply]}${c.etaAt ? ` · прибытие ${fmtDate(c.etaAt)}` : ''}${c.etaNote ? ` · ${c.etaNote}` : ''}`],
    ['Год', String(c.year)],
    ['Пробег', `${c.mileageKm.toLocaleString('ru-RU')} км`],
    ['Кузов', BODY_LABEL[c.bodyType] ?? c.bodyType],
    ['Двигатель', c.engine],
    ['Мощность', c.powerHp ? `${c.powerHp} л.с.` : null],
    ['Коробка', c.transmission],
    ['Привод', c.drive],
    ['Цвет', c.color],
    ['VIN', can(user, 'vehicle.sensitive') || can(user, 'sales.catalog') ? c.vin : null],
  ];

  return (
    <div className="stack" style={{ gap: 16, padding: '12px 14px 32px' }}>
      <Link href="/tg" className="small">← Каталог</Link>
      <Gallery title={c.title} photos={photos} />
      <div className="stack" style={{ gap: 4 }}>
        <span className="eyebrow">{c.status === 'reserved' ? 'Забронирован' : SUPPLY[c.supply]}</span>
        <h1 style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.2 }}>{c.title}, {c.year}</h1>
        <div style={{ fontSize: 24, fontWeight: 600 }}>{c.price ? rub(c.price) : 'Цена по запросу'}</div>
      </div>
      <dl className="tg-specs">
        {specs.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}><dt className="muted small">{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      {c.description ? <p className="text-2" style={{ whiteSpace: 'pre-line' }}>{c.description}</p> : null}
      {equipment.length ? (
        <section className="stack" style={{ gap: 6 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600 }}>Комплектация</h2>
          <ul className="text-2" style={{ margin: 0, paddingLeft: 20 }}>{equipment.map((e) => <li key={e}>{e}</li>)}</ul>
        </section>
      ) : null}
      {c.note ? <div className="notice"><span className="muted small">Заметка для сотрудников</span><div style={{ whiteSpace: 'pre-line' }}>{c.note}</div></div> : null}
      {can(user, 'sales.catalog') ? <a className="btn btn-quiet btn-sm" href={`/crm/sales-cars/${c.id}`}>Открыть в CRM</a> : null}
    </div>
  );
}
