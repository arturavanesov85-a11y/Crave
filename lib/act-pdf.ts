// Акт приёма-передачи автомобиля (выдача или возврат) в PDF: стороны, автомобиль, показания,
// чек-лист, повреждения, подписи и фото осмотра. Отправляется клиенту в бот и скачивается из CRM.
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { fmtDateTime } from './dates';
import { db, json } from './db';
import { STORAGE_DIR } from './files';
import { formatPhone } from './orders';

const FONTS = join(process.cwd(), 'assets', 'fonts');
const W = 595.28, H = 841.89, M = 40;
const INK = '#141414', MUTED = '#6b6b6b', LINE = '#d9d6cf', BAR = '#141414', ACCENT = '#b3261e';
const CHECKS: [string, string][] = [['docs', 'Документы на автомобиль'], ['keys', 'Ключи'], ['clean', 'Чистота'], ['kit', 'Комплектность'], ['tires', 'Шины и диски'], ['lights', 'Световые приборы']];

export const actFileName = (number: string, kind: 'pickup' | 'return') => `CRAVE_akt_${kind === 'pickup' ? 'vydachi' : 'vozvrata'}_${number}.pdf`;

type Img = { data: Buffer; width: number; height: number; caption: string | null };

async function photo(path: string, caption: string | null): Promise<Img | null> {
  const file = normalize(join(STORAGE_DIR, path));
  if (!file.startsWith(STORAGE_DIR)) return null;
  try {
    const { data, info } = await sharp(await readFile(file)).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, caption };
  } catch {
    return null;
  }
}

