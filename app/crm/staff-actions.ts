'use server';

// Сотрудники и их доступы. Управляет только владелец.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUser, hashPassword } from '@/lib/auth';
import { db } from '@/lib/db';
import { audit } from '@/lib/orders';
import { DIRECTIONS, Forbidden, PERMS, ROLE_CODES, roleDefaults, type Direction, type Perm } from '@/lib/permissions';

export type ActionState = { error?: string; ok?: string } | undefined;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

async function owner() {
  const u = await currentUser();
  if (!u) throw new Forbidden('Сессия истекла — войдите снова');
  if (u.role !== 'owner') throw new Forbidden('Сотрудниками управляет только владелец');
  return u;
}

async function run(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const ok = await fn();
    revalidatePath('/crm', 'layout');
    return { ok: ok || 'Сохранено' };
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e && String((e as { digest: string }).digest).startsWith('NEXT_REDIRECT')) throw e;
    return { error: e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : 'Не удалось выполнить действие' };
  }
}

/** Права из формы: чекбоксы perm_<код> и dir_<направление>. Совпадают с ролью — храним «как у роли». */
function accessFrom(fd: FormData, role: string) {
  if (fd.get('useRole') === 'on') return { perms: null, directions: null };
  const perms = PERMS.filter((p) => fd.get(`perm_${p}`) === 'on') as Perm[];
  const directions = DIRECTIONS.filter((d) => fd.get(`dir_${d}`) === 'on') as Direction[];
  const def = roleDefaults(role);
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  return {
    perms: same(perms, def.perms) ? null : JSON.stringify(perms),
    directions: same(directions, def.directions) ? null : JSON.stringify(directions),
  };
}

const Base = z.object({
  fullName: z.string().min(2, 'Укажите имя'),
  email: z.string().email('Некорректный e-mail'),
  role: z.enum(ROLE_CODES as [string, ...string[]], { errorMap: () => ({ message: 'Выберите роль' }) }),
});

export async function staffCreateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = '';
  const res = await run(async () => {
    const me = await owner();
    const d = Base.extend({ password: z.string().min(8, 'Пароль — от 8 символов') }).parse({ fullName: str(fd, 'fullName'), email: str(fd, 'email').toLowerCase(), role: str(fd, 'role'), password: str(fd, 'password') });
    if (await db.user.findUnique({ where: { email: d.email } })) throw new Error('Сотрудник с таким e-mail уже есть');
    const u = await db.user.create({ data: { email: d.email, fullName: d.fullName, role: d.role, passwordHash: hashPassword(d.password) } });
    await audit(db, me.id, 'user.create', 'user', u.id, { role: d.role });
    id = u.id;
  });
  if (res?.error) return res;
  redirect(`/crm/settings/staff/${id}`);
}

export async function staffUpdateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const me = await owner();
    const id = str(fd, 'id');
    const u = await db.user.findUniqueOrThrow({ where: { id } });
    if (u.deletedAt) throw new Error('Сотрудник удалён');
    const d = Base.parse({ fullName: str(fd, 'fullName'), email: str(fd, 'email').toLowerCase(), role: str(fd, 'role') });
    if (d.email !== u.email && (await db.user.findUnique({ where: { email: d.email } }))) throw new Error('Этот e-mail уже занят');
    if (u.role === 'owner' && d.role !== 'owner') {
      const owners = await db.user.count({ where: { role: 'owner', isActive: true, deletedAt: null } });
      if (owners <= 1) throw new Error('Нельзя снять роль с единственного владельца');
    }
    const access = d.role === 'owner' ? { perms: null, directions: null } : accessFrom(fd, d.role);
    await db.user.update({ where: { id }, data: { fullName: d.fullName, email: d.email, role: d.role, ...access } });
    await audit(db, me.id, 'user.access', 'user', id, { role: d.role, custom: !!(access.perms || access.directions) });
    return 'Доступы сохранены — действуют сразу';
  });
}

