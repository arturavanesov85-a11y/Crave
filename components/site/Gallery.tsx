'use client';

import { useRef, useState } from 'react';
import { CarPhoto } from './CarCard';

export function Gallery({ title, photos }: { title: string; photos: string[] }) {
  const [i, setI] = useState(0);
  const touch = useRef<number | null>(null);
  if (!photos.length) return <CarPhoto title={title} rounded />;
  const go = (d: number) => setI((x) => (x + d + photos.length) % photos.length);
  const arrow: React.CSSProperties = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: 999, border: '1px solid rgba(240,236,228,.25)', background: 'rgba(10,10,9,.6)', color: 'var(--text)', fontSize: 20 };
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div
        style={{ position: 'relative' }}
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current == null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          touch.current = null;
        }}
      >
        <CarPhoto title={`${title}, фото ${i + 1} из ${photos.length}`} src={photos[i]} rounded eager />
        {photos.length > 1 ? (
          <>
            <button type="button" aria-label="Предыдущее фото" onClick={() => go(-1)} style={{ ...arrow, left: 12 }}>‹</button>
            <button type="button" aria-label="Следующее фото" onClick={() => go(1)} style={{ ...arrow, right: 12 }}>›</button>
            <span className="small" style={{ position: 'absolute', right: 12, bottom: 12, padding: '2px 10px', borderRadius: 999, background: 'rgba(10,10,9,.7)' }}>{i + 1} / {photos.length}</span>
          </>
        ) : null}
      </div>
      {photos.length > 1 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 8 }}>
          {photos.map((p, idx) => (
            <button key={p} type="button" aria-label={`Фото ${idx + 1}`} aria-pressed={idx === i} onClick={() => setI(idx)} style={{ padding: 0, border: `2px solid ${idx === i ? 'var(--gold)' : 'transparent'}`, borderRadius: 10, background: 'none', overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p} alt="" loading="lazy" style={{ display: 'block', width: '100%', aspectRatio: '4 / 3', objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
