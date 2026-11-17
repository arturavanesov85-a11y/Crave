'use client';

// Кнопка «КП» в карточке мини-приложения: менеджер проверяет стоимость, бот присылает PDF в чат.
// Если бот ещё ни разу не писал сотруднику, Telegram спросит разрешение — после него отправка повторяется.
import { useState } from 'react';
import { tg } from './TgShell';

type WriteAccess = { requestWriteAccess?(cb: (granted: boolean) => void): void; close?(): void };

export function TgKpButton({ carId, price, vat }: { carId: string; price: number | null; vat: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [value, setValue] = useState(price ? String(Math.round(price / 100)) : '');
  const [withVat, setWithVat] = useState(vat);

  async function send(retry = true): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/tg/kp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: carId, price: value, vat: withVat }) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; status?: string; error?: string };
      if (body.ok) {
        setMsg({ ok: 'Готово — КП в чате с ботом' });
        (tg() as unknown as { HapticFeedback?: { notificationOccurred?(t: string): void } })?.HapticFeedback?.notificationOccurred?.('success');
        return;
      }
      if (body.status === 'need_start') {
        const app = tg() as unknown as WriteAccess | null;
        if (retry && app?.requestWriteAccess) {
          setBusy(false);
          app.requestWriteAccess((granted) => (granted ? void send(false) : setMsg({ error: 'Без разрешения бот не может прислать файл. Нажмите «КП» ещё раз и разрешите.' })));
          return;
        }
        setMsg({ error: 'Бот пока не может вам писать: откройте чат с ботом, нажмите «Старт» и повторите.' });
        return;
      }
      setMsg({ error: body.error ?? 'Не удалось подготовить КП' });
    } catch {
      setMsg({ error: 'Нет связи — проверьте интернет и повторите' });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button type="button" className="btn btn-primary" style={{ minHeight: 48 }} onClick={() => setOpen(true)}>Выгрузить КП</button>;
  }
  return (
    <form className="card pad stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <strong>Коммерческое предложение</strong>
      <label className="field">Стоимость, ₽ (пусто — «по запросу»)
        <input className="input" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} style={{ minHeight: 48 }} />
      </label>
      <label className="check"><input type="checkbox" checked={withVat} onChange={(e) => setWithVat(e.target.checked)} />Цена с НДС</label>
      <button className="btn btn-primary" type="submit" disabled={busy} style={{ minHeight: 48 }}>{busy ? 'Готовлю PDF…' : 'Получить PDF в чат'}</button>
      {msg?.ok ? <p className="gold small" role="status">{msg.ok}</p> : msg?.error ? <p className="error-text" role="alert">{msg.error}</p> : null}
    </form>
  );
}