export async function staffPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const me = await owner();
    const id = str(fd, 'id');
    const password = str(fd, 'password');
    if (password.length < 8) throw new Error('Пароль — от 8 символов');
    await db.user.update({ where: { id }, data: { passwordHash: hashPassword(password) } });
    await db.session.deleteMany({ where: { userId: id, NOT: { userId: me.id } } });
    await audit(db, me.id, 'user.password', 'user', id);
    return 'Пароль изменён, сотруднику нужно войти заново';
  });
}

export async function staffBlockAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const me = await owner();
    const id = str(fd, 'id');
    if (id === me.id) throw new Error('Нельзя заблокировать себя');
    const u = await db.user.findUniqueOrThrow({ where: { id } });
    await db.user.update({ where: { id }, data: { isActive: !u.isActive } });
    if (u.isActive) await db.session.deleteMany({ where: { userId: id } });
    await audit(db, me.id, u.isActive ? 'user.block' : 'user.unblock', 'user', id);
    return u.isActive ? 'Сотрудник заблокирован, его сеансы завершены' : 'Сотрудник разблокирован';
  });
}

/** Удаление: сотрудник исчезает из списков и не может войти, но его имя остаётся в истории заказов и операций. */
export async function staffDeleteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await run(async () => {
    const me = await owner();
    const id = str(fd, 'id');
    if (id === me.id) throw new Error('Нельзя удалить себя');
    const u = await db.user.findUniqueOrThrow({ where: { id } });
    await db.session.deleteMany({ where: { userId: id } });
    // E-mail освобождается, чтобы его можно было выдать новому сотруднику.
    await db.user.update({ where: { id }, data: { isActive: false, deletedAt: new Date(), email: `deleted-${id}@crave.local`, perms: null, directions: null } });
    await audit(db, me.id, 'user.delete', 'user', id, { role: u.role });
  });
  if (res?.error) return res;
  redirect('/crm/settings/staff');
}

/** Запросы на доступ из Telegram: привязать к сотруднику, отклонить или отключить. */
export async function telegramDecideAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const me = await owner();
    const link = await db.telegramLink.findUniqueOrThrow({ where: { id: str(fd, 'id') } });
    const decision = str(fd, 'decision');
    if (decision === 'approve') {
      const userId = str(fd, 'userId');
      const u = userId ? await db.user.findUnique({ where: { id: userId } }) : null;
      if (!u || !u.isActive || u.deletedAt) throw new Error('Выберите активного сотрудника');
      await db.telegramLink.update({ where: { id: link.id }, data: { status: 'approved', userId: u.id, decidedBy: me.id, decidedAt: new Date() } });
      await audit(db, me.id, 'telegram.approve', 'user', u.id, { telegramId: link.telegramId });
      return `Доступ открыт: ${u.fullName}. Сотруднику нужно заново открыть мини-приложение.`;
    }
    if (decision === 'reject') {
      await db.telegramLink.update({ where: { id: link.id }, data: { status: 'rejected', userId: null, decidedBy: me.id, decidedAt: new Date() } });
      // Сеансы, открытые через этот аккаунт, неотличимы от обычных — закрываем сеансы привязанного сотрудника только при отключении ниже.
      await audit(db, me.id, 'telegram.reject', 'telegram', link.id, { telegramId: link.telegramId });
      return 'Запрос отклонён';
    }
    if (decision === 'unlink') {
      if (link.userId) await db.session.deleteMany({ where: { userId: link.userId } });
      await db.telegramLink.update({ where: { id: link.id }, data: { status: 'rejected', decidedBy: me.id, decidedAt: new Date() } });
      await audit(db, me.id, 'telegram.unlink', 'user', link.userId ?? '-', { telegramId: link.telegramId });
      return 'Доступ из Telegram отключён, сеансы сотрудника завершены';
    }
    throw new Error('Неизвестное действие');
  });
}
