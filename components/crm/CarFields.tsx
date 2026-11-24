'use client';

// Блок «Автомобиль» — один и тот же для проката и для «Авто в продаже».
// VIN сверху: «Расшифровать» определяет марку, модель, год и по возможности модификацию.
// Марка → модель → поколение → модификация выбираются из каталога Авито; по модификации
// кузов, мощность, двигатель, коробка и привод заполняются сами (их можно поправить для сайта).
import { useEffect, useState } from 'react';
import type { ModInfo } from '@/lib/avito';
import type { VinResult } from '@/lib/vin';

const BODY_OPTS: [string, string][] = [['sedan', 'Седан'], ['suv', 'Внедорожник'], ['coupe', 'Купе'], ['pickup', 'Пикап'], ['minivan', 'Минивен'], ['wagon', 'Универсал']];
const BODY: Record<string, string> = { Седан: 'sedan', Внедорожник: 'suv', Купе: 'coupe', Пикап: 'pickup', Минивэн: 'minivan', Минивен: 'minivan', Универсал: 'wagon' };
export const CAR_COLORS = ['Белый', 'Бежевый', 'Бордовый', 'Голубой', 'Жёлтый', 'Зелёный', 'Золотой', 'Коричневый', 'Красный', 'Оранжевый', 'Пурпурный', 'Розовый', 'Серебряный', 'Серый', 'Синий', 'Фиолетовый', 'Чёрный'];

