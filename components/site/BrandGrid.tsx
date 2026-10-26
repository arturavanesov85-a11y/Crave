// Логотипы марок: премиальные мировые бренды, из китайских — только Li и Zeekr.
// Знаки — из открытого набора Simple Icons (CC0); товарные знаки принадлежат их владельцам.
// Для марок, которых нет в наборе, показывается название в том же стиле.
import { siAstonmartin, siAudi, siBentley, siBmw, siCadillac, siFerrari, siJaguar, siLamborghini, siLandrover, siMclaren, siMercedes, siPorsche, siRollsroyce, siTesla, siToyota, siVolkswagen } from 'simple-icons';

type Brand = { name: string; path?: string };

// Показываются в алфавитном порядке.
const BRANDS: Brand[] = [
  { name: 'Aston Martin', path: siAstonmartin.path },
  { name: 'Audi', path: siAudi.path },
  { name: 'Bentley', path: siBentley.path },
  { name: 'BMW', path: siBmw.path },
  { name: 'Cadillac', path: siCadillac.path },
  { name: 'Ferrari', path: siFerrari.path },
  { name: 'Jaguar', path: siJaguar.path },
  { name: 'Lamborghini', path: siLamborghini.path },
  { name: 'Land Rover', path: siLandrover.path },
  { name: 'Lexus' },
  { name: 'Li Auto' },
  { name: 'McLaren', path: siMclaren.path },
  { name: 'Mercedes-Benz', path: siMercedes.path },
  { name: 'Porsche', path: siPorsche.path },
  { name: 'Rolls-Royce', path: siRollsroyce.path },
  { name: 'Tesla', path: siTesla.path },
  { name: 'Toyota', path: siToyota.path },
  { name: 'Volkswagen', path: siVolkswagen.path },
  { name: 'Zeekr' },
].sort((a, b) => a.name.localeCompare(b.name, 'en'));

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
