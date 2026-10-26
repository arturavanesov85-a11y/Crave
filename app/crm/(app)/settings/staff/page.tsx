import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmtDate } from '@/lib/dates';
import { ROLE_CODES, roleLabel } from '@/lib/permissions';
import { ActionDialog } from '@/components/crm/ActionForm';
import { staffCreateAction } from '../../../staff-actions';

export const metadata = { title: 'Сотрудники' };

export default async function Staff() {
  const me = await requireUser();
  if (me.role !== 'owner') redirect('/crm/no-access');
  const users = await db.user.findMany({ where: { deletedAt: null }, orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }] });
  return (
    <>
      <div className="toolbar">
        <h1>Сотрудники</h1>
        <div className="grow" />
        <Link className="btn btn-quiet btn-sm" href="/crm/settings">Настройки</Link>
        <ActionDialog label="Добавить сотрудника" title="Новый сотрудник" action={staffCreateAction} submit="Создать" variant="primary" description="Права берутся из роли. После создания их можно изменить по отдельности.">
          <label className="field">Имя и фамилия<input className="input" name="fullName" required /></label>
          <label className="field">E-mail для входа<input className="input" name="email" type="email" required autoComplete="off" /></label>
          <label className="field">Роль<select className="input" name="role" defaultValue="rental_manager">{ROLE_CODES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select></label>
          <label className="field">Пароль (от 8 символов)<input className="input" name="password" type="password" minLength={8} required autoComplete="new-password" /></label>
        </ActionDialog>
      </div>
      <div className="table-box">
        <table className="table">
          <thead><tr><th>Сотрудник</th><th>Роль</th><th>Доступы</th><th>Статус</th><th>С нами с</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={u.isActive ? undefined : { opacity: 0.6 }}>
                <td><Link href={`/crm/settings/staff/${u.id}`} style={{ fontWeight: 600 }}>{u.fullName}</Link><div className="muted small">{u.email}{u.id === me.id ? ' · это вы' : ''}</div></td>
                <td>{roleLabel(u.role)}</td>
                <td className="small">{u.perms || u.directions ? <span className="tag gold">настроены вручную</span> : <span className="muted">как у роли</span>}</td>
                <td>{u.isActive ? <span className="tag ok">активен</span> : <span className="tag warn">заблокирован</span>}</td>
                <td className="small">{fmtDate(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
