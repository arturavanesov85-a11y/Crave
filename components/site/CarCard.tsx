import Link from 'next/link';
import { rub } from '@/lib/money';
import { BODY_LABEL } from '@/lib/site';
import type { PublicVehicle } from '@/lib/catalog';
import { daysWord } from '@/lib/dates';

export function CarPhoto({ title, label = '3/4 спереди', rounded }: { title: string; label?: string; rounded?: boolean }) {
  return (
    <div className="photo" role="img" aria-label={`Фото: ${title}`} style={rounded ? { borderRadius: 16 } : undefined}>
      Фото: {title}, {label}
      <br />
      (место для реальной фотографии)
    </div>
  );
}

type Calc = { days: number; tierLabel: string; dailyRate: number; total: number; available: boolean } | null;

export function CarCard({ v, calc, query }: { v: PublicVehicle; calc?: Calc; query?: string }) {
  const href = `/avtopark/${v.slug}${query ? `?${query}` : ''}`;
  return (
    <article className="card car">
      <CarPhoto title={v.title} />
      <div className="car-body">
        <div className="row" style={{ alignItems: 'center' }}>
          <span className="eyebrow">{BODY_LABEL[v.bodyType] ?? v.bodyType}</span>
          {calc ? <span className={`tag ${calc.available ? 'ok' : ''}`}>{calc.available ? 'Свободен' : 'Занят в эти даты'}</span> : null}
        </div>
        <h3>{v.title}</h3>
        <span className="text-2" style={{ fontSize: 14 }}>
          {v.powerHp} л.с. · {v.accel} с до 100 км/ч · {v.year}
        </span>
        {calc ? (
          <dl className="price-dl">
            <dt>Тариф «{calc.tierLabel}»</dt>
            <dd>{rub(calc.dailyRate)} / сутки</dd>
            <dt className="total">Итого за {daysWord(calc.days)}</dt>
            <dd className="total">{rub(calc.total)}</dd>
            <dt>Залог, отдельно</dt>
            <dd className="text-2">от {rub(v.tariff.deposit)}</dd>
            <dt>Включено</dt>
            <dd className="text-2">{(v.tariff.includedKmPerDay * calc.days).toLocaleString('ru-RU')} км</dd>
          </dl>
        ) : (
          <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>
              {rub(v.shortRate)} <span className="text-2" style={{ fontSize: 14, fontWeight: 400 }}>/ сутки за 1–2 суток</span>
            </div>
            {v.from ? <div className="muted small">от {rub(v.from.dailyRate)} / сутки при аренде от {v.from.minDays} суток</div> : null}
          </div>
        )}
        <Link className={`btn btn-sm ${calc ? 'btn-primary' : ''}`} href={href} style={{ marginTop: 'auto', minHeight: 46 }}>
          {calc ? 'Подробнее и заявка' : 'Рассчитать на мои даты'}
        </Link>
      </div>
    </article>
  );
}
