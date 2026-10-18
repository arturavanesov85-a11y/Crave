import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmtDate, fmtDateTime, toLocalInput } from '@/lib/dates';
import { eligibility, experienceText, MIN_AGE_YEARS, MIN_EXPERIENCE_YEARS } from '@/lib/customers';
import { ActionDialog } from '@/components/crm/ActionForm';
import { customerUpdateAction } from '../../../actions';

const ymd = (d: Date | null) => (d ? toLocalInput(d).slice(0, 10) : '');
import { can, directionsOf, DIRECTION_LABEL } from '@/lib/permissions';
import { formatPhone, STATUS_LABEL } from '@/lib/orders';
import { summarize } from '@/lib/ledger';
import { rub } from '@/lib/money';

export const metadata = { title: 'Клиент' };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser('customers.read');
  const dirs = directionsOf(user);
  const c = await db.customer.findUnique({
    where: { id: (await params).id },
    include: { directions: true, orders: { include: { vehicle: true, ledger: { select: { kind: true, amount: true } } }, orderBy: { pickupAt: 'desc' } }, leads: { orderBy: { createdAt: 'desc' } } },
  });
  if (!c) notFound();
  // Общая база клиентов не означает доступ ко всей истории по трём направлениям.
  if (!c.directions.some((d) => dirs.includes(d.direction as never))) redirect('/crm/no-access');
  const showRental = dirs.includes('rental') && can(user, 'rental.read');
  const leads = c.leads.filter((l) => dirs.includes(l.direction as never));
  const el = eligibility(c);

  return (
    <>
      <Link href="/crm/customers" className="small">← Клиенты</Link>
      <section className="card pad stack" style={{ gap: 12 }}>
        <div className="toolbar">
          <h1>{c.fullName}</h1>
          {c.isForeign ? <span className="tag">иностранный гражданин</span> : null}
          {el.issues.map((i) => <span key={i} className="tag warn">{i}</span>)}
          <div className="grow" />
          {can(user, 'customers.write') ? (
            <ActionDialog label="Редактировать" title="Карточка клиента" action={customerUpdateAction} submit="Сохранить" variant="primary" hidden={{ customerId: c.id }}>
              <label className="field">Имя и фамилия<input className="input" name="fullName" defaultValue={c.fullName} required autoComplete="off" /></label>
              <div className="grid-2 stack-sm">
                <label className="field">Телефон<input className="input" name="phone" type="tel" defaultValue={formatPhone(c.phone)} required /></label>
                <label className="field">E-mail<input className="input" name="email" type="email" defaultValue={c.email ?? ''} /></label>
                <label className="field">Дата рождения<input className="input" name="birthDate" type="date" defaultValue={ymd(c.birthDate)} /></label>
                <label className="field">Водительский стаж с<input className="input" name="drivingSince" type="date" defaultValue={ymd(c.drivingSince)} /></label>
              </div>
              <label className="check"><input type="checkbox" name="isForeign" defaultChecked={c.isForeign} />Иностранный гражданин (залог может быть увеличен)</label>
              <label className="field">Заметки<textarea className="input" name="notes" rows={3} defaultValue={c.notes ?? ''} /></label>
              <p className="muted small">Требования к арендатору: от {MIN_AGE_YEARS} лет, стаж от {String(MIN_EXPERIENCE_YEARS).replace('.', ',')} лет.</p>
            </ActionDialog>
          ) : null}
        </div>
        <div className="facts-grid">
          <div><span className="k">Телефон</span><a href={`tel:+${c.phone}`}>{formatPhone(c.phone)}</a></div>
          <div><span className="k">E-mail</span><span>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'}</span></div>
          <div><span className="k">Возраст</span><span className={el.age != null && el.age < MIN_AGE_YEARS ? 'warn' : ''}>{el.age != null ? `${el.age} лет · ${fmtDate(c.birthDate)}` : '—'}</span></div>
          <div><span className="k">Водительский стаж</span><span className={el.exp != null && el.exp < MIN_EXPERIENCE_YEARS ? 'warn' : ''}>{experienceText(el.exp)}{c.drivingSince ? ` · с ${fmtDate(c.drivingSince)}` : ''}</span></div>
          <div><span className="k">Направления</span><span>{c.directions.filter((d) => dirs.includes(d.direction as never)).map((d) => DIRECTION_LABEL[d.direction as keyof typeof DIRECTION_LABEL]).join(', ')}</span></div>
          <div><span className="k">В базе с</span><span>{fmtDate(c.createdAt)}{c.updatedAt ? ` · изменено ${fmtDate(c.updatedAt)}` : ''}</span></div>
        </div>
        {c.notes ? <p className="text-2" style={{ whiteSpace: 'pre-line' }}>{c.notes}</p> : null}
        {el.unknown.length && showRental ? <p className="muted small">Не заполнено: {el.unknown.join(', ')} — нужно для проверки требований к арендатору.</p> : null}
        {can(user, 'customer.docs.view') ? <span className="muted small">Документы клиента: загрузка — в следующей версии.</span> : null}
      </section>
      {showRental ? (
        <section className="card pad stack">
          <h2>Аренда</h2>
          {c.orders.length ? (
            <ul className="list">
              {c.orders.map((o) => {
                const m = summarize(o.ledger);
                return <li key={o.id}><Link href={`/crm/orders/${o.id}`}>{o.number}</Link><span className="grow">{o.vehicle.title}</span><span className="small">{fmtDateTime(o.pickupAt)}</span><span className="tag">{STATUS_LABEL[o.status]}</span>{m.debt > 0 ? <span className="warn small">долг {rub(m.debt)}</span> : null}</li>;
              })}
            </ul>
          ) : <p className="muted">Заказов нет</p>}
        </section>
      ) : null}
      <section className="card pad stack">
        <h2>Обращения</h2>
        {leads.length ? <ul className="list">{leads.map((l) => <li key={l.id}><span className="small">{fmtDateTime(l.createdAt)}</span><span className="tag">{DIRECTION_LABEL[l.direction as keyof typeof DIRECTION_LABEL]}</span><span className="grow text-2">{l.message ?? '—'}</span></li>)}</ul> : <p className="muted">Нет</p>}
      </section>
    </>
  );
}
