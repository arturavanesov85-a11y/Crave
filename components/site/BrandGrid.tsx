// Логотипы марок: премиальные мировые бренды, из китайских — только Li и Zeekr.
// Знаки — из открытого набора Simple Icons (CC0); товарные знаки принадлежат их владельцам.
// Для марок, которых нет в наборе, показывается название в том же стиле.
import { siAstonmartin, siAudi, siBentley, siBmw, siCadillac, siFerrari, siJaguar, siLamborghini, siLandrover, siMaserati, siMclaren, siMercedes, siPorsche, siRollsroyce, siTesla } from 'simple-icons';

type Brand = { name: string; path?: string };

const BRANDS: Brand[] = [
  { name: 'Rolls-Royce', path: siRollsroyce.path },
  { name: 'Bentley', path: siBentley.path },
  { name: 'Ferrari', path: siFerrari.path },
  { name: 'Lamborghini', path: siLamborghini.path },
  { name: 'McLaren', path: siMclaren.path },
  { name: 'Aston Martin', path: siAstonmartin.path },
  { name: 'Maserati', path: siMaserati.path },
  { name: 'Porsche', path: siPorsche.path },
  { name: 'Mercedes-Benz', path: siMercedes.path },
  { name: 'BMW', path: siBmw.path },
  { name: 'Audi', path: siAudi.path },
  { name: 'Land Rover', path: siLandrover.path },
  { name: 'Jaguar', path: siJaguar.path },
  { name: 'Cadillac', path: siCadillac.path },
  { name: 'Tesla', path: siTesla.path },
  { name: 'Lexus' },
  { name: 'Genesis' },
  { name: 'Zeekr' },
  { name: 'Li Auto' },
];

export function BrandGrid({ title, note }: { title: string; note?: string }) {
  return (
    <section className="stack" style={{ gap: 14 }} aria-label={title}>
      <h3 className="eyebrow" style={{ fontSize: 13 }}>{title}</h3>
      <ul className="brand-grid">
        {BRANDS.map((b) => (
          <li key={b.name} className="brand-tile" title={b.name}>
            {b.path ? (
              <svg viewBox="0 0 24 24" width="36" height="36" role="img" aria-label={b.name} fill="currentColor"><path d={b.path} /></svg>
            ) : (
              <span className="brand-word" aria-label={b.name}>{b.name.toUpperCase()}</span>
            )}
            {b.path ? <span className="brand-name">{b.name}</span> : null}
          </li>
        ))}
      </ul>
      {note ? <p className="muted small">{note}</p> : null}
    </section>
  );
}
