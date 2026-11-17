// Коммерческое предложение (КП) на автомобиль в продаже — PDF по образцу CRAVE:
// альбомный A4; 1-я страница — название, цвета, характеристики, итоговая стоимость и главное фото;
// 2-я — оснащение по группам; дальше — по фото на страницу.
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { json } from './db';
import { rub } from './money';
import { PUBLIC_MEDIA_DIR } from './public-media';
import { equipmentGroups } from './sales';

type Car = { title: string; make: string; model: string; year: number; mileageKm: number; powerHp: number | null; engine: string | null; transmission: string | null; drive: string | null; color: string | null; colorInterior: string | null; equipment: string | null; photos: string | null };
export type KpOptions = { price: number | null; vat: boolean };

const FONTS = join(process.cwd(), 'assets', 'fonts');
const W = 841.89, H = 595.28, M = 28;
const INK = '#141414', MUTED = '#6b6b6b', ACCENT = '#b3261e', BAR = '#141414';

/** Путь к файлу фото: /media/... — загруженные из CRM, остальное — из public. */
function photoFile(url: string): string | null {
  const root = url.startsWith('/media/') ? PUBLIC_MEDIA_DIR : join(process.cwd(), 'public');
  const file = normalize(join(root, url.startsWith('/media/') ? url.slice('/media/'.length) : url));
  return file.startsWith(root) ? file : null;
}

type Img = { data: Buffer; width: number; height: number };

