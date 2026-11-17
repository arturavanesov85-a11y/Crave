// Блок «Сделка» в карточке машины: текущая бронь или продажа, данные покупателя для ДКП, история.
import { db, json } from '@/lib/db';
import { fmtDateTime } from '@/lib/dates';
import { rub } from '@/lib/money';
import { formatPhone } from '@/lib/orders';
import { BUYER_FIELDS, DEAL_KIND, type Buyer } from '@/lib/sales';
import { ActionDialog, ActionForm } from '@/components/crm/ActionForm';
import { DealFields, SaleDealButtons } from '@/components/crm/SaleDealButtons';
import { saleDealAction } from '../../sales-actions';

const DEAL_STATUS: Record<string, string> = { active: 'действует', done: 'перешла в продажу', cancelled: 'отменена' };

export async function DealSection({ car }: { car: { id: string; title: string; status: string; price: number | null; priceVat: boolean } }) {
  const deals = await db.saleDeal.findMany({ where: { saleCarId: car.id }, orderBy: { createdAt: 'desc' } });
  const active = deals.find((d) => d.status === 'active');
  const ids = [...new Set(deals.flatMap((d) => [d.managerId, d.closedById ?? '']).filter(Boolean))];
  const names = new Map((await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
  const who = (id: string | null) => (id ? names.get(id) ?? 'сотрудник' : '—');
  const buyer = json<Buyer>(active?.buyer ?? null, {});
  const d = active ? { clientName: active.clientName, clientPhone: active.clientPhone, price: active.price, priceVat: active.priceVat, note: active.note } : { price: car.price, priceVat: car.priceVat };
  const history = deals.filter((x) => x !== active);

  return (
    <section className="card pad stack">
      <div className="row" style={{ alignItems: 'center' }}>
        <h2>Сделка</h2>
        <SaleDealButtons carId={car.id} title={car.title} status={car.status} action={saleDealAction} d={d} />
      </div>

      {active ? (
        <>
          <dl className="facts" style={{ margin: 0 }}>
            <div><dt className="muted small">{DEAL_KIND[active.kind]}</dt><dd>{fmtDateTime(active.createdAt)}</dd></div>
            <div><dt className="muted small">Менеджер</dt><dd>{who(active.managerId)}</dd></div>
            <div><dt className="muted small">Клиент</dt><dd>{active.clientName}{active.customerId ? <> · <a href={`/crm/customers/${active.customerId}`} className="small">карточка</a></> : null}</dd></div>
            <div><dt className="muted small">Телефон</dt><dd><a href={`tel:+${active.clientPhone}`}>{formatPhone(active.clientPhone)}</a></dd></div>
            <div><dt className="muted small">Стоимость</dt><dd>{rub(active.price)}{active.priceVat ? ' с НДС' : ''}</dd></div>
          </dl>
          {active.note ? <p className="text-2 small" style={{ whiteSpace: 'pre-line' }}>{active.note}</p> : null}
          <div>
            <ActionDialog label="Изменить клиента и цену" title={`${DEAL_KIND[active.kind]} · ${car.title}`} action={saleDealAction} submit="Сохранить" hidden={{ id: car.id, op: 'update' }}>
              <DealFields d={d} />
            </ActionDialog>
          </div>

          <details className="stack">
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Данные покупателя для ДКП{Object.keys(buyer).length ? '' : ' — не заполнены'}</summary>
            <ActionForm action={saleDealAction} hidden={{ id: car.id, op: 'buyer' }} submit="Сохранить данные покупателя" variant="quiet" className="stack" style={{ gap: 10, marginTop: 10 }}>
              <div className="grid-2 stack-sm">
                {BUYER_FIELDS.map(([k, label]) => (
                  <label key={k} className="field" style={k === 'issuedBy' || k === 'address' ? { gridColumn: '1 / -1' } : undefined}>{label}
                    <input className="input" name={k} defaultValue={buyer[k] ?? (k === 'fullName' ? active.clientName : '')} autoComplete="off" />
                  </label>
                ))}
              </div>
            </ActionForm>
            <p className="muted small">Выгрузка ДКП появится здесь, когда будут готовы шаблоны договоров: выберете продавца — и получите заполненный договор.</p>
          </details>
        </>
      ) : car.status === 'reserved' || car.status === 'sold' ? (
        <p className="muted small">Статус поставлен до появления сделок — данных о клиенте нет. Чтобы их добавить, нажмите «{car.status === 'reserved' ? 'Снять бронь' : 'Вернуть в продажу'}» и оформите заново.</p>
      ) : (
        <p className="muted small">Машина свободна. «Забронировать» и «Продано» запросят клиента и стоимость — и запишут, кто из менеджеров оформил.</p>
      )}

      {history.length ? (
        <details>
          <summary className="muted small" style={{ cursor: 'pointer' }}>История · {history.length}</summary>
          <ul className="small text-2" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {history.map((h) => (
              <li key={h.id}>{fmtDateTime(h.createdAt)} — {DEAL_KIND[h.kind]}: {h.clientName}, {rub(h.price)}{h.priceVat ? ' с НДС' : ''} · {who(h.managerId)} · {DEAL_STATUS[h.status]}{h.closedAt ? ` ${fmtDateTime(h.closedAt)} (${who(h.closedById)})` : ''}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
