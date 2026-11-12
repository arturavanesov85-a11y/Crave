import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { LoginForm } from './LoginForm';
import { Logo } from '@/components/site/Logo';

export const metadata = { title: 'Вход в CRM', robots: { index: false } };

// Возврат после входа — только на свои разделы (мини-приложение или CRM).
const safeNext = (v?: string) => (v && /^\/(tg|crm)(\/|$|\?)/.test(v) ? v : undefined);

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const next = safeNext((await searchParams).next);
  if (await currentUser()) redirect(next ?? '/crm');
  return (
    <div className="login">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}><Logo variant="crm" height={78} /></div>
        <LoginForm next={next} />
        <p className="muted small">Тестовые учётные записи — в README.md, раздел «CRM».</p>
      </div>
    </div>
  );
}
