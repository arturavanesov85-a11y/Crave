import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser, toSessionUser } from '@/lib/auth';
import { db, json } from '@/lib/db';
import { fmtDateTime, toLocalInput } from '@/lib/dates';
import { rub } from '@/lib/money';
import { formatPhone } from '@/lib/orders';
import { can, directionsOf } from '@/lib/permissions';
import { usersById } from '@/lib/crm-data';
import { LEAD_KIND, STAGES, WS, stageOf, type WsDirection } from '@/lib/workspace';
import { ActionDialog, ActionForm } from '@/components/crm/ActionForm';
import { avitoReplyAction, requestNoteAction, requestStageAction, requestUpdateAction } from '../../../workspace-actions';
import { avitoChatMessages, avitoConfigured, leadAvitoChat } from '@/lib/avito-api';
import { ChannelTag } from '@/components/crm/ChannelTag';

export const metadata = { title: 'Заявка' };

const local = (d: Date | null) => (d ? toLocalInput(d) : '');

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(['leads.sales', 'leads.service']);
  const lead = await db.lead.findUnique({ where: { id: (await params).id }, include: { notes: { orderBy: { createdAt: 'desc' } }, customer: true } });
  if (!lead) notFound();
  if (lead.direction !== 'sales' && lead.direction !== 'service') redirect('/crm/leads');
  const direction = lead.direction as WsDirection;
  const ws = WS[direction];
  if (!can(user, ws.perm)) redirect('/crm/no-access');
  // Открыли — заявка прочитана, счётчик «Заявки» в меню гаснет (новое сообщение с Авито зажжёт снова).
  if (!lead.viewedAt) await db.lead.update({ where: { id: lead.id }, data: { viewedAt: new Date() } });

  const [users, staffRaw, saleCars] = await Promise.all([
    usersById(),
    db.user.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { fullName: 'asc' } }),
    direction === 'sales' ? db.saleCar.findMany({ where: { status: { in: ['published', 'reserved', 'draft'] } }, orderBy: { createdAt: 'desc' } }) : Promise.resolve([]),
  ]);
  const staff = staffRaw.filter((u) => can(toSessionUser(u), ws.perm));
  const stage = stageOf(direction, lead.stage);
  const order = STAGES[direction];
  const idx = order.findIndex((s) => s.code === lead.stage);
  const next = order.slice(idx + 1).find((s) => !s.closed);
  const won = order.find((s) => s.closed === 'won')!;
  const payload = json<Record<string, unknown>>(lead.payload, {});
  const utm = json<Record<string, string>>(lead.utm, {});
  const avito = leadAvitoChat(lead.payload);
  const chatId = avito ? json<{ avitoChatId?: string }>(lead.payload, {}).avitoChatId : undefined;
  const chat = chatId && avitoConfigured() ? await avitoChatMessages(chatId).catch(() => null) : chatId ? null : [];
  const name = (id: string | null) => (id ? users.get(id)?.fullName ?? '—' : 'не назначен');
  const car = lead.saleCarId ? saleCars.find((c) => c.id === lead.saleCarId) : null;
  const late = lead.nextActionAt && lead.nextActionAt < new Date();

  return (
    <>
      <Link href={ws.path} className="small">← {ws.title}</Link>
      <section className="card pad stack">
        <div className="toolbar">
          <h1>{lead.name}</h1>
          <span className={`tag ${stage.closed === 'won' ? 'ok' : stage.closed === 'lost' ? 'warn' : 'gold'}`}>{stage.label}</span>
          <span className="tag">{LEAD_KIND[lead.kind] ?? lead.kind}</span>
          <div className="grow" />
          {!stage.closed && next ? (
            next.code === 'booked' && !lead.appointmentAt ? (
              <ActionDialog label={`→ ${next.label}`} title="Запись в сервис" action={requestStageAction} submit="Записать" variant="primary" hidden={{ id: lead.id, stage: next.code }}>
                <label className="field">Дата и время записи<input className="input" type="datetime-local" name="appointmentAt" required /></label>
              </ActionDialog>
            ) : (
              <ActionForm action={requestStageAction} hidden={{ id: lead.id, stage: next.code }} submit={`→ ${next.label}`} />
            )
          ) : null}
          {!stage.closed ? <ActionForm action={requestStageAction} hidden={{ id: lead.id, stage: won.code }} submit={won.label} variant="ghost" confirm={`Отметить как «${won.label}»?`} /> : null}
          {!stage.closed ? (
            <ActionDialog label="Отказ" title="Закрыть заявку отказом" action={requestStageAction} submit="Закрыть" variant="danger" hidden={{ id: lead.id, stage: 'lost' }}>
              <label className="field">Причина<input className="input" name="reason" list="lost-reasons" required /></label>
              <datalist id="lost-reasons"><option value="Не дозвонились" /><option value="Дорого" /><option value="Выбрал другого продавца" /><option value="Передумал" /><option value="Нет нужного автомобиля" /></datalist>
            </ActionDialog>
          ) : (
            <ActionForm action={requestStageAction} hidden={{ id: lead.id, stage: 'contacted' }} submit="Вернуть в работу" variant="quiet" />
          )}
        </div>
        <nav className="wrap-row" style={{ gap: 6 }} aria-label="Этапы">
          {order.filter((s) => !s.closed).map((s, i) => (
            <span key={s.code} className={`tag ${s.code === lead.stage ? 'gold' : i < idx ? 'ok' : ''}`}>{i + 1}. {s.label}</span>
          ))}
        </nav>
        <div className="facts-grid">
          <div><span className="k">Телефон</span>{lead.phone ? <a href={`tel:+${lead.phone}`}>{formatPhone(lead.phone)}</a> : <span className="muted">не передан</span>}</div>
          <div><span className="k">Клиент</span>{lead.customerId && can(user, 'customers.read') && directionsOf(user).includes(direction) ? <Link href={`/crm/customers/${lead.customerId}`}>{lead.customer?.fullName ?? lead.name}</Link> : <span>{lead.name}</span>}</div>
          <div><span className="k">Поступила</span><span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>{fmtDateTime(lead.createdAt)} · <ChannelTag channel={lead.channel} />{lead.channel === 'site' ? ` ${lead.site}` : ''}</span></div>
          <div><span className="k">Ответственный</span><strong>{name(lead.assigneeId)}</strong></div>
          <div><span className="k">Следующее действие</span><span className={late ? 'warn' : ''}>{lead.nextAction ?? '—'}{lead.nextActionAt ? ` · ${fmtDateTime(lead.nextActionAt)}` : ''}</span></div>
          {direction === 'service' ? <div><span className="k">Запись</span><span className="gold">{fmtDateTime(lead.appointmentAt)}</span></div> : null}
          <div><span className="k">{ws.amountLabel}</span><span>{lead.amount ? rub(lead.amount) : '—'}</span></div>
          {lead.lostReason ? <div><span className="k">Причина отказа</span><span className="warn">{lead.lostReason}</span></div> : null}
        </div>
        {lead.message ? <p className="text-2" style={{ whiteSpace: 'pre-line' }}>«{lead.message}»</p> : null}
        {payload.car ? <p className="small">Из формы: {String(payload.car)}</p> : null}
        {Object.keys(utm).length ? <p className="muted small">Реклама: {Object.entries(utm).map(([k, v]) => `${k}=${v}`).join(', ')}</p> : null}
      </section>

      {avito ? (
        <section className="card pad stack">
          <div className="row"><h2>Переписка на Авито</h2><a className="btn btn-quiet btn-sm" href={avito.chat} target="_blank" rel="noreferrer">Открыть чат на Авито</a></div>
          {avito.item ? <p className="small">Объявление: <a href={avito.item} target="_blank" rel="noreferrer">{lead.carInfo ?? avito.item}</a></p> : null}
          {chat === null ? <p className="warn small">Не удалось загрузить переписку с Авито — откройте чат на Авито.</p> : (
            <div className="stack" style={{ gap: 6, maxHeight: 420, overflowY: 'auto' }}>
              {chat.map((m) => (
                <div key={m.id} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '80%', padding: '8px 12px', borderRadius: 12, background: m.mine ? 'var(--gold-12)' : 'var(--surface-2, #1c1c1c)', border: '1px solid var(--line)' }}>
                  <div className="small" style={{ whiteSpace: 'pre-line' }}>{m.text}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{m.mine ? 'CRAVE' : lead.name} · {fmtDateTime(m.at)}</div>
                </div>
              ))}
            </div>
          )}
          <ActionForm action={avitoReplyAction} hidden={{ id: lead.id }} submit="Отправить в Авито" className="stack" style={{ gap: 6 }}>
            <textarea className="input" name="text" rows={3} required placeholder="Сообщение покупателю — уйдёт в чат Авито от имени CRAVE" />
          </ActionForm>
        </section>
      ) : null}

      <div className="cols">
        <section className="main card pad stack">
          <h2>Работа с заявкой</h2>
          <ActionForm action={requestUpdateAction} hidden={{ id: lead.id }} submit="Сохранить" className="stack">
            <div className="grid-2 stack-sm">
              <label className="field">Ответственный
                <select className="input" name="assigneeId" defaultValue={lead.assigneeId ?? ''}>
                  <option value="">не назначен</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                </select>
              </label>
              <label className="field">{ws.amountLabel}, ₽<input className="input" name="amount" inputMode="decimal" defaultValue={lead.amount ? String(lead.amount / 100) : ''} /></label>
              <label className="field">Следующее действие<input className="input" name="nextAction" list="next-actions" defaultValue={lead.nextAction ?? ''} placeholder="Перезвонить, отправить предложение…" /></label>
              <label className="field">Когда<input className="input" type="datetime-local" name="nextActionAt" defaultValue={local(lead.nextActionAt)} /></label>
              {direction === 'service' ? <label className="field">Время записи в сервис<input className="input" type="datetime-local" name="appointmentAt" defaultValue={local(lead.appointmentAt)} /></label> : null}
              {direction === 'sales' ? (
                <label className="field">Автомобиль из наличия
                  <select className="input" name="saleCarId" defaultValue={lead.saleCarId ?? ''}>
                    <option value="">— не выбран —</option>
                    {saleCars.map((c) => <option key={c.id} value={c.id}>{c.title}, {c.year}{c.price ? ` · ${rub(c.price)}` : ''}</option>)}
                  </select>
                </label>
              ) : null}
            </div>
            <label className="field">{direction === 'sales' ? 'Автомобиль, который ищет клиент' : 'Автомобиль клиента'}<input className="input" name="carInfo" defaultValue={lead.carInfo ?? (payload.car ? String(payload.car) : '')} /></label>
            <datalist id="next-actions">
              <option value="Перезвонить" /><option value="Отправить предложение" /><option value="Уточнить бюджет" /><option value="Пригласить на осмотр" />
              {direction === 'service' ? <><option value="Подтвердить запись" /><option value="Сообщить о готовности" /></> : <><option value="Подобрать варианты" /><option value="Подготовить договор" /></>}
            </datalist>
          </ActionForm>
          {car ? <p className="small">Выбран: <Link href={`/crm/sales-cars/${car.id}`}>{car.title}, {car.year}</Link>{car.price ? ` · ${rub(car.price)}` : ''}</p> : null}
        </section>

        <aside className="aside">
          <section className="card pad stack" style={{ gap: 10 }}>
            <h2>Комментарии и история</h2>
            <ActionForm action={requestNoteAction} hidden={{ id: lead.id }} submit="Добавить" variant="quiet" className="stack" style={{ gap: 8 }}>
              <textarea className="input" name="text" rows={2} aria-label="Комментарий" placeholder="Итог звонка, договорённости…" required />
            </ActionForm>
            <ul className="list">
              {lead.notes.map((n) => (
                <li key={n.id} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                  <span className="muted small">{fmtDateTime(n.createdAt)} · {n.authorId ? name(n.authorId) : 'система'}</span>
                  <span className={n.kind === 'comment' ? '' : 'text-2 small'} style={{ whiteSpace: 'pre-line' }}>{n.text}</span>
                </li>
              ))}
            </ul>
            {!lead.notes.length ? <p className="muted small">Пока пусто</p> : null}
          </section>
        </aside>
      </div>
    </>
  );
}
