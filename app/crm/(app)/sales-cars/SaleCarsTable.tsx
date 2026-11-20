'use client';

// Список «Авто в продаже». Строку тянут за значок ⠿ — порядок сразу сохраняется
// и действует на сайте автосалона и в мини-приложении. Кнопки брони и продажи — прямо в строке.
import Link from 'next/link';
import type { ActionState } from '@/components/crm/ActionForm';
import { SaleDealButtons, type DealDefaults } from '@/components/crm/SaleDealButtons';
import { useRowOrder } from '@/components/crm/useRowOrder';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;
export type Row = {
  id: string; title: string; year: number; note: string | null; photo: string | null;
  status: string; statusLabel: string; supplyLine: string | null; price: string; vat: boolean; mileage: string; updated: string;
  dealLine: string | null; deal: DealDefaults;
};

export function SaleCarsTable({ rows, orderAction, dealAction }: { rows: Row[]; orderAction: Action; dealAction: Action }) {
  const { list, drag, msg, saving, body, onPointerDown } = useRowOrder(rows, orderAction);

  return (
    <>
      <p className="muted small" style={{ minHeight: 20 }}>
        {saving ? 'Сохраняю порядок…' : msg?.error ? <span className="error-text" role="alert">{msg.error}</span> : msg?.ok ? <span className="gold" role="status">{msg.ok}</span> : 'Чтобы поменять порядок показа на сайте и в приложении, перетащите строку за значок ⠿.'}
      </p>
      <div className="table-box">
        <table className="table">
          <thead><tr><th aria-label="Порядок" /><th>Фото</th><th>Автомобиль</th><th>Статус</th><th className="num">Цена</th><th className="num">Пробег</th><th>Обновлено</th><th aria-label="Действия" /></tr></thead>
          <tbody ref={body}>
            {list.map((c) => (
              <tr key={c.id} data-row={c.id} className={drag === c.id ? 'row-dragging' : undefined}>
                <td className="row-handle" title="Перетащите, чтобы поменять порядок" onPointerDown={(e) => onPointerDown(e, c.id)}>⠿</td>
                <td style={{ width: 96 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.photo ? <img src={c.photo} alt="" draggable={false} style={{ width: 84, height: 63, objectFit: 'cover', borderRadius: 6 }} /> : <span className="muted small">нет фото</span>}
                </td>
                <td><Link href={`/crm/sales-cars/${c.id}`} style={{ fontWeight: 600 }}>{c.title}</Link><div className="muted small">{c.year}{c.note ? ` · ${c.note}` : ''}</div></td>
                <td>
                  <span className={`tag ${c.status === 'published' ? 'ok' : c.status === 'reserved' ? 'gold' : ''}`}>{c.statusLabel}</span>
                  {c.supplyLine ? <div className="small gold">{c.supplyLine}</div> : null}
                  {c.dealLine ? <div className="small muted">{c.dealLine}</div> : null}
                </td>
                <td className="num">{c.price}{c.vat ? <div className="muted small">с НДС</div> : null}</td>
                <td className="num">{c.mileage}</td>
                <td className="small">{c.updated}</td>
                <td><SaleDealButtons carId={c.id} title={c.title} status={c.status} action={dealAction} d={c.deal} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length ? <p className="muted pad">Пока нет автомобилей. Нажмите «Добавить автомобиль».</p> : null}
      </div>
    </>
  );
}
