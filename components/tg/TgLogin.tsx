'use client';

// Вход в мини-приложение: отправляем подписанные данные Telegram на сервер.
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { tg } from './TgShell';

const TEXT: Record<string, { title: string; text: string }> = {
  pending: { title: 'Запрос отправлен', text: 'Владелец CRM получил запрос на доступ. Когда он его подтвердит, откройте приложение снова.' },
  rejected: { title: 'Доступ не открыт', text: 'Запрос отклонён. Если это ошибка — обратитесь к руководителю.' },
  blocked: { title: 'Доступ закрыт', text: 'Учётная запись сотрудника заблокирована.' },
  no_access: { title: 'Нет доступа', text: 'У вашей учётной записи нет доступа к приложению («Салон» или «Прокат»). Попросите владельца включить его.' },
  invalid: { title: 'Не удалось проверить вход', text: 'Telegram не подтвердил данные. Закройте и снова откройте приложение из бота.' },
  not_configured: { title: 'Бот не подключён', text: 'Сервер ещё не настроен для работы с Telegram.' },
  rate_limited: { title: 'Слишком много попыток', text: 'Подождите несколько минут и откройте приложение снова.' },
  error: { title: 'Ошибка связи', text: 'Проверьте интернет и попробуйте ещё раз.' },
};

export function TgLogin() {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'browser' | keyof typeof TEXT>('loading');
  const [name, setName] = useState('');

  useEffect(() => {
    // Скрипт Telegram подключается асинхронно — даём ему немного времени.
    let tries = 0;
    const attempt = () => {
      const app = tg();
      if (!app?.initData) {
        if (tries++ < 10) return void setTimeout(attempt, 150);
        return setState('browser');
      }
      setName(app.initDataUnsafe?.user?.first_name ?? '');
      fetch('/api/tg/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: app.initData }) })
        .then((r) => r.json())
        .then((d: { status: string }) => (d.status === 'ok' ? router.refresh() : setState(d.status in TEXT ? (d.status as keyof typeof TEXT) : 'error')))
        .catch(() => setState('error'));
    };
    attempt();
  }, [router]);

  if (state === 'loading') return <p className="muted" style={{ padding: 24 }}>Входим…</p>;
  if (state === 'browser') {
    return (
      <div className="card pad stack" style={{ margin: 16 }}>
        <h1 style={{ fontSize: 20 }}>Откройте через Telegram</h1>
        <p className="text-2">Это мини-приложение для сотрудников CRAVE. Откройте его из бота компании в Telegram или войдите в CRM в этом браузере.</p>
        <a className="btn btn-primary" href="/crm/login?next=/tg">Войти в CRM</a>
      </div>
    );
  }
  const t = TEXT[state];
  return (
    <div className="card pad stack" style={{ margin: 16 }}>
      <h1 style={{ fontSize: 20 }}>{t.title}</h1>
      {name && state === 'pending' ? <p className="text-2">{name}, ваш аккаунт Telegram ещё не привязан к сотруднику CRM.</p> : null}
      <p className="text-2">{t.text}</p>
    </div>
  );
}
