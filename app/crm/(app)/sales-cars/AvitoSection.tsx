'use client';

// Блок «Авито» в карточке машины. Марка → модель → поколение → модификация выбираются из каталога
// Авито, характеристики (кузов, мощность, привод…) подставляются из каталога сами. Пока машина
// в черновике, на Авито ничего не уходит; «Отправить на Авито» кладёт её в файл автозагрузки.
import { useActionState, useEffect, useState } from 'react';
import type { ActionState } from '@/components/crm/ActionForm';
import type { AvitoAd, ModInfo } from '@/lib/avito';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

async function load(q: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
  const r = await fetch(`/api/avito/catalog?${qs}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Каталог Авито недоступен');
  return j;
}

export function AvitoSection({ carId, year, status, ad, problems, since, colors, owners, defaultAddress, action }: {
  carId: string; year: number; status: string; ad: AvitoAd; problems: string[]; since: string | null;
  colors: string[]; owners: string[]; defaultAddress: string; action: Action;
}) {
  const [state, run, pending] = useActionState<ActionState, FormData>(action, undefined);
  const [make, setMake] = useState(ad.make);
  const [model, setModel] = useState(ad.model);
  const [gen, setGen] = useState(ad.generation);
  const [mod, setMod] = useState(ad.modification);
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [gens, setGens] = useState<string[]>([]);
  const [mods, setMods] = useState<ModInfo[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => { load({}).then((j) => setMakes(j.makes)).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { setModels([]); if (make) load({ make }).then((j) => setModels(j.models)).catch(() => {}); }, [make]);
  useEffect(() => { setGens([]); if (make && model) load({ make, model, year }).then((j) => setGens(j.generations)).catch(() => {}); }, [make, model, year]);
  useEffect(() => { setMods([]); if (make && model && gen) load({ make, model, generation: gen }).then((j) => setMods(j.modifications)).catch(() => {}); }, [make, model, gen]);

  const info = mods.find((m) => m.name === mod);
  const live = status === 'live';

  return (
    <section className="card pad stack">
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <h2>Авито</h2>
        <span className={`tag ${live ? 'ok' : ''}`}>{live ? 'Отправлено на Авито' : status === 'draft' ? 'Черновик' : 'Не размещается'}</span>
        {live && since ? <span className="muted small">с {since}</span> : null}
      </div>
      <p className="muted small">Характеристики берутся из каталога Авито по выбранной модификации. Тюнинг и реальную мощность пишите в описании. Пока статус «Черновик», на Авито ничего не уходит.</p>
      {err ? <p className="error-text">{err}</p> : null}

      <form action={run} className="stack">
        <input type="hidden" name="id" value={carId} />
        <datalist id="avito-makes">{makes.map((m) => <option key={m} value={m} />)}</datalist>
        <div className="grid-2 stack-sm">
          <label className="field">Марка по каталогу Авито
            <input className="input" name="make" list="avito-makes" value={make} onChange={(e) => { setMake(e.target.value); setModel(''); setGen(''); setMod(''); }} placeholder="начните вводить" />
          </label>
          <label className="field">Модель
            <select className="input" name="model" value={model} onChange={(e) => { setModel(e.target.value); setGen(''); setMod(''); }}>
              <option value="">{models.length ? '— выберите —' : make ? 'нет такой марки' : 'сначала марка'}</option>
              {(model && !models.includes(model) ? [model, ...models] : models).map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label className="field">Поколение (подходящие для {year} г.)
            <select className="input" name="generation" value={gen} onChange={(e) => { setGen(e.target.value); setMod(''); }}>
              <option value="">— выберите —</option>
              {(gen && !gens.includes(gen) ? [gen, ...gens] : gens).map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>
          <label className="field">Модификация
            <select className="input" name="modification" value={mod} onChange={(e) => setMod(e.target.value)}>
              <option value="">— выберите —</option>
              {mod && !mods.some((m) => m.name === mod) ? <option>{mod}</option> : null}
              {mods.map((m) => <option key={m.name} value={m.name}>{m.name}{m.complectations.length ? ` · ${m.complectations.join(', ')}` : ''}</option>)}
            </select>
          </label>
        </div>
        {info ? (
          <p className="small">Из каталога Авито: {info.body}, {info.doors} дв., {info.fuel}, {info.engine} л, {info.power} л.с., {info.transmission}, привод {info.drive.toLowerCase()} · годы {info.years}</p>
        ) : null}
        <div className="grid-2 stack-sm">
          <label className="field">Комплектация (необязательно)
            <select className="input" name="complectation" defaultValue={ad.complectation} key={mod}>
              <option value="">—</option>
              {(info?.complectations ?? (ad.complectation ? [ad.complectation] : [])).map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">Цена на Авито, ₽ (пусто — цена машины)<input className="input" name="price" inputMode="decimal" defaultValue={ad.price ? String(ad.price) : ''} /></label>
          <label className="field">Цвет
            <select className="input" name="color" defaultValue={ad.color}>
              <option value="">— выберите —</option>
              {colors.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">Владельцев по ПТС
            <select className="input" name="owners" defaultValue={ad.owners}>
              <option value="">— выберите —</option>
              {owners.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">Состояние
            <select className="input" name="accident" defaultValue={ad.accident || 'Не битый'}><option>Не битый</option><option>Битый</option></select>
          </label>
          <label className="field">Руль
            <select className="input" name="wheel" defaultValue={ad.wheel || 'Левый'}><option>Левый</option><option>Правый</option></select>
          </label>
        </div>
        <label className="field">Адрес осмотра<input className="input" name="address" defaultValue={ad.address || defaultAddress} /></label>
        <label className="field">Описание для Авито (каждая строка — абзац)<textarea className="input" name="description" rows={8} defaultValue={ad.description} /></label>

        {problems.length ? <p className="warn small">Чтобы отправить на Авито: {problems.join('; ')}.</p> : null}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-quiet btn-sm" name="intent" value="save" disabled={pending}>{live ? 'Сохранить изменения' : 'Сохранить черновик'}</button>
          {!live ? <button className="btn btn-primary btn-sm" name="intent" value="publish" disabled={pending} onClick={(e) => { if (!confirm('Отправить объявление на Авито? Оно займёт место в пакете тарифа.')) e.preventDefault(); }}>Отправить на Авито</button> : null}
          {live ? <button className="btn btn-danger btn-sm" name="intent" value="unpublish" disabled={pending} formNoValidate onClick={(e) => { if (!confirm('Снять объявление с Авито?')) e.preventDefault(); }}>Снять с Авито</button> : null}
        </div>
        {state?.error ? <p className="error-text" role="alert">{state.error}</p> : null}
        {state?.ok ? <p className="gold small" role="status">{state.ok}</p> : null}
      </form>
    </section>
  );
}
