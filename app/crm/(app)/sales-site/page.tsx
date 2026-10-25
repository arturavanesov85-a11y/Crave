import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { AUTO_FIELDS, autoTexts } from '@/lib/site-settings';
import { DIRECTION_URLS } from '@/lib/site';
import { ActionForm } from '@/components/crm/ActionForm';
import { siteTextsAction } from '../../sales-actions';

export const metadata = { title: 'Сайт автосалона' };

export default async function SalesSite() {
  await requireUser('sales.catalog');
  const t = await autoTexts();
  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <div className="toolbar">
        <h1>Сайт автосалона</h1>
        <div className="grow" />
        <Link className="btn btn-quiet btn-sm" href="/crm/sales-cars">Авто в продаже</Link>
        <a className="btn btn-quiet btn-sm" href={DIRECTION_URLS.sales} target="_blank" rel="noreferrer">Открыть сайт</a>
      </div>
      <p className="muted small">Тексты сразу появляются на сайте после сохранения. Очистите поле, чтобы вернуть текст по умолчанию. Телефон, адрес и часы — если пусто, берутся общие контакты CRAVE.</p>
      <ActionForm action={siteTextsAction} submit="Сохранить тексты" className="card pad stack">
        {AUTO_FIELDS.map((f) => (
          <label key={f.key} className="field">
            {f.label}
            {'multiline' in f && f.multiline ? (
              <textarea className="input" name={f.key} rows={3} defaultValue={t[f.key]} placeholder={f.default} />
            ) : (
              <input className="input" name={f.key} defaultValue={t[f.key]} placeholder={f.default || 'общие контакты CRAVE'} />
            )}
          </label>
        ))}
      </ActionForm>
    </div>
  );
}
