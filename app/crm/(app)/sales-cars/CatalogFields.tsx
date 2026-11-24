'use client';

// Марка → модель → поколение → модификация по каталогу Авито. По выбранной модификации
// кузов, двигатель, мощность, коробка и привод заполняются сами; для сайта их можно поправить
// (например, мощность после чипа), а на Авито всегда уходят значения из каталога.
import { useEffect, useState } from 'react';
import type { ModInfo } from '@/lib/avito';

const BODY: Record<string, string> = { Седан: 'sedan', Внедорожник: 'suv', Купе: 'coupe', Пикап: 'pickup', Минивэн: 'minivan', Минивен: 'minivan', Универсал: 'wagon' };

async function load(q: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
  const r = await fetch(`/api/avito/catalog?${qs}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Каталог Авито недоступен');
  return j;
}

type Init = { make: string; model: string; year: string; generation: string; modification: string; complectation: string; bodyType: string; powerHp: string; engine: string; transmission: string; drive: string };

export function CatalogFields({ init, isNew }: { init: Init; isNew: boolean }) {
  const [make, setMake] = useState(init.make);
  const [model, setModel] = useState(init.model);
  const [year, setYear] = useState(init.year);
  const [gen, setGen] = useState(init.generation);
  const [mod, setMod] = useState(init.modification);
  const [spec, setSpec] = useState({ bodyType: init.bodyType, powerHp: init.powerHp, engine: init.engine, transmission: init.transmission, drive: init.drive });
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [gens, setGens] = useState<string[]>([]);
  const [mods, setMods] = useState<ModInfo[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => { load({}).then((j) => setMakes(j.makes)).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { setModels([]); if (make) load({ make }).then((j) => setModels(j.models)).catch(() => {}); }, [make]);
  useEffect(() => { setGens([]); if (make && model) load({ make, model, year: Number(year) || undefined }).then((j) => setGens(j.generations)).catch(() => {}); }, [make, model, year]);
  useEffect(() => { setMods([]); if (make && model && gen) load({ make, model, generation: gen }).then((j) => setMods(j.modifications)).catch(() => {}); }, [make, model, gen]);

  const info = mods.find((m) => m.name === mod);
  function pickMod(name: string) {
    setMod(name);
    const m = mods.find((x) => x.name === name);
    if (!m) return;
    setSpec({ bodyType: BODY[m.body] ?? spec.bodyType, powerHp: String(m.power || ''), engine: [m.fuel.toLowerCase(), m.engine ? `${m.engine} л` : ''].filter(Boolean).join(', '), transmission: m.transmission.toLowerCase(), drive: m.drive.toLowerCase() });
  }
  const set = (k: keyof typeof spec) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setSpec({ ...spec, [k]: e.target.value });
  const withCurrent = (list: string[], v: string) => (v && !list.includes(v) ? [v, ...list] : list);

  return (
    <>
      {err ? <p className="error-text" style={{ gridColumn: '1 / -1' }}>{err}</p> : null}
      <datalist id="avito-makes">{makes.map((m) => <option key={m} value={m} />)}</datalist>
      <label className="field">Марка (каталог Авито)
        <input className="input" name="make" list="avito-makes" value={make} required={!isNew} autoComplete="off" placeholder="начните вводить"
          onChange={(e) => { setMake(e.target.value); setModel(''); setGen(''); setMod(''); }} />
      </label>
      <label className="field">Модель
        <select className="input" name="model" value={model} required={!isNew} onChange={(e) => { setModel(e.target.value); setGen(''); setMod(''); }}>
          <option value="">{models.length ? '— выберите —' : make ? 'нет такой марки в каталоге' : 'сначала марка'}</option>
          {withCurrent(models, model).map((m) => <option key={m}>{m}</option>)}
        </select>
      </label>
      <label className="field">Год<input className="input" name="year" type="number" min={1950} max={2100} value={year} onChange={(e) => setYear(e.target.value)} /></label>
      <label className="field">Поколение
        <select className="input" name="generation" value={gen} onChange={(e) => { setGen(e.target.value); setMod(''); }}>
          <option value="">— выберите —</option>
          {withCurrent(gens, gen).map((g) => <option key={g}>{g}</option>)}
        </select>
      </label>
      <label className="field" style={{ gridColumn: '1 / -1' }}>Модификация
        <select className="input" name="modification" value={mod} onChange={(e) => pickMod(e.target.value)}>
          <option value="">— выберите —</option>
          {mod && !mods.some((m) => m.name === mod) ? <option>{mod}</option> : null}
          {mods.map((m) => <option key={m.name} value={m.name}>{m.name}{m.complectations.length ? ` · ${m.complectations.join(', ')}` : ''}</option>)}
        </select>
        {info ? <span className="muted small">По каталогу: {info.body}, {info.doors} дв., {info.fuel.toLowerCase()} {info.engine} л, {info.power} л.с., {info.transmission.toLowerCase()}, привод {info.drive.toLowerCase()}, годы {info.years}</span> : null}
      </label>
      <label className="field">Комплектация
        <select className="input" name="complectation" defaultValue={init.complectation} key={mod}>
          <option value="">—</option>
          {withCurrent(info?.complectations ?? [], mod === init.modification ? init.complectation : '').map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label className="field">Кузов
        <select className="input" name="bodyType" value={spec.bodyType} onChange={set('bodyType')}>
          {isNew ? <option value="">— по каталогу —</option> : null}
          <option value="sedan">Седан</option><option value="suv">Внедорожник</option><option value="coupe">Купе</option><option value="pickup">Пикап</option><option value="minivan">Минивен</option><option value="wagon">Универсал</option>
        </select>
      </label>
      <label className="field">Мощность на сайте, л.с.<input className="input" name="powerHp" type="number" min={1} value={spec.powerHp} onChange={set('powerHp')} /></label>
      <label className="field">Двигатель<input className="input" name="engine" autoComplete="off" value={spec.engine} onChange={set('engine')} /></label>
      <label className="field">Коробка<input className="input" name="transmission" autoComplete="off" value={spec.transmission} onChange={set('transmission')} /></label>
      <label className="field">Привод<input className="input" name="drive" autoComplete="off" value={spec.drive} onChange={set('drive')} /></label>
    </>
  );
}
