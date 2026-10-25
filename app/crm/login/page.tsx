import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { LoginForm } from './LoginForm';
import { Logo } from '@/components/site/Logo';

export const metadata = { title: 'Вход в CRM', robots: { index: false } };

export default async function Login() {
  if (await currentUser()) redirect('/crm');
  return (
    <div className="login">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}><Logo variant="crm" height={78} /></div>
        <LoginForm />
        <p className="muted small">Тестовые учётные записи — в README.md, раздел «CRM».</p>
      </div>
    </div>
  );
}
