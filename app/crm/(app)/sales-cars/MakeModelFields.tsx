'use client';

// Марка и модель с подсказками: модели подбираются под выбранную марку.
import { useState } from 'react';

export function MakeModelFields({ make: make0, model: model0, models, required }: { make: string; model: string; models: Record<string, string[]>; required: boolean }) {
  const [make, setMake] = useState(make0);
  const key = Object.keys(models).find((m) => m.toLowerCase() === make.trim().toLowerCase());
  const list = key ? models[key] : Object.values(models).flat();
  return (
    <>
      <label className="field">Марка
        <input className="input" name="make" list="dl-makes" value={make} onChange={(e) => setMake(e.target.value)} required={required} autoComplete="off" />
      </label>
      <label className="field">Модель
        <input className="input" name="model" list="dl-models" defaultValue={model0} required={required} autoComplete="off" />
      </label>
      <datalist id="dl-makes">{Object.keys(models).sort().map((m) => <option key={m} value={m} />)}</datalist>
      <datalist id="dl-models">{[...new Set(list)].sort().map((m) => <option key={m} value={m} />)}</datalist>
    </>
  );
}
