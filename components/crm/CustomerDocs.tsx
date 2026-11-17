// Документы клиента: фото паспорта и прав. Смотреть — право «Документы клиентов»;
// загружать — менеджер проката или редактор клиентов (видит только, сколько файлов загружено).
import { db } from '@/lib/db';
import { fmtDate } from '@/lib/dates';
import { DOC_KIND } from '@/lib/customers';
import { can, type SessionUser } from '@/lib/permissions';
import { ActionForm } from './ActionForm';
import { customerDocAction } from '@/app/crm/actions';

export async function CustomerDocs({ user, customerId }: { user: SessionUser; customerId: string }) {
  const canView = can(user, 'customer.docs.view');
  const canAdd = can(user, 'customers.write') || can(user, 'rental.write');
  if (!canView && !canAdd) return null;
  const docs = await db.customerDocument.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' } });
  return (
    <section className="card pad stack" style={{ gap: 10 }}>
      <h2>Документы клиента · {docs.length}</h2>
      {canView ? (
        docs.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
            {docs.map((d) => (
              <figure key={d.id} className="stack" style={{ gap: 4, margin: 0 }}>
                <a href={`/api/files/doc/${d.id}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/doc/${d.id}`} alt={DOC_KIND[d.kind]} loading="lazy" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
                </a>
                <figcaption className="small">{DOC_KIND[d.kind]} · {fmtDate(d.createdAt)}</figcaption>
                {canAdd ? <ActionForm action={customerDocAction} hidden={{ customerId, docId: d.id, op: 'remove' }} submit="Удалить" variant="ghost" confirm="Удалить фото документа?" /> : null}
              </figure>
            ))}
          </div>
        ) : <p className="muted small">Документов нет.</p>
      ) : <p className="muted small">{docs.length ? `Загружено файлов: ${docs.length}. Просмотр — у сотрудников с правом «Документы клиентов».` : 'Документов нет.'}</p>}
      {canAdd ? (
        <ActionForm action={customerDocAction} hidden={{ customerId }} submit="Загрузить" variant="quiet" className="stack" style={{ gap: 8 }}>
          <div className="grid-2 stack-sm">
            <label className="field">Документ
              <select className="input" name="kind" defaultValue="passport">
                {Object.entries(DOC_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label className="field">Фото (можно несколько)<input className="input" style={{ paddingTop: 10 }} type="file" name="files" accept="image/*" multiple required /></label>
          </div>
        </ActionForm>
      ) : null}
    </section>
  );
}