async function load(q: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
  const r = await fetch(`/api/avito/catalog?${qs}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Каталог Авито недоступен');
  return j;
}

export type CarInit = {
  vin: string; plate: string; make: string; model: string; year: string; generation: string; modification: string; complectation: string;
  bodyType: string; powerHp: string; drive: string; mileageKm: string; color: string; colorInterior: string; title: string; autoTitle: string;
  description: string; equipment: string;
  // продажа
  engine: string; transmission: string; owners: string; accident: string; wheel: string;
  // прокат
  fuel: string; accel: string; seats: string;
};

export function CarFields({ kind, init, isNew, showVin = true, showPlate = false }: { kind: 'rental' | 'sale'; init: CarInit; isNew: boolean; showVin?: boolean; showPlate?: boolean }) {
  const rental = kind === 'rental';
  const [vin, setVin] = useState(init.vin);
  const [make, setMake] = useState(init.make);
  const [model, setModel] = useState(init.model);
  const [year, setYear] = useState(init.year);
  const [gen, setGen] = useState(init.generation);
  const [mod, setMod] = useState(init.modification);
  const [compl, setCompl] = useState(init.complectation);
  const [spec, setSpec] = useState({ bodyType: init.bodyType, powerHp: init.powerHp, engine: init.engine, transmission: init.transmission, drive: init.drive, fuel: init.fuel });
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [gens, setGens] = useState<string[]>([]);
  const [mods, setMods] = useState<ModInfo[]>([]);
  const [err, setErr] = useState('');
  const [vinMsg, setVinMsg] = useState<{ text: string; tone: 'ok' | 'warn' | 'error' } | null>(null);
  const [decoding, setDecoding] = useState(false);

  useEffect(() => { load({}).then((j) => setMakes(j.makes)).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { setModels([]); if (make) load({ make }).then((j) => setModels(j.models)).catch(() => {}); }, [make]);
  useEffect(() => { setGens([]); if (make && model) load({ make, model, year: Number(year) || undefined }).then((j) => setGens(j.generations)).catch(() => {}); }, [make, model, year]);
  useEffect(() => { setMods([]); if (make && model && gen) load({ make, model, generation: gen }).then((j) => setMods(j.modifications)).catch(() => {}); }, [make, model, gen]);

  const info = mods.find((m) => m.name === mod);
  function applyMod(m: ModInfo) {
    setSpec((s) => ({
      ...s,
      bodyType: BODY[m.body] ?? s.bodyType,
      powerHp: String(m.power || s.powerHp),
      engine: [m.fuel.toLowerCase(), m.engine ? `${m.engine} л` : ''].filter(Boolean).join(', '),
      transmission: m.transmission.toLowerCase(),
      drive: m.drive.toLowerCase(),
      fuel: ['бензин', 'дизель', 'гибрид', 'электро'].find((f) => m.fuel.toLowerCase().startsWith(f.slice(0, 4))) ?? s.fuel,
    }));
  }
  function pickMod(name: string) {
    setMod(name);
    const m = mods.find((x) => x.name === name);
    if (m) applyMod(m);
  }

  async function decode() {
    setDecoding(true);
    setVinMsg(null);
    try {
      const r = await fetch(`/api/vin?vin=${encodeURIComponent(vin)}`);
      const j = (await r.json()) as VinResult & { error?: string };
      if (!r.ok) throw new Error(j.error);
      setVin(j.vin);
      if (j.year) setYear(String(j.year));
      // Что расшифровка не нашла — оставляем как было, если марка та же.
      const sameMake = !j.make || j.make === make;
      if (j.make) setMake(j.make);
      if (j.model || !sameMake) setModel(j.model ?? '');
      if (j.generation || !sameMake || j.model) setGen(j.generation ?? '');
      if (j.modification || !sameMake || j.model) setMod(j.modification ?? '');
      if (j.complectation) setCompl(j.complectation);
      if (j.mod) applyMod(j.mod);
      const found = [j.make, j.model, j.year, j.generation, j.modification].filter(Boolean).join(' · ');
      setVinMsg({ text: `${found || 'Почти ничего не найдено'}${j.note ? `. ${j.note}` : ''}`, tone: j.modification ? 'ok' : 'warn' });
    } catch (e) {
      setVinMsg({ text: e instanceof Error && e.message ? e.message : 'Не удалось расшифровать VIN', tone: 'error' });
    } finally {
      setDecoding(false);
    }
  }

  const set = (k: keyof typeof spec) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setSpec({ ...spec, [k]: e.target.value });
  const withCurrent = (list: string[], v: string) => (v && !list.includes(v) ? [v, ...list] : list);
  const full = { gridColumn: '1 / -1' };

  return (
    <div className="stack">
      {err ? <p className="error-text">{err}</p> : null}
      <div className="grid-2 stack-sm">
        {showVin ? (
          <label className="field">VIN
            <div className="row" style={{ gap: 6 }}>
              <input className="input" name="vin" value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} maxLength={17} autoComplete="off" placeholder="17 знаков" style={{ fontFamily: 'monospace', flex: 1 }} />
              <button type="button" className="btn btn-quiet btn-sm" onClick={decode} disabled={decoding || vin.replace(/\s/g, '').length !== 17}>{decoding ? '…' : 'Расшифровать'}</button>
            </div>
            {vinMsg ? <span className={`small ${vinMsg.tone === 'error' ? 'error-text' : vinMsg.tone === 'warn' ? 'warn' : 'gold'}`}>{vinMsg.text}</span> : <span className="muted small">Заполнит марку, модель, год и по возможности модификацию</span>}
          </label>
        ) : <p className="muted small">VIN и госномер скрыты для вашей роли.</p>}
        {showPlate ? <label className="field">Госномер{rental ? '' : ' (если на учёте — нужен для Авито)'}<input className="input" name="plate" defaultValue={init.plate} autoComplete="off" placeholder="А123ВС777" /></label> : null}
      </div>

      <datalist id="avito-makes">{makes.map((m) => <option key={m} value={m} />)}</datalist>
      <div className="grid-2 stack-sm">
        <label className="field">Марка (каталог Авито)
          <input className="input" name="make" list="avito-makes" value={make} required={!isNew || rental} autoComplete="off" placeholder="начните вводить"
            onChange={(e) => { setMake(e.target.value); setModel(''); setGen(''); setMod(''); }} />
        </label>
        <label className="field">Модель
          <select className="input" name="model" value={model} required={!isNew || rental} onChange={(e) => { setModel(e.target.value); setGen(''); setMod(''); }}>
            <option value="">{models.length ? '— выберите —' : make ? 'нет такой марки в каталоге' : 'сначала марка'}</option>
            {withCurrent(models, model).map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label className="field">Год<input className="input" name="year" type="number" min={1950} max={2100} value={year} required={rental} onChange={(e) => setYear(e.target.value)} /></label>
        <label className="field">Поколение
          <select className="input" name="generation" value={gen} onChange={(e) => { setGen(e.target.value); setMod(''); }}>
            <option value="">— выберите —</option>
            {withCurrent(gens, gen).map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
        <label className="field" style={full}>Модификация
          <select className="input" name="modification" value={mod} onChange={(e) => pickMod(e.target.value)}>
            <option value="">— выберите —</option>
            {mod && !mods.some((m) => m.name === mod) ? <option>{mod}</option> : null}
            {mods.map((m) => <option key={m.name} value={m.name}>{m.name}{m.complectations.length ? ` · ${m.complectations.join(', ')}` : ''}</option>)}
          </select>
          {info ? <span className="muted small">По каталогу: {info.body}, {info.doors} дв., {info.fuel.toLowerCase()} {info.engine} л, {info.power} л.с., {info.transmission.toLowerCase()}, привод {info.drive.toLowerCase()}, годы {info.years}</span> : null}
        </label>
        <label className="field">Комплектация
          <select className="input" name="complectation" value={compl} onChange={(e) => setCompl(e.target.value)}>
            <option value="">—</option>
            {withCurrent(info?.complectations ?? [], compl).map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">Название на сайте<input className="input" name="title" defaultValue={init.title !== init.autoTitle ? init.title : ''} placeholder={init.autoTitle || 'пусто — марка, модель и комплектация'} /></label>
      </div>

      <div className="grid-2 stack-sm">
        <label className="field">Кузов
          <select className="input" name="bodyType" value={spec.bodyType} onChange={set('bodyType')}>
            {isNew && !rental ? <option value="">— по каталогу —</option> : null}
            {BODY_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="field">Мощность на сайте, л.с.<input className="input" name="powerHp" type="number" min={1} value={spec.powerHp} required={rental} onChange={set('powerHp')} /></label>
        {rental ? (
          <>
            <label className="field">Топливо<select className="input" name="fuel" value={spec.fuel} onChange={set('fuel')}><option value="бензин">Бензин</option><option value="дизель">Дизель</option><option value="гибрид">Гибрид</option><option value="электро">Электро</option></select></label>
            <label className="field">Разгон 0–100, с<input className="input" name="accel" placeholder="3,9" defaultValue={init.accel} required /></label>
          </>
        ) : (
          <>
            <label className="field">Двигатель<input className="input" name="engine" autoComplete="off" value={spec.engine} onChange={set('engine')} /></label>
            <label className="field">Коробка<input className="input" name="transmission" autoComplete="off" value={spec.transmission} onChange={set('transmission')} /></label>
          </>
        )}
        <label className="field">Привод<select className="input" name="drive" value={spec.drive} onChange={set('drive')}>{withCurrent(['полный', 'задний', 'передний'], spec.drive).map((d) => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}</select></label>
        {rental ? <label className="field">Мест<input className="input" name="seats" type="number" min={1} max={9} defaultValue={init.seats} /></label> : null}
        <label className="field">Пробег, км<input className="input" name="mileageKm" type="number" min={0} defaultValue={init.mileageKm} /></label>
        <label className="field">Цвет кузова
          <select className="input" name={rental ? 'colorExterior' : 'color'} defaultValue={init.color}>
            <option value="">—</option>
            {init.color && !CAR_COLORS.includes(init.color) ? <option value={init.color}>{init.color} (не из списка Авито)</option> : null}
            {CAR_COLORS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">Цвет салона<input className="input" name="colorInterior" autoComplete="off" placeholder="бежевый" defaultValue={init.colorInterior} /></label>
        {!rental ? (
          <>
            <label className="field">Владельцев по ПТС<select className="input" name="owners" defaultValue={init.owners}><option value="">—</option>{['1', '2', '3', '4+'].map((o) => <option key={o}>{o}</option>)}</select></label>
            <label className="field">Состояние<select className="input" name="accident" defaultValue={init.accident || 'Не битый'}><option>Не битый</option><option>Битый</option></select></label>
            <label className="field">Руль<select className="input" name="wheel" defaultValue={init.wheel || 'Левый'}><option>Левый</option><option>Правый</option></select></label>
          </>
        ) : null}
      </div>

      {rental ? <label className="field">Описание для сайта<textarea className="input" name="description" rows={4} defaultValue={init.description} /></label> : null}
      <label className="field">{rental ? 'Комплектация' : 'Описание и комплектация (на сайте и на Авито)'} — по одному пункту в строке. Строка с двоеточием на конце — заголовок группы («Салон и комфорт:»)<textarea className="input" name="equipment" rows={rental ? 6 : 14} defaultValue={init.equipment} /></label>
    </div>
  );
}
