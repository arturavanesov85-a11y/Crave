import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Вход в CRM', robots: { index: false } };

export default async function Login() {
  if (await currentUser()) redirect('/crm');
  return (
    <div className="login">
      <div className="card">
        <div><span className="logo" style={{ fontSize: 28 }}>CRAVE</span> <span className="muted small">CRM</span></div>
        <LoginForm />
        <p className="muted small">Тестовые учётные записи — в README.md, раздел «CRM».</p>
      </div>
    </div>
  );
}
