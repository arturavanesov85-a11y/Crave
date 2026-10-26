'use client';

// Меню CRM: отдельные пункты и раскрывающиеся группы направлений.
// Группа с текущей страницей раскрыта автоматически; выбор раскрытия запоминается в браузере.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type Item = { href: string; label: string; count?: number };
export type NavEntry = Item | { label: string; items: Item[] };

const isActive = (path: string, href: string) => (href === '/crm' ? path === '/crm' : path === href || path.startsWith(href + '/'));
const KEY = 'crm-nav-open';

export function CrmNav({ nav }: { nav: NavEntry[] }) {
  const path = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      setOpen(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
    } catch {
      /* без сохранённого состояния */
    }
  }, []);
  const toggle = (label: string, value: boolean) => {
    const next = { ...open, [label]: value };
    setOpen(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* хранилище недоступно — состояние живёт до перезагрузки */
    }
  };

  const link = (i: Item, nested = false) => (
    <Link key={i.href} href={i.href} aria-current={isActive(path, i.href) ? 'page' : undefined} className={nested ? 'nested' : undefined}>
      {i.label}
      {i.count ? <span className="count">{i.count}</span> : null}
    </Link>
  );

  return (
    <nav className="crm-nav" aria-label="Основное меню">
      {nav.map((e) => {
        if (!('items' in e)) return link(e);
        const hasActive = e.items.some((i) => isActive(path, i.href));
        const expanded = open[e.label] ?? hasActive;
        const total = e.items.reduce((s, i) => s + (i.count ?? 0), 0);
        return (
          <div key={e.label} className="crm-group">
            <button type="button" className={`crm-group-head${hasActive ? ' active' : ''}`} aria-expanded={expanded} onClick={() => toggle(e.label, !expanded)}>
              <span>{e.label}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {!expanded && total ? <span className="count">{total}</span> : null}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            </button>
            {expanded ? <div className="crm-group-items">{e.items.map((i) => link(i, true))}</div> : null}
          </div>
        );
      })}
    </nav>
  );
}
