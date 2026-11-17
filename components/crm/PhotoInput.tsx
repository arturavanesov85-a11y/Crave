'use client';

// Выбор фото с уменьшением прямо в браузере: длинная сторона до 2000 px, JPEG 90%.
// Фото с телефона весят 5–50 МБ — после уменьшения около 0,5–1 МБ: загрузка быстрее,
// сервер не тратит память на огромные снимки. Если браузер не умеет открыть формат
// (например, HEIC в Chrome), файл отправляется как есть и уменьшается на сервере.
import { useRef, useState } from 'react';

const MAX_SIDE = 2000;

/** Уменьшает фото в браузере (до 2000 px, JPEG 90%); если формат не открывается — возвращает как есть. */
export async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 600 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}

export function PhotoInput({ name = 'photos', label, required }: { name?: string; label: React.ReactNode; required?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<string>('');
  const busy = useRef(false);

  async function onChange() {
    const input = ref.current;
    if (!input?.files?.length || busy.current) return;
    busy.current = true;
    const files = [...input.files];
    const before = files.reduce((s, f) => s + f.size, 0);
    setState(`Подготовка фото: 0 из ${files.length}…`);
    const out: File[] = [];
    for (const f of files) {
      out.push(await shrink(f));
      setState(`Подготовка фото: ${out.length} из ${files.length}…`);
    }
    const dt = new DataTransfer();
    out.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    const after = out.reduce((s, f) => s + f.size, 0);
    const mb = (n: number) => (n / 1048576).toFixed(1).replace('.', ',');
    setState(`Готово: ${files.length} фото, ${mb(after)} МБ${after < before ? ` (было ${mb(before)} МБ)` : ''}`);
    busy.current = false;
  }

  return (
    <label className="field">
      {label}
      <input ref={ref} className="input" style={{ paddingTop: 10 }} type="file" name={name} accept="image/*" multiple required={required} onChange={onChange} />
      {state ? <span className="muted small" role="status">{state}</span> : null}
    </label>
  );
}
