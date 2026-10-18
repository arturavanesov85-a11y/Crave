'use client';

import { useActionState, useEffect, useState } from 'react';
import { submitLead, type FormState } from '@/app/actions';

export function LeadForm({ direction, kind, back, title, messageLabel = 'Сообщение', carField, submitLabel = 'Отправить', sent }: { direction: 'rental' | 'sales' | 'service'; kind: 'callback' | 'purchase' | 'service_request'; back: string; title: string; messageLabel?: string; carField?: string; submitLabel?: string; sent?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitLead, undefined);
  const [key, setKey] = useState('');
  useEffect(() => setKey(crypto.randomUUID()), []);

  if (sent) {
    return (
      <div className="card pad stack" role="status">
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Обращение получено</h2>
        <p className="text-2">Мы свяжемся с вами по указанному телефону.</p>
        <a className="btn btn-sm" href={back} style={{ alignSelf: 'flex-start' }}>Отправить ещё одно</a>
      </div>
    );
  }
  return (
    <form action={action} className="card pad stack" style={{ gap: 12 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600 }}>{title}</h2>
      <input type="hidden" name="direction" value={direction} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="key" value={key} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: -9999 }} />
      <div className="grid-2 stack-sm">
        <label className="field">Имя<input className="input" name="name" required autoComplete="name" /></label>
        <label className="field">Телефон<input className="input" name="phone" type="tel" required autoComplete="tel" placeholder="+7" /></label>
      </div>
      {carField ? <label className="field">{carField}<input className="input" name="car" /></label> : null}
      <label className="field">{messageLabel}<textarea className="input" name="message" rows={3} /></label>
      <label className="check small"><input type="checkbox" name="consent" required />Согласен на обработку персональных данных</label>
      {state?.error ? <p className="error-text" role="alert">{state.error}</p> : null}
      <button className="btn btn-primary" type="submit" disabled={pending || !key}>{pending ? 'Отправляем…' : submitLabel}</button>
    </form>
  );
}
