import Link from 'next/link';

export const metadata = { title: 'Нет доступа' };

export default function NoAccess() {
  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <h1>Нет доступа</h1>
      <p className="text-2">У вашей роли нет прав на этот раздел. Если доступ нужен для работы, обратитесь к владельцу или администратору.</p>
      <Link className="btn btn-sm" href="/crm/leads" style={{ alignSelf: 'flex-start' }}>К заявкам</Link>
    </div>
  );
}
