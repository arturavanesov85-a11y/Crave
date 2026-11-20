'use client';

// Автомобили проката. Как в «Авто в продаже»: фото, статус на сайте, порядок показа —
// строку тянут за значок ⠿, порядок сразу действует на сайте проката.
import Link from 'next/link';
import type { ActionState } from '@/components/crm/ActionForm';
import { ActionForm } from '@/components/crm/ActionForm';
import { useRowOrder } from '@/components/crm/useRowOrder';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;
export type VehicleRow = {
  id: string; title: string; year: number; photo: string | null;
  published: boolean; siteNote: string | null; // почему не видна на сайте, хотя включена
  tariff: string;
  state: string; stateTone: 'ok' | 'warn' | ''; damages: number;
  current: { label: string; href: string | null; until: string; overdue: boolean } | null;
  next: { label: string; href: string | null; at: string } | null;
  mileage: string; docs: string | null; service: boolean; plate: string | null;
};

export function VehiclesTable({ rows, orderAction, publishAction, canWrite, showPlate }: { rows: VehicleRow[]; orderAction: Action; publishAction: Action; canWrite: boolean; showPlate: boolean }) {
  const { list, drag, msg, saving, body, onPointerDown } = useRowOrder(rows, orderAction);

  return (
    <>
      {canWrite ? (
        <p className="muted small" style={{ minHeight: 20 }}>
          {saving ? 'Сохраняю порядок…' : msg?.error ? <span className="error-text" role="alert">{msg.error}</span> : msg?.ok ? <span className="gold" role="status">{msg.ok}</span> : 'Чтобы поменять порядок показа на сайте, перетащите строку за значок ⠿.'}
        </p>
      ) : null}
      <div className="table-box">
        <table className="table">
          <thead><tr>{canWrite ? <th aria-label="Порядок" /> : null}<th>Фото</th><th>Автомобиль</th><th>На сайте</th><th>Состояние</th><th>Сейчас</th><th>Следующее</th><th className="num">Пробег</th><th>Документы и ТО</th>{showPlate ? <th>Госномер</th> : null}</tr></thead>
          <tbody ref={body}>
            {list.map((v) => (
              <tr key={v.id} data-row={v.id} className={drag === v.id ? 'row-dragging' : undefined}>
                {canWrite ? <td className="row-handle" title="Перетащите, чтобы поменять порядок" onPointerDown={(e) => onPointerDown(e, v.id)}>⠿</td> : null}
                <td style={{ width: 96 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {v.photo ? <img src={v.photo} alt="" draggable={false} style={{ width: 84, height: 63, objectFit: 'cover', borderRadius: 6 }} /> : <span className="muted small">нет фото</span>}
                </td>
                <td><Link href={`/crm/vehicles/${v.id}`} style={{ fontWeight: 600 }}>{v.title}</Link><div className="muted small">{v.year} · {v.tariff}</div></td>
                <td>
                  <span className={`tag ${v.published && !v.siteNote ? 'ok' : ''}`}>{v.published ? (v.siteNote ? 'Не видна' : 'Размещена') : 'Скрыта'}</span>
                  {v.siteNote ? <div className="warn small">{v.siteNote}</div> : null}
                  {canWrite ? <ActionForm action={publishAction} hidden={{ vehicleId: v.id, publish: v.published ? '0' : '1' }} submit={v.published ? 'Скрыть' : 'Разместить'} variant="quiet" /> : null}
                </td>
                <td><span className={`tag ${v.stateTone}`}>{v.state}</span>{v.damages ? <div className="warn small">повреждений: {v.damages}</div> : null}</td>
                <td className="small">{v.current ? <>{v.current.href ? <Link href={v.current.href}>{v.current.label}</Link> : v.current.label} · до {v.current.until}{v.current.overdue ? <div className="warn">просрочка</div> : null}</> : <span className="muted">свободен</span>}</td>
                <td className="small">{v.next ? <>{v.next.href ? <Link href={v.next.href}>{v.next.label}</Link> : v.next.label} · {v.next.at}</> : <span className="muted">—</span>}</td>
                <td className="num">{v.mileage}</td>
                <td className="small">{v.docs ? <span className="warn">{v.docs}</span> : null}{v.service ? <div className="warn">ТО скоро</div> : null}{!v.docs && !v.service ? <span className="muted">в порядке</span> : null}</td>
                {showPlate ? <td className="small">{v.plate ?? <span className="muted">—</span>}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length ? <p className="muted pad">Пока нет автомобилей. Нажмите «Добавить автомобиль».</p> : null}
      </div>
    </>
  );
}
