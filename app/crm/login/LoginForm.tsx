'use client';

import { useActionState } from 'react';
import { login } from '../actions';

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="stack" style={{ gap: 12 }}>
      <label className="field">E-mail<input className="input" name="email" type="email" required autoComplete="username" /></label>
      <label className="field">Пароль<input className="input" name="password" type="password" required autoComplete="current-password" /></label>
      {state?.error ? <p className="error-text" role="alert">{state.error}</p> : null}
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? 'Входим…' : 'Войти'}</button>
    </form>
  );
}
