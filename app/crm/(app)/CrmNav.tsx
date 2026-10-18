'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function CrmNav({ items }: { items: { href: string; label: string; count?: number }[] }) {
  const path = usePathname();
  return (
    <nav className="crm-nav" aria-label="Основное меню">
      {items.map((i) => {
        const active = i.href === '/crm' ? path === '/crm' : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? 'page' : undefined}>
            {i.label}
            {i.count ? <span className="count">{i.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
