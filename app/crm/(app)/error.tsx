'use client';

export default function CrmError({ error, reset }: { error: Error; reset: () => void }) {
  const forbidden = error.message.includes('прав');
  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <h1>{forbidden ? 'Нет доступа' : 'Ошибка'}</h1>
      <p className="text-2">{forbidden ? 'У вашей роли нет прав на этот раздел.' : error.message}</p>
      <button className="btn btn-sm" type="button" onClick={reset} style={{ alignSelf: 'flex-start' }}>Повторить</button>
    </div>
  );
}
