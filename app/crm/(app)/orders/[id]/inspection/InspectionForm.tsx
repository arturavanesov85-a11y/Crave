'use client';

import { startTransition, useActionState, useEffect, useRef, useState } from 'react';
import { inspectionAction } from '../../../../actions';

const CHECKS: [string, string][] = [['docs', 'Документы на автомобиль'], ['keys', 'Ключи'], ['clean', 'Чистота'], ['kit', 'Комплектность'], ['tires', 'Шины и диски'], ['lights', 'Световые приборы']];

type Shot = { file: File; url: string };

/** Камера в браузере: живое превью и съёмка подряд. Нужен https или localhost. */
function CameraPanel({ onShot }: { onShot: (f: File) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState('');
  // Определяется в браузере после загрузки, чтобы разметка сервера и клиента совпадала.
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => setSupported(!!navigator.mediaDevices?.getUserMedia && window.isSecureContext), []);

  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);
  useEffect(() => {
    if (video.current && stream) video.current.srcObject = stream;
  }, [stream]);

  async function open() {
    setError('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      setStream(s);
    } catch {
      setError('Нет доступа к камере. Разрешите доступ в настройках браузера или используйте «Сфотографировать».');
    }
  }
  function close() {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  }
  function shoot() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob((b) => b && onShot(new File([b], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })), 'image/jpeg', 0.88);
  }

  if (supported === null) return null;
  if (!supported) return <p className="muted small">Встроенная камера доступна по https или на localhost. Используйте кнопку «Сфотографировать» — откроется камера телефона.</p>;
  if (!stream)
    return (
      <div className="stack" style={{ gap: 6 }}>
        <button type="button" className="btn btn-primary" onClick={open}>Открыть камеру</button>
        {error ? <p className="error-text">{error}</p> : null}
      </div>
    );
  return (
    <div className="stack" style={{ gap: 8 }}>
      <video ref={video} autoPlay playsInline muted style={{ width: '100%', borderRadius: 12, background: '#000', aspectRatio: '4 / 3', objectFit: 'cover' }} />
      <div className="wrap-row">
        <button type="button" className="btn btn-primary grow" onClick={shoot} style={{ minHeight: 56 }}>Снять кадр</button>
        <button type="button" className="btn btn-quiet" onClick={close}>Закрыть камеру</button>
      </div>
    </div>
  );
}

export function InspectionForm({ id, kind, mileage, damageHints, locationHints, descriptionHints, noteHints }: { id: string; kind: 'pickup' | 'return'; mileage: number; damageHints: string[]; locationHints: string[]; descriptionHints: string[]; noteHints: string[] }) {
  const [state, action, pending] = useActionState(inspectionAction, undefined);
  const [shots, setShots] = useState<Shot[]>([]);
  const [damages, setDamages] = useState<string[]>([]);
  const [loc, setLoc] = useState('');
  const [desc, setDesc] = useState('');
  const [notes, setNotes] = useState('');
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  useEffect(() => () => shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url)), []);

  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    setShots((prev) => [...prev, ...Array.from(files).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };
  const removeShot = (i: number) => setShots((prev) => prev.filter((s, idx) => (idx === i ? (URL.revokeObjectURL(s.url), false) : true)));
  const addDamage = (line: string) => {
    const l = line.trim();
    if (l && !damages.includes(l)) setDamages([...damages, l]);
  };
  const appendNote = (n: string) => setNotes((prev) => (prev.trim() ? `${prev.trim()}. ${n}` : n));

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.delete('photos');
    for (const s of shots) fd.append('photos', s.file);
    fd.set('damages', damages.join('\n'));
    fd.set('notes', notes);
    startTransition(() => action(fd));
  }

  return (
    <form onSubmit={submit} className="card pad stack">
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

      <section className="stack" style={{ gap: 10 }}>
        <h2>Фотофиксация · {shots.length}</h2>
        <CameraPanel onShot={(f) => addFiles([f])} />
        <div className="wrap-row">
          <label className="btn btn-quiet btn-sm" style={{ cursor: 'pointer' }}>
            Сфотографировать
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </label>
          <label className="btn btn-quiet btn-sm" style={{ cursor: 'pointer' }}>
            Из галереи
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
        {shots.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
            {shots.map((s, i) => (
              <div key={s.url} style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.url} alt={`Фото ${i + 1}`} style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
                <button type="button" aria-label={`Удалить фото ${i + 1}`} onClick={() => removeShot(i)} style={{ position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: 999, border: 0, background: 'rgba(10,10,9,.8)', color: 'var(--text)' }}>✕</button>
              </div>
            ))}
          </div>
        ) : <p className="muted small">Нужна хотя бы одна фотография.</p>}
      </section>

      <section className="stack" style={{ gap: 8 }}>
        <h2>Новые повреждения · {damages.length}</h2>
        {damages.length ? (
          <ul className="list">{damages.map((d) => <li key={d}><span className="grow">{d}</span><button type="button" className="btn btn-quiet btn-sm" onClick={() => setDamages(damages.filter((x) => x !== d))}>Убрать</button></li>)}</ul>
        ) : null}
        <div className="grid-2 stack-sm">
          <label className="field">Место<input className="input" list="dmg-locations" value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Передний бампер справа" /></label>
          <label className="field">Описание<input className="input" list="dmg-descriptions" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="скол 2 см" /></label>
        </div>
        <datalist id="dmg-locations">{locationHints.map((h) => <option key={h} value={h} />)}</datalist>
        <datalist id="dmg-descriptions">{descriptionHints.map((h) => <option key={h} value={h} />)}</datalist>
        <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} disabled={!loc.trim()} onClick={() => { addDamage(desc.trim() ? `${loc.trim()} — ${desc.trim()}` : loc.trim()); setLoc(''); setDesc(''); }}>Добавить повреждение</button>
        {damageHints.length ? (
          <div className="stack" style={{ gap: 6 }}>
            <span className="muted small">Вводили ранее — нажмите, чтобы добавить:</span>
            <div className="wrap-row" style={{ gap: 6 }}>{damageHints.map((h) => <button key={h} type="button" className="chip" style={{ minHeight: 36, fontSize: 13 }} onClick={() => addDamage(h)}>{h}</button>)}</div>
          </div>
        ) : null}
      </section>

      <section className="stack" style={{ gap: 8 }}>
        <label className="field">Заметки<textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        {noteHints.length ? (
          <div className="wrap-row" style={{ gap: 6 }}>{noteHints.map((h) => <button key={h} type="button" className="chip" style={{ minHeight: 36, fontSize: 13 }} onClick={() => appendNote(h)}>{h}</button>)}</div>
        ) : null}
      </section>

      {kind === 'return' ? (
        <div className="stack" style={{ gap: 4 }}>
          <span className="muted small">Предложенные доплаты (проводятся только если отмечены)</span>
          <label className="check"><input type="checkbox" name="chargeOver" />Начислить перепробег</label>
          <label className="check"><input type="checkbox" name="chargeLate" />Начислить опоздание</label>
          <span className="muted small">Удержания из залога за повреждения — отдельным запросом во вкладке «Оплаты», с подтверждением руководителя.</span>
        </div>
      ) : null}
      {state?.error ? <p className="error-text" role="alert">{state.error}</p> : null}
      <button className="btn btn-primary btn-block" type="submit" disabled={pending || !shots.length}>{pending ? 'Сохраняем…' : kind === 'pickup' ? 'Выдать автомобиль' : 'Принять автомобиль'}</button>
    </form>
  );
}
