import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmtDateTime } from '@/lib/dates';
import { can, ROLE_CODES, roleLabel } from '@/lib/permissions';
import { usersById } from '@/lib/crm-data';
import { ActionDialog, ActionForm } from '@/components/crm/ActionForm';
import { ruleAction, userCreateAction, userToggleAction } from '../../actions';

export const metadata = { title: 'Настройки' };

const HELP: Record<string, string> = {
  day_rounding: '{"graceMinutes": 0} — льготные минуты сверх целых суток до начисления следующих',
  tier_mode: '{"mode": "whole"} — весь срок по ставке своей ступени',
  prep_buffer: '{"minutes": 180} — подготовка между заказами',
  hold_ttl: '{"minutes": 30} — срок временного резерва по заявке',
  prepayment: '{"type": null} — не утверждено; варианты: {"type":"percent","value":30}, {"type":"fixed","value":5000000}, {"type":"first_day"}, {"type":"none"}',
  min_days: '{"days": 1}',
  late_return: '{"chargeFullDay": true} — опоздание сверх льготных минут — сутки по ставке заказа',
};

export default async function Settings() {
  const user = await requireUser(['settings.manage', 'users.manage']);
  const [rules, users, log, byId] = await Promise.all([
    db.pricingRule.findMany({ orderBy: { key: 'asc' } }),
    db.user.findMany({ orderBy: { createdAt: 'asc' } }),
    db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    usersById(),
  ]);
  return (
    <>
      <h1>Настройки</h1>
      {can(user, 'settings.manage') ? (
        <section className="card pad stack">
          <h2>Правила расчёта и бронирования</h2>
          <p className="muted small">Правила со статусом «предположение» помечаются в расчётах на сайте и в CRM. Суммы — в копейках.</p>
          <ul className="list">
            {rules.map((r) => (
              <li key={r.key}>
                <span style={{ flex: '1 1 220px' }}><strong>{r.title}</strong><br /><code className="small text-2">{r.value}</code></span>
                <span className={`tag ${r.status === 'approved' ? 'ok' : 'warn'}`}>{r.status === 'approved' ? 'утверждено' : 'предположение'}</span>
                <ActionDialog label="Изменить" title={r.title} action={ruleAction} submit="Сохранить" hidden={{ key: r.key }} description={HELP[r.key]}>
                  <label className="field">Значение (JSON)<input className="input" name="value" defaultValue={r.value} required /></label>
                  <label className="field">Статус<select className="input" name="status" defaultValue={r.status}><option value="assumption">Предположение</option><option value="approved">Утверждено владельцем</option></select></label>
                </ActionDialog>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {can(user, 'users.manage') ? (
        <section className="card pad stack">
          <div className="row"><h2>Пользователи</h2>
            <ActionDialog label="Добавить" title="Новый пользователь" action={userCreateAction} submit="Создать" variant="primary">
              <label className="field">Имя<input className="input" name="fullName" required /></label>
              <label className="field">E-mail<input className="input" name="email" type="email" required /></label>
              <label className="field">Роль<select className="input" name="role">{ROLE_CODES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select></label>
              <label className="field">Пароль (от 8 символов)<input className="input" name="password" type="password" minLength={8} required autoComplete="new-password" /></label>
            </ActionDialog>
          </div>
          <ul className="list">
            {users.map((u) => (
              <li key={u.id} style={u.isActive ? undefined : { opacity: 0.55 }}>
                <span className="grow"><strong>{u.fullName}</strong> <span className="muted small">{u.email}</span></span>
                <span className="tag">{roleLabel(u.role)}</span>
                {u.id !== user.id ? <ActionForm action={userToggleAction} hidden={{ userId: u.id }} submit={u.isActive ? 'Отключить' : 'Включить'} variant="quiet" /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="card pad stack">
        <h2>Журнал изменений</h2>
        <ul className="list">
          {log.map((l) => <li key={l.id}><span className="muted small" style={{ flex: '0 0 120px' }}>{fmtDateTime(l.createdAt)}</span><span className="grow small">{l.action} · {l.entity} {l.details ? <span className="muted">{l.details.slice(0, 160)}</span> : null}</span><span className="small">{l.actorId ? byId.get(l.actorId)?.fullName : 'система'}</span></li>)}
        </ul>
        {!log.length ? <p className="muted">Пока пусто</p> : null}
      </section>
    </>
  );
}
