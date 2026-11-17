'use client';

// Фото объявления с перетаскиванием. Мышью тянется всё фото, на телефоне — за значок ⠿
// (чтобы касание фото не мешало прокрутке страницы). Первое фото — обложка.
// Порядок сохраняется сразу после того, как фото отпустили.
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ActionForm, type ActionState } from './ActionForm';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function PhotoSorter({ photos, action, hidden, editable = true }: { photos: string[]; action: Action; hidden: Record<string, string>; editable?: boolean }) {
  const [list, setList] = useState(photos);
  const [drag, setDrag] = useState<string | null>(null);
  const [msg, setMsg] = useState<ActionState>(undefined);
  const [saving, start] = useTransition();
  const router = useRouter();
  const grid = useRef<HTMLDivElement>(null);
  const before = useRef<string[]>(photos);

  const [touch, setTouch] = useState(false);
  useEffect(() => setList(photos), [photos]);
  useEffect(() => setTouch(window.matchMedia('(pointer: coarse)').matches), []);

  function save(order: string[]) {
    if (order.join('|') === before.current.join('|')) return;
    const fd = new FormData();
    for (const [k, v] of Object.entries(hidden)) fd.set(k, v);
    fd.set('op', 'reorder');
    fd.set('order', JSON.stringify(order));
    start(async () => {
      const res = await action(undefined, fd);
      setMsg(res);
      if (res?.error) setList(before.current);
      router.refresh();
    });
  }

  function onPointerDown(e: React.PointerEvent, url: string, fromHandle: boolean) {
    if (!editable || e.button !== 0) return;
    if (e.pointerType !== 'mouse' && !fromHandle) return; // на телефоне — только за значок
    if ((e.target as HTMLElement).closest('button, form')) return;
    e.preventDefault();
    before.current = list;
    setDrag(url);
    setMsg(undefined);
    let current = list;

    const move = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-photo]');
      const over = el?.dataset.photo;
      if (!over || over === url || !grid.current?.contains(el)) return;
      const from = current.indexOf(url), to = current.indexOf(over);
      if (from < 0 || to < 0) return;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, url);
      current = next;
      setList(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDrag(null);
      save(current);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  if (!list.length) return null;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {editable ? <p className="muted small">Перетащите фото, чтобы поменять порядок{touch ? ' — держите за значок ⠿' : ''}. Первое фото — обложка.</p> : null}
      <div ref={grid} className="photo-sorter">
        {list.map((p, i) => (
          <figure key={p} data-photo={p} className={`photo-tile${drag === p ? ' dragging' : ''}${editable ? ' editable' : ''}`} onPointerDown={(e) => onPointerDown(e, p, false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p} alt={`Фото ${i + 1}`} loading="lazy" draggable={false} className={i === 0 ? 'cover' : ''} />
            {editable ? <span className="photo-handle" aria-hidden="true" onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, p, true); }}>⠿</span> : null}
            <span className="photo-num">{i + 1}</span>
            {editable ? (
              <figcaption className="wrap-row" style={{ gap: 4 }}>
                {i === 0 ? <span className="tag gold">обложка</span> : <ActionForm action={action} hidden={{ ...hidden, photo: p, op: 'cover' }} submit="Сделать обложкой" variant="quiet" />}
                <ActionForm action={action} hidden={{ ...hidden, photo: p, op: 'remove' }} submit="Удалить" variant="danger" confirm="Удалить это фото?" />
              </figcaption>
            ) : i === 0 ? <span className="tag gold">обложка</span> : null}
          </figure>
        ))}
      </div>
      {saving ? <p className="muted small">Сохраняю порядок…</p> : msg?.error ? <p className="error-text" role="alert">{msg.error}</p> : msg?.ok ? <p className="gold small" role="status">{msg.ok}</p> : null}
    </div>
  );
}
