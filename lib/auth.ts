import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db } from './db';
import { can, type Perm, type SessionUser } from './permissions';

const COOKIE = 'crave_session';
const TTL_DAYS = 14;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [, salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(password, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TTL_DAYS * 86400000);
  await db.session.create({ data: { id: sha(token), userId, expiresAt } });
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', expires: expiresAt, secure: process.env.NODE_ENV === 'production' });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha(token) } });
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { id: sha(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || !s.user.isActive) return null;
  const { id, email, fullName, role } = s.user;
  return { id, email, fullName, role };
}

/** Для страниц: без входа — на страницу входа, без права — ошибка доступа. */
export async function requireUser(perm?: Perm | Perm[]): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect('/crm/login');
  if (perm) {
    const list = Array.isArray(perm) ? perm : [perm];
    if (!list.some((p) => can(user, p))) redirect('/crm/no-access');
  }
  return user;
}
