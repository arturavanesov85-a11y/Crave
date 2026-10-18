'use client';

// Форма серверного действия с выводом ошибки. Ошибки домена (конфликт брони, нет прав)
// показываются прямо у кнопки.
import { useActionState, useEffect, useRef, useState } from 'react';

export type ActionState = { error?: string; ok?: string } | undefined;
type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function ActionForm({ action, children, submit, className, style, variant = 'primary', confirm, onDone, hidden }: { action: Action; children?: React.ReactNode; submit: string; className?: string; style?: React.CSSProperties; variant?: 'primary' | 'quiet' | 'danger' | 'ghost'; confirm?: string; onDone?: () => void; hidden?: Record<string, string> }) {
  const [state, run, pending] = useActionState<ActionState, FormData>(action, undefined);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (state?.ok) done.current?.();
  }, [state]);
  const cls = variant === 'primary' ? 'btn btn-primary btn-sm' : variant === 'danger' ? 'btn btn-danger btn-sm' : variant === 'ghost' ? 'btn btn-sm' : 'btn btn-quiet btn-sm';
  return (
    <form
      action={run}
      className={className}
      style={style}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
      {children}
      <button className={cls} type="submit" disabled={pending}>
        {pending ? '…' : submit}
      </button>
      {state?.error ? <p className="error-text" role="alert" style={{ flexBasis: '100%' }}>{state.error}</p> : null}
      {state?.ok ? <p className="gold small" role="status" style={{ flexBasis: '100%' }}>{state.ok}</p> : null}
    </form>
  );
}

/** Кнопка, открывающая диалог с формой действия. */
export function ActionDialog({ label, title, action, submit, children, variant = 'quiet', hidden, description }: { label: string; title: string; action: Action; submit: string; children?: React.ReactNode; variant?: 'primary' | 'quiet' | 'danger' | 'ghost'; hidden?: Record<string, string>; description?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [key, setKey] = useState(0);
  const cls = variant === 'primary' ? 'btn btn-primary btn-sm' : variant === 'danger' ? 'btn btn-danger btn-sm' : variant === 'ghost' ? 'btn btn-sm' : 'btn btn-quiet btn-sm';
  return (
    <>
      <button type="button" className={cls} onClick={() => { setKey((k) => k + 1); ref.current?.showModal(); }}>
        {label}
      </button>
      <dialog ref={ref}>
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{title}</h2>
          <button type="button" className="btn btn-quiet btn-sm" aria-label="Закрыть" onClick={() => ref.current?.close()}>✕</button>
        </div>
        {description ? <p className="text-2 small" style={{ marginBottom: 12 }}>{description}</p> : null}
        <ActionForm key={key} action={action} submit={submit} hidden={hidden} className="stack" style={{ gap: 12 }} onDone={() => ref.current?.close()}>
          {children}
        </ActionForm>
      </dialog>
    </>
  );
}