export async function buildAct(orderId: string, kind: 'pickup' | 'return'): Promise<Buffer | null> {
  const o = await db.rentalOrder.findUnique({ where: { id: orderId }, include: { vehicle: true, customer: true, inspections: { include: { photos: true, damages: true } } } });
  const insp = o?.inspections.find((i) => i.kind === kind);
  if (!o || !insp) return null;
  const pickup = o.inspections.find((i) => i.kind === 'pickup');
  const earlier = await db.damage.findMany({ where: { vehicleId: o.vehicleId, status: 'open', createdAt: { lt: insp.performedAt }, inspectionId: { not: insp.id } } });
  const performer = await db.user.findUnique({ where: { id: insp.performedBy }, select: { fullName: true } });
  const checklist = json<Record<string, boolean>>(insp.checklist, {});
  const images = (await Promise.all(insp.photos.map((p) => photo(p.path, p.caption)))).filter((x): x is Img => !!x);

  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false, info: { Title: `${kind === 'pickup' ? 'Акт выдачи' : 'Акт возврата'} ${o.number}`, Author: 'CRAVE' } });
  doc.registerFont('r', join(FONTS, 'NotoSerif-Regular.ttf'));
  doc.registerFont('b', join(FONTS, 'NotoSerif-Bold.ttf'));
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res, rej) => { doc.on('end', () => res(Buffer.concat(chunks))); doc.on('error', rej); });
  const mark = await sharp(join(process.cwd(), 'public', 'brand', 'crave-mark.webp')).resize({ width: 360 }).png().toBuffer();
  const title = kind === 'pickup' ? 'АКТ ПРИЁМА-ПЕРЕДАЧИ (ВЫДАЧА)' : 'АКТ ПРИЁМА-ПЕРЕДАЧИ (ВОЗВРАТ)';

  const page = () => {
    doc.addPage();
    doc.rect(M, M - 14, W - 2 * M, 32).fill(BAR);
    doc.image(mark, M + 10, M - 8, { height: 20 });
    doc.font('b').fontSize(8).fillColor('#ffffff').text(`ЗАКАЗ ${o.number}`, M, M - 2, { width: W - 2 * M - 12, align: 'right', lineBreak: false });
    doc.font('r').fontSize(7).fillColor(MUTED).text(`CRAVE · ${title.toLowerCase()} · заказ ${o.number}`, M, H - 28, { width: W - 2 * M, align: 'right', lineBreak: false });
  };
  let y = 0;
  const heading = (t: string) => {
    y += 8;
    doc.font('b').fontSize(10).fillColor(ACCENT).text(t.toUpperCase(), M, y);
    y += 16;
  };
  const row = (k: string, v: string) => {
    doc.font('r').fontSize(9).fillColor(MUTED).text(k, M, y, { width: 170 });
    const h = doc.font('b').fontSize(9.5).fillColor(INK).heightOfString(v || '—', { width: W - 2 * M - 180 });
    doc.text(v || '—', M + 180, y, { width: W - 2 * M - 180 });
    y += Math.max(h, 12) + 5;
  };
  const ensure = (h: number) => { if (y + h > H - 60) { page(); y = M + 34; } };

  page();
  y = M + 34;
  doc.font('b').fontSize(16).fillColor(INK).text(title, M, y);
  y += 26;
  doc.font('r').fontSize(9).fillColor(MUTED).text(`${fmtDateTime(insp.performedAt)} · Москва`, M, y);
  y += 18;

  heading('Стороны');
  row('Арендодатель', 'CRAVE — прокат премиальных автомобилей');
  row('Арендатор', `${o.customer.fullName}, ${formatPhone(o.customer.phone)}`);
  row('Осмотр провёл', performer?.fullName ?? '—');

  heading('Автомобиль');
  row('Марка и модель', `${o.vehicle.title}, ${o.vehicle.year}`);
  if (o.vehicle.plate) row('Госномер', o.vehicle.plate);
  if (o.vehicle.vin) row('VIN', o.vehicle.vin);
  if (o.vehicle.colorExterior) row('Цвет', o.vehicle.colorExterior);
  row('Период аренды', `${fmtDateTime(o.pickupAt)} — ${fmtDateTime(o.returnAt)}`);

  heading('Показания');
  row('Пробег', `${insp.mileageKm.toLocaleString('ru-RU')} км${kind === 'return' && pickup ? ` (при выдаче ${pickup.mileageKm.toLocaleString('ru-RU')} км, пройдено ${(insp.mileageKm - pickup.mileageKm).toLocaleString('ru-RU')} км)` : ''}`);
  row('Топливо', `${insp.fuelPercent}%${kind === 'return' && pickup ? ` (при выдаче ${pickup.fuelPercent}%)` : ''}`);

  heading('Комплектность и состояние');
  for (const [k, l] of CHECKS) row(l, checklist[k] ? 'в порядке' : 'есть замечания');

  heading(kind === 'pickup' ? 'Повреждения на момент выдачи' : 'Повреждения');
  if (earlier.length) {
    doc.font('r').fontSize(8.5).fillColor(MUTED).text('Зафиксированы ранее:', M, y);
    y += 13;
    for (const d of earlier) { ensure(14); doc.font('r').fontSize(9).fillColor(INK).text(`• ${d.location}${d.description && d.description !== d.location ? ` — ${d.description}` : ''}`, M + 8, y, { width: W - 2 * M - 8 }); y += 13; }
  }
  if (insp.damages.length) {
    doc.font('r').fontSize(8.5).fillColor(MUTED).text(kind === 'pickup' ? 'Отмечены при этом осмотре:' : 'Новые, выявлены при возврате:', M, y);
    y += 13;
    for (const d of insp.damages) { ensure(14); doc.font('b').fontSize(9).fillColor(INK).text(`• ${d.location}${d.description && d.description !== d.location ? ` — ${d.description}` : ''}`, M + 8, y, { width: W - 2 * M - 8 }); y += 13; }
  }
  if (!earlier.length && !insp.damages.length) { doc.font('r').fontSize(9).fillColor(INK).text('Не выявлено.', M, y); y += 14; }

  if (insp.notes) { heading('Примечания'); doc.font('r').fontSize(9).fillColor(INK).text(insp.notes, M, y, { width: W - 2 * M }); y += doc.heightOfString(insp.notes, { width: W - 2 * M }) + 6; }

  ensure(110);
  y += 14;
  doc.font('r').fontSize(8.5).fillColor(MUTED).text(`Стороны подтверждают, что автомобиль ${kind === 'pickup' ? 'передан арендатору' : 'возвращён арендодателю'} в состоянии, описанном в акте и на фотографиях (${images.length} шт.).`, M, y, { width: W - 2 * M });
  y += 34;
  const sw = (W - 2 * M - 30) / 2;
  for (const [i, who] of [[0, 'Арендодатель'], [1, 'Арендатор']] as const) {
    const x = M + i * (sw + 30);
    doc.moveTo(x, y + 26).lineTo(x + sw, y + 26).strokeColor(LINE).lineWidth(0.8).stroke();
    doc.font('r').fontSize(8).fillColor(MUTED).text(`${who} — подпись, ФИО`, x, y + 30, { width: sw });
  }

  // Фото — по 4 на страницу, с подписями повреждений.
  const cellW = (W - 2 * M - 16) / 2, cellH = (H - M - 34 - 70 - 16) / 2;
  images.forEach((img, i) => {
    if (i % 4 === 0) { page(); doc.font('b').fontSize(10).fillColor(INK).text(`Фото осмотра · ${i + 1}–${Math.min(i + 4, images.length)} из ${images.length}`, M, M + 30); }
    const cx = M + (i % 2) * (cellW + 16);
    const cy = M + 50 + Math.floor((i % 4) / 2) * (cellH + 16);
    const capH = img.caption ? 14 : 0;
    const k = Math.min(cellW / img.width, (cellH - capH) / img.height);
    doc.image(img.data, cx + (cellW - img.width * k) / 2, cy, { width: img.width * k, height: img.height * k });
    if (img.caption) doc.font('b').fontSize(8).fillColor(ACCENT).text(img.caption, cx, cy + img.height * k + 3, { width: cellW, lineBreak: false, ellipsis: true });
  });

  doc.end();
  return done;
}
