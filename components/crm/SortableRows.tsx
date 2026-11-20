'use client';

// Строки таблицы, которые тянут за значок ⠿. Ячейки рисует серверная страница,
// здесь — только перетаскивание и сохранение нового порядка через действие.
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionState } from '@/components/crm/ActionForm';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;
export type SortableRow = { id: string; cells: ReactNode };

export function SortableRows({ head, rows, action, hint, empty }: { head: ReactNode; rows: SortableRow[]; action?: Action; hint: string; empty?: ReactNode }) {
  const [list, setList] = useState(rows);
  const [drag, setDrag] = useState<string | null>(null);
  const [msg, setMsg] = useState<ActionState>(undefined);
  const [saving, start] = useTransition();
  const router = useRouter();
  const body = useRef<HTMLTableSectionElement>(null);
  const before = useRef(rows);
  useEffect(() => setList(rows), [rows]);

  function save(order: SortableRow[]) {
    if (!action || order.map((r) => r.id).join('|') === before.current.map((r) => r.id).join('|')) return;
    const fd = new FormData();
    fd.set('order', JSON.stringify(order.map((r) => r.id)));
    start(async () => {
      const res = await action(undefined, fd);
      setMsg(res);
      if (res?.error) setList(before.current);
      router.refresh();
    });
  }

  function onPointerDown(e: React.PointerEvent, id: string) {
    if (e.button !== 0) return;
    e.preventDefault();
    before.current = list;
    setDrag(id);
    setMsg(undefined);
    let current = list;
    const move = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-row]');
      const over = el?.dataset.row;
      if (!over || over === id || !body.current?.contains(el)) return;
      const from = current.findIndex((r) => r.id === id), to = current.findIndex((r) => r.id === over);
      if (from < 0 || to < 0) return;
      const next = [...current];
      next.splice(to, 0, ...next.splice(from, 1));
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

  return (
    <>
      {action ? (
        <p className="muted small" style={{ minHeight: 20 }}>
          {saving ? 'Сохраняю порядок…' : msg?.error ? <span className="error-text" role="alert">{msg.error}</span> : msg?.ok ? <span className="gold" role="status">{msg.ok}</span> : hint}
        </p>
      ) : null}
      <div className="table-box">
        <table className="table">
          <thead><tr>{action ? <th aria-label="Порядок" /> : null}{head}</tr></thead>
          <tbody ref={body}>
            {list.map((r) => (
              <tr key={r.id} data-row={r.id} className={drag === r.id ? 'row-dragging' : undefined}>
                {action ? <td className="row-handle" title="Перетащите, чтобы поменять порядок" onPointerDown={(e) => onPointerDown(e, r.id)}>⠿</td> : null}
                {r.cells}
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && empty ? <p className="muted pad">{empty}</p> : null}
      </div>
    </>
  );
}
