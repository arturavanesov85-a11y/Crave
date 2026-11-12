import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, toSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmtDateTime } from '@/lib/dates';
import { can, roleLabel } from '@/lib/permissions';
import { usersById } from '@/lib/crm-data';
import { BOT_USERNAME } from '@/lib/telegram';
import { ActionForm } from '@/components/crm/ActionForm';
import { telegramDecideAction } from '../../../staff-actions';

export const metadata = { title: 'Доступ из Telegram' };

const STATUS: Record<string, string> = { pending: 'ждёт решения', approved: 'доступ открыт', rejected: 'отклонён' };

export default async function TelegramAccess() {
  const me = await requireUser();
  if (me.role !== 'owner') redirect('/crm/no-access');
  const [links, staff, byId] = await Promise.all([
    db.telegramLink.findMany({ orderBy: [{ createdAt: 'desc' }] }),
    db.user.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { fullName: 'asc' } }),
    usersById(),
  ]);
  const order = { pending: 0, approved: 1, rejected: 2 } as Record<string, number>;
  links.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
  const configured = !!process.env.TELEGRAM_BOT_TOKEN;

  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <Link href="/crm/settings" className="small">← Настройки</Link>
      <h1>Доступ из Telegram</h1>
      {!configured ? (
        <div className="notice warn">Бот ещё не подключён: задайте TELEGRAM_BOT_TOKEN в файле .env на сервере (инструкция — в README, раздел «Мини-приложение Telegram»).</div>
      ) : (
        <p className="muted small">Сотрудник открывает мини-приложение{BOT_USERNAME ? ` в боте @${BOT_USERNAME}` : ''} — здесь появляется его запрос. Привяжите аккаунт к сотруднику CRM: в приложении будут его права. Для каталога нужно право «Мини-приложение Telegram».</p>
      )}
      <div className="table-box">
        <table className="table">
          <thead><tr><th>Аккаунт Telegram</th><th>Статус</th><th>Сотрудник</th><th>Последний вход</th><th /></tr></thead>
          <tbody>
            {links.map((l) => {
              const linked = l.userId ? byId.get(l.userId) : null;
              const linkedUser = l.userId ? staff.find((s) => s.id === l.userId) : null;
              const noPerm = linkedUser && !can(toSessionUser(linkedUser), 'tg.app');
              return (
                <tr key={l.id}>
                  <td><strong>{[l.firstName, l.lastName].filter(Boolean).join(' ') || 'Без имени'}</strong><div className="muted small">{l.username ? `@${l.username}` : `id ${l.telegramId}`} · запрос {fmtDateTime(l.createdAt)}</div></td>
                  <td><span className={`tag ${l.status === 'pending' ? 'gold' : l.status === 'approved' ? 'ok' : ''}`}>{STATUS[l.status]}</span></td>
                  <td className="small">{linked ? <>{linked.fullName}<div className="muted">{roleLabel(linked.role)}</div>{noPerm ? <div className="warn">нет права «Мини-приложение Telegram»</div> : null}</> : '—'}</td>
                  <td className="small">{fmtDateTime(l.lastSeenAt)}</td>
                  <td>
                    {l.status !== 'approved' ? (
                      <ActionForm action={telegramDecideAction} hidden={{ id: l.id, decision: 'approve' }} submit="Открыть доступ" className="wrap-row" style={{ gap: 6 }}>
                        <select className="input" name="userId" required defaultValue="" style={{ minHeight: 38, width: 220 }} aria-label="Сотрудник">
                          <option value="" disabled>Сотрудник…</option>
                          {staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                        </select>
                      </ActionForm>
                    ) : (
                      <ActionForm action={telegramDecideAction} hidden={{ id: l.id, decision: 'unlink' }} submit="Отключить" variant="danger" confirm="Отключить доступ из Telegram?" />
                    )}
                    {l.status === 'pending' ? <ActionForm action={telegramDecideAction} hidden={{ id: l.id, decision: 'reject' }} submit="Отклонить" variant="quiet" /> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!links.length ? <p className="muted pad">Запросов пока нет. Они появятся, когда сотрудники откроют мини-приложение.</p> : null}
      </div>
    </div>
  );
}
