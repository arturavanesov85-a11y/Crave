import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Gallery } from '@/components/site/Gallery';
import { LeadForm } from '@/components/site/LeadForm';
import { salePrice } from '@/components/site/SaleCarCard';
import { publicSaleCar } from '@/lib/sales';
import { BODY_LABEL } from '@/lib/site';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: Props) {
  const c = await publicSaleCar((await params).slug);
  return c ? { title: `${c.title}, ${c.year}`, description: `${c.title} ${c.year} г., пробег ${c.mileageKm.toLocaleString('ru-RU')} км. ${salePrice(c.price)}.` } : {};
}

export default async function SaleCarPage({ params, searchParams }: Props) {
  const c = await publicSaleCar((await params).slug);
  if (!c) notFound();
  const sp = await searchParams;
  const specs: [string, string | null][] = [
    ['Год', String(c.year)],
    ['Пробег', `${c.mileageKm.toLocaleString('ru-RU')} км`],
    ['Кузов', BODY_LABEL[c.bodyType] ?? c.bodyType],
    ['Двигатель', c.engine],
    ['Мощность', c.powerHp ? `${c.powerHp} л.с.` : null],
    ['Коробка', c.transmission],
    ['Привод', c.drive],
    ['Цвет', c.color],
  ];
  return (
    <div className="wrap" style={{ paddingTop: 24, paddingBottom: 72 }}>
      <nav className="small" style={{ marginBottom: 16 }}><Link href="/auto#stock">← Автомобили в наличии</Link></nav>
      <div className="layout-2">
        <div className="main stack" style={{ gap: 28 }}>
          <Gallery title={c.title} photos={c.photos} />
          <div className="stack" style={{ gap: 8 }}>
            <span className="eyebrow">{BODY_LABEL[c.bodyType] ?? c.bodyType} · {c.year}{c.status === 'reserved' ? ' · забронирован' : ''}</span>
            <h1 className="page-title">{c.title}</h1>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{salePrice(c.price)}</div>
          </div>
          <section className="stack" style={{ gap: 12 }}>
            <h2 className="section-title" style={{ fontSize: 28 }}>Характеристики</h2>
            <dl className="facts" style={{ margin: 0 }}>
              {specs.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="muted small">{k}</dt><dd style={{ margin: 0, fontWeight: 600, fontSize: 18 }}>{v}</dd></div>)}
            </dl>
          </section>
          {c.description ? <p className="text-2" style={{ fontSize: 17, whiteSpace: 'pre-line' }}>{c.description}</p> : null}
          {c.equipment.length ? (
            <section className="stack" style={{ gap: 8 }}>
              <h2 className="section-title" style={{ fontSize: 28 }}>Комплектация</h2>
              <ul className="text-2" style={{ margin: 0, paddingLeft: 20, columns: '2 260px' }}>{c.equipment.map((e) => <li key={e}>{e}</li>)}</ul>
            </section>
          ) : null}
        </div>
        <aside className="aside" id="request" style={{ position: 'sticky', top: 90 }}>
          <LeadForm direction="sales" kind="purchase" back={`/auto/${c.slug}`} anchor="request" title="Узнать о покупке" intro={`${c.title}, ${c.year} · ${salePrice(c.price)}`} carValue={`${c.title}, ${c.year} (${c.slug})`} messageLabel="Вопрос или удобное время для звонка" submitLabel="Отправить заявку" sent={sp.sent === 'purchase'} />
        </aside>
      </div>
    </div>
  );
}
