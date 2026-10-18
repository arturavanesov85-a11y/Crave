'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { CONTACTS, DIRECTION_URLS } from '@/lib/site';

type Dir = 'rental' | 'sales' | 'service';
type NavItem = { href: string; label: string };

export function DirectionSwitcher({ active }: { active: Dir }) {
  const items: [Dir, string][] = [['rental', 'Прокат'], ['sales', 'Автосалон'], ['service', 'Сервис']];
  return (
    <nav className="switcher" aria-label="Направления CRAVE">
      {items.map(([d, label]) => (
        <a key={d} href={DIRECTION_URLS[d]} aria-current={d === active ? 'page' : undefined}>
          {label}
        </a>
      ))}
    </nav>
  );
}

export function SiteHeader({ active, home, nav, sub }: { active: Dir; home: string; nav: NavItem[]; sub?: string }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  return (
    <header className={`site-header${open ? ' open' : ''}`}>
      <div className="wrap">
        <Link className="logo" href={home} onClick={() => setOpen(false)}>
          CRAVE{sub ? <small>{sub}</small> : null}
        </Link>
        <button className="burger" type="button" aria-label="Меню" aria-expanded={open} onClick={() => setOpen(!open)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        <DirectionSwitcher active={active} />
        <nav className="site-nav" aria-label="Разделы">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href || (n.href !== home && path.startsWith(n.href)) ? 'page' : undefined} onClick={() => setOpen(false)}>
              {n.label}
            </Link>
          ))}
        </nav>
        <a className="phone" href={CONTACTS.phoneHref}>
          {CONTACTS.phone}
        </a>
      </div>
    </header>
  );
}

export function SiteFooter({ name, links }: { name: string; links: NavItem[] }) {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="col">
          <span className="logo" style={{ fontSize: 26 }}>CRAVE</span>
          <span className="text-2">{name}</span>
          <span className="text-2">{CONTACTS.address}</span>
          <a href={CONTACTS.phoneHref}>{CONTACTS.phone}</a>
          <a href={CONTACTS.telegram}>Telegram</a>
        </div>
        <nav className="col" aria-label="Направления в подвале">
          <span className="eyebrow" style={{ color: 'var(--muted)' }}>Направления</span>
          <a href={DIRECTION_URLS.rental}>Прокат</a>
          <a href={DIRECTION_URLS.sales}>Автосалон</a>
          <a href={DIRECTION_URLS.service}>Сервис</a>
        </nav>
        <nav className="col" aria-label="Информация">
          {links.map((l) => (
            <Link key={l.href} href={l.href}>{l.label}</Link>
          ))}
          <span className="muted small">[Реквизиты — нужны от владельца]</span>
          <span className="muted small">© {new Date().getFullYear()} CRAVE</span>
        </nav>
      </div>
    </footer>
  );
}
