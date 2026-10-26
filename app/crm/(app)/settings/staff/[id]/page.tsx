import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser, toSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmtDateTime } from '@/lib/dates';
import { DIRECTION_LABEL, DIRECTIONS, directionsOf, PERM_GROUPS, permsOf, ROLE_CODES, roleDefaults, roleLabel } from '@/lib/permissions';
import { ActionForm } from '@/components/crm/ActionForm';
import { staffBlockAction, staffDeleteAction, staffPasswordAction, staffUpdateAction } from '../../../../staff-actions';
import { AccessEditor } from './AccessEditor';

export const metadata = { title: 'Сотрудник' };

export default async function StaffMember({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  if (me.role !== 'owner') redirect('/crm/no-access');
  const u = await db.user.findUnique({ where: { id: (await params).id } });
  if (!u || u.deletedAt) notFound();
  const su = toSessionUser(u);
  const isMe = u.id === me.id;
  const roles = Object.fromEntries(ROLE_CODES.map((r) => [r, roleDefaults(r)]));
  const lastSession = await db.session.findFirst({ where: { userId: u.id }, orderBy: { createdAt: 'desc' } });

  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <Link href="/crm/settings/staff" className="small">← Сотрудники</Link>
      <div className="toolbar">
        <h1>{u.fullName}</h1>
        <span className="tag">{roleLabel(u.role)}</span>
        {u.isActive ? <span className="tag ok">активен</span> : <span className="tag warn">заблокирован</span>}
        <div className="grow" />
        <span className="muted small">последний вход: {lastSession ? fmtDateTime(lastSession.createdAt) : '—'}</span>
      </div>

      <ActionForm action={staffUpdateAction} submit="Сохранить" hidden={{ id: u.id }} className="stack">
        <section className="card pad stack">
          <h2>Данные</h2>
          <div className="grid-2 stack-sm">
            <label className="field">Имя и фамилия<input className="input" name="fullName" defaultValue={u.fullName} required /></label>
            <label className="field">E-mail для входа<input className="input" name="email" type="email" defaultValue={u.email} required /></label>
          </div>
        </section>
        <AccessEditor
          isOwnerEditingSelf={isMe}
          role={u.role}
          roles={roles}
          roleLabels={Object.fromEntries(ROLE_CODES.map((r) => [r, roleLabel(r)]))}
          groups={PERM_GROUPS}
          directions={DIRECTIONS.map((d) => [d, DIRECTION_LABEL[d]])}
          current={{ perms: permsOf(su), directions: directionsOf(su), custom: !!(u.perms || u.directions) }}
        />
      </ActionForm>

      <section className="card pad stack" style={{ gap: 10 }}>
        <h2>Пароль</h2>
        <ActionForm action={staffPasswordAction} submit="Сменить пароль" variant="quiet" hidden={{ id: u.id }} className="wrap-row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '1 1 260px' }}>Новый пароль (от 8 символов)<input className="input" name="password" type="password" minLength={8} required autoComplete="new-password" /></label>
        </ActionForm>
      </section>

      {!isMe ? (
        <section className="card pad stack" style={{ gap: 10 }}>
          <h2>Блокировка и удаление</h2>
          <p className="muted small">Блокировка сразу закрывает доступ и завершает сеансы; её можно снять. Удаление убирает сотрудника из списков навсегда, но его имя остаётся в истории заказов и операций.</p>
          <div className="wrap-row">
            <ActionForm action={staffBlockAction} hidden={{ id: u.id }} submit={u.isActive ? 'Заблокировать' : 'Разблокировать'} variant={u.isActive ? 'quiet' : 'primary'} confirm={u.isActive ? `Заблокировать ${u.fullName}?` : undefined} />
            <ActionForm action={staffDeleteAction} hidden={{ id: u.id }} submit="Удалить сотрудника" variant="danger" confirm={`Удалить ${u.fullName}? Восстановить будет нельзя.`} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
