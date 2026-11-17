import Link from 'next/link';
import { CarPhoto } from './CarCard';
import { rub } from '@/lib/money';
import { BODY_LABEL } from '@/lib/site';
import type { toPublic } from '@/lib/sales';

type Car = ReturnType<typeof toPublic>;

/** Цена объявления; если в CRM отмечено «с НДС» — так и пишем перед суммой. */
export function salePrice(price: number | null, vat = false) {
  return price ? `${vat ? 'Цена с НДС ' : ''}${rub(price)}` : 'Цена по запросу';
}

export function SaleCarCard({ c }: { c: Car }) {
  return (
    <article className="card car">
      <Link href={`/auto/${c.slug}`} aria-label={c.title}><CarPhoto title={c.title} src={c.photos[0]} /></Link>
      <div className="car-body">
        <div className="row" style={{ alignItems: 'center' }}>
          <span className="eyebrow">{BODY_LABEL[c.bodyType] ?? c.bodyType} · {c.year}</span>
          {c.status === 'reserved' ? <span className="tag">Забронирован</span> : <span className="tag ok">В наличии</span>}
        </div>
        <h3>{c.title}</h3>
        <span className="text-2" style={{ fontSize: 14 }}>
          {c.mileageKm.toLocaleString('ru-RU')} км{c.powerHp ? ` · ${c.powerHp} л.с.` : ''}{c.engine ? ` · ${c.engine}` : ''}
        </span>
        <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--line)', fontSize: 20, fontWeight: 600 }}>{salePrice(c.price, c.priceVat)}</div>
        <Link className="btn btn-primary btn-sm" href={`/auto/${c.slug}`} style={{ minHeight: 46 }}>Подробнее</Link>
      </div>
    </article>
  );
}
