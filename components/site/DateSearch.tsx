// Выбор дат — обычная GET-форма, работает и без JavaScript.
export function defaultDates() {
  const now = new Date(Date.now() + 3 * 3600000); // Москва
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 10, 0));
  const r = new Date(d.getTime() + 3 * 86400000);
  const f = (x: Date) => x.toISOString().slice(0, 16);
  return { from: f(d), to: f(r) };
}

export function DateSearch({ from, to, body, action = '/avtopark', compact }: { from: string; to: string; body?: string; action?: string; compact?: boolean }) {
  return (
    <form action={action} method="get" className={compact ? 'wrap-row' : 'card pad stack'} style={compact ? { alignItems: 'flex-end', gap: 16 } : undefined}>
      <div className="grid-2 stack-sm" style={compact ? { flex: '2 1 440px' } : undefined}>
        <label className="field">
          Получение
          <input className="input" type="datetime-local" name="from" defaultValue={from} required />
        </label>
        <label className="field">
          Возврат
          <input className="input" type="datetime-local" name="to" defaultValue={to} required />
        </label>
      </div>
      <label className="field" style={compact ? { flex: '1 1 200px' } : undefined}>
        Тип кузова
        <select className="input" name="body" defaultValue={body ?? ''}>
          <option value="">Все автомобили</option>
          <option value="sedan">Седаны</option>
          <option value="suv">Внедорожники</option>
          <option value="coupe">Купе</option>
          <option value="pickup">Пикапы</option>
        </select>
      </label>
      <div className="wrap-row" style={compact ? { flex: '1 1 200px' } : { gap: 12 }}>
        <button className="btn btn-primary" type="submit" style={{ flex: '1 1 200px' }}>
          Подобрать автомобиль
        </button>
        {compact ? null : (
          <a className="btn" href="/kontakty#help" style={{ flex: '1 1 160px', fontWeight: 500 }}>
            Помочь с выбором
          </a>
        )}
      </div>
      {compact ? null : <p className="muted small">Время московское. Стоимость покажем для каждого свободного автомобиля.</p>}
    </form>
  );
}
