'use client';

import { useActionState, useState } from 'react';
import { inspectionAction } from '../../../../actions';

const CHECKS: [string, string][] = [['docs', 'Документы на автомобиль'], ['keys', 'Ключи'], ['clean', 'Чистота'], ['kit', 'Комплектность'], ['tires', 'Шины и диски'], ['lights', 'Световые приборы']];

export function InspectionForm({ id, kind, mileage }: { id: string; kind: 'pickup' | 'return'; mileage: number }) {
  const [state, action, pending] = useActionState(inspectionAction, undefined);
  const [count, setCount] = useState(0);
  return (
    <form action={action} className="card pad stack">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="kind" value={kind} />
      <div className="grid-2">
        <label className="field">Пробег, км<input className="input" name="mileageKm" type="number" inputMode="numeric" min={0} defaultValue={mileage || ''} required /></label>
        <label className="field">Топливо, %<input className="input" name="fuelPercent" type="number" inputMode="numeric" min={0} max={100} defaultValue={kind === 'pickup' ? 100 : ''} required /></label>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="muted small" style={{ marginBottom: 6 }}>Чек-лист</legend>
        <div className="grid-2">
          {CHECKS.map(([k, l]) => <label key={k} className="check"><input type="checkbox" name={`c_${k}`} defaultChecked />{l}</label>)}
        </div>
      </fieldset>
      <label className="field">
        Фотографии ({count})
        <input className="input" style={{ paddingTop: 10 }} type="file" name="photos" accept="image/*" capture="environment" multiple required onChange={(e) => setCount(e.target.files?.length ?? 0)} />
      </label>
      <label className="field">
        Новые повреждения — по одному в строке: «место — описание»
        <textarea className="input" name="damages" rows={3} placeholder="Передний бампер справа — скол 2 см" />
      </label>
      <label className="field">Заметки<textarea className="input" name="notes" rows={2} /></label>
      {kind === 'return' ? (
        <div className="stack" style={{ gap: 4 }}>
          <span className="muted small">Предложенные доплаты (проводятся только если отмечены)</span>
          <label className="check"><input type="checkbox" name="chargeOver" />Начислить перепробег</label>
          <label className="check"><input type="checkbox" name="chargeLate" />Начислить опоздание</label>
          <span className="muted small">Удержания из залога за повреждения — отдельным запросом во вкладке «Оплаты», с подтверждением руководителя.</span>
        </div>
      ) : null}
      {state?.error ? <p className="error-text" role="alert">{state.error}</p> : null}
      <button className="btn btn-primary btn-block" type="submit" disabled={pending}>{pending ? 'Сохраняем…' : kind === 'pickup' ? 'Выдать автомобиль' : 'Принять автомобиль'}</button>
    </form>
  );
}