async function jpeg(url: string): Promise<Img | null> {
  const file = photoFile(url);
  if (!file) return null;
  try {
    const { data, info } = await sharp(await readFile(file)).rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

let logoCache: Buffer | null = null;
async function logo() {
  logoCache ??= await sharp(join(process.cwd(), 'public', 'brand', 'crave-mark.webp')).resize({ width: 400 }).png().toBuffer();
  return logoCache;
}

export function kpFileName(c: { make: string; model: string; year: number }) {
  return `CRAVE_${c.make}_${c.model}_${c.year}`.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/_+$/, '') + '.pdf';
}

export async function buildKp(car: Car, opt: KpOptions): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, autoFirstPage: false, info: { Title: `${car.title} ${car.year} — коммерческое предложение`, Author: 'CRAVE' } });
  doc.registerFont('r', join(FONTS, 'NotoSerif-Regular.ttf'));
  doc.registerFont('b', join(FONTS, 'NotoSerif-Bold.ttf'));
  doc.registerFont('i', join(FONTS, 'NotoSerif-Italic.ttf'));
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res, rej) => { doc.on('end', () => res(Buffer.concat(chunks))); doc.on('error', rej); });

  const mark = await logo();
  const crumbs = [car.make, car.model, String(car.year)].map((s) => s.toUpperCase()).join('  /  ');

  const page = () => {
    doc.addPage();
    doc.rect(M, M - 8, W - 2 * M, 34).fill(BAR);
    doc.image(mark, M + 12, M - 2, { height: 22 });
    doc.font('b').fontSize(8).fillColor('#ffffff').text(crumbs, M, M + 5, { width: W - 2 * M - 14, align: 'right', lineBreak: false });
    doc.font('r').fontSize(6.5).fillColor(MUTED).text('CRAVE   •   КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ', M, H - 22, { width: W - 2 * M, align: 'right', lineBreak: false });
  };
  /** Фото по центру области, с сохранением пропорций. */
  const photo = (img: Img, x: number, y: number, w: number, h: number) => {
    const k = Math.min(w / img.width, h / img.height);
    doc.image(img.data, x + (w - img.width * k) / 2, y + (h - img.height * k) / 2, { width: img.width * k, height: img.height * k });
  };

  // 1. Обложка
  page();
  let y = M + 40;
  const name = `${car.make} ${car.model}`.toUpperCase();
  doc.font('b').fontSize(24).fillColor(INK).text(name, M, y, { continued: true, lineBreak: false }).font('r').fontSize(15).fillColor(MUTED).text(`   /   ${car.year}`, { lineBreak: false });
  y += 36;
  const pairs: [string, string | null][] = [
    ['КУЗОВ', car.color], ['САЛОН', car.colorInterior], ['МОЩНОСТЬ', car.powerHp ? `${car.powerHp} л.с.` : null],
    ['ПРОБЕГ', `${car.mileageKm.toLocaleString('ru-RU')} км`], ['ДВИГАТЕЛЬ', car.engine], ['КОРОБКА', car.transmission], ['ПРИВОД', car.drive],
  ];
  let x = M;
  for (const [k, v] of pairs) {
    if (!v) continue;
    const kw = doc.font('r').fontSize(7).widthOfString(k) + 5;
    const vw = doc.font('b').fontSize(9).widthOfString(v);
    if (x + kw + vw > W - M) { x = M; y += 15; }
    doc.font('r').fontSize(7).fillColor(MUTED).text(k, x, y + 1.5, { lineBreak: false });
    doc.font('b').fontSize(9).fillColor(INK).text(v, x + kw, y, { lineBreak: false });
    x += kw + vw + 22;
  }
  y += 22;
  doc.rect(M, y, W - 2 * M, 38).fill(BAR);
  doc.font('b').fontSize(9).fillColor('#ffffff').text(opt.vat ? 'ИТОГОВАЯ СТОИМОСТЬ С НДС' : 'ИТОГОВАЯ СТОИМОСТЬ', M + 12, y + 14, { lineBreak: false });
  doc.font('b').fontSize(18).fillColor('#ffffff').text(opt.price ? rub(opt.price) : 'По запросу', M, y + 8, { width: W - 2 * M - 14, align: 'right', lineBreak: false });
  y += 50;

  const photos = json<string[]>(car.photos, []);
  const images: Img[] = [];
  for (const p of photos) {
    const b = await jpeg(p);
    if (b) images.push(b);
  }
  if (images[0]) photo(images[0], M, y, W - 2 * M, H - y - 32);

  // 2. Оснащение — две колонки, при нехватке места продолжается на следующей странице
  const groups = equipmentGroups(json<string[]>(car.equipment, []));
  if (groups.length) {
    const colW = (W - 2 * M - 30) / 2;
    const top = M + 96, bottom = H - 50;
    const header = () => {
      page();
      doc.font('b').fontSize(20).fillColor(INK).text('ОСНАЩЕНИЕ АВТОМОБИЛЯ', M, M + 40, { lineBreak: false });
      doc.font('b').fontSize(8).fillColor(MUTED).text(crumbs, M, M + 68, { lineBreak: false });
    };
    header();
    let col = 0;
    y = top;
    const ensure = (h: number) => {
      if (y + h <= bottom) return;
      if (col === 0) { col = 1; y = top; return; }
      header(); col = 0; y = top;
    };
    for (const g of groups) {
      if (g.title) {
        ensure(34);
        doc.font('b').fontSize(9).fillColor(ACCENT).text(g.title.toUpperCase(), M + col * (colW + 30), y, { width: colW });
        y += 16;
      }
      for (const item of g.items) {
        const h = doc.font('r').fontSize(9).heightOfString(item, { width: colW - 12 }) + 5;
        ensure(h);
        const cx = M + col * (colW + 30);
        doc.font('r').fontSize(9).fillColor(ACCENT).text('•', cx, y, { lineBreak: false });
        doc.font('r').fontSize(9).fillColor(INK).text(item, cx + 12, y, { width: colW - 12 });
        y += h;
      }
      y += 8;
    }
  }

  // 3. Фото — по одному на страницу
  for (const img of images.slice(1)) {
    page();
    doc.font('b').fontSize(11).fillColor(INK).text(name, M, M + 34, { lineBreak: false });
    photo(img, M, M + 54, W - 2 * M, H - M - 54 - 30);
  }

  doc.end();
  return done;
}
