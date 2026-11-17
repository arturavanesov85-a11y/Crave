// Шапка мини-приложения: логотип и переключатель разделов «Салон» / «Прокат».
// Кнопка раздела видна, только если у сотрудника есть к нему доступ.
import Link from 'next/link';
import { Logo } from '@/components/site/Logo';
import { can, type SessionUser } from '@/lib/permissions';
import { TgWriteAccess } from './TgWriteAccess';

export function TgTop({ user, active }: { user: SessionUser; active: 'sales' | 'rental' }) {
  const sales = can(user, 'tg.app');
  const rental = can(user, 'tg.rental');
  return (
    <>
      <header className="tg-top">
        <Logo variant={active === 'rental' ? 'rental' : 'auto'} height={34} />
        {sales && rental ? (
          <nav className="tg-switch" aria-label="Раздел">
            <Link href="/tg" aria-current={active === 'sales' ? 'page' : undefined}>Салон</Link>
            <Link href="/tg/rental" aria-current={active === 'rental' ? 'page' : undefined}>Прокат</Link>
          </nav>
        ) : <span className="muted small" style={{ textAlign: 'right' }}>{user.fullName}</span>}
      </header>
      <TgWriteAccess />
    </>
  );
}
