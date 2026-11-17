'use client';

// Бот может писать сотруднику (уведомления, КП в чат), только если тот разрешил.
// Если разрешения нет — показываем одну кнопку, которая открывает системный запрос Telegram.
import { useEffect, useState } from 'react';
import { tg } from './TgShell';

type App = { initDataUnsafe?: { user?: { allows_write_to_pm?: boolean } }; requestWriteAccess?(cb: (ok: boolean) => void): void };

export function TgWriteAccess() {
  const [need, setNeed] = useState(false);
  useEffect(() => {
    const app = tg() as unknown as App | null;
    if (app?.requestWriteAccess && app.initDataUnsafe?.user && !app.initDataUnsafe.user.allows_write_to_pm) setNeed(true);
  }, []);
  if (!need) return null;
  return (
    <div className="notice row" style={{ alignItems: 'center', gap: 10 }}>
      <span className="small grow">Разрешите боту присылать уведомления о заявках, выдачах и КП.</span>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => (tg() as unknown as App).requestWriteAccess?.((ok) => ok && setNeed(false))}>Разрешить</button>
    </div>
  );
}
