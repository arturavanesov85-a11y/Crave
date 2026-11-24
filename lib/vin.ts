// Расшифровка VIN: год и производитель — из самого номера, остальное — из базы NHTSA (vPIC),
// затем подбор марки, модели, поколения и модификации по каталогу Авито.
import { avitoCatalog, type CatalogRow, type ModInfo } from './avito';

const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789'; // 1980 (A) … 2009 (9), дальше цикл с 2010 (A)

/** Модельный год по 10-му знаку: из двух вариантов (через 30 лет) — ближайший, не позже следующего года. */
export function vinYear(vin: string): number | null {
  const i = YEAR_CODES.indexOf(vin[9]);
  if (i < 0) return null;
  const max = new Date().getFullYear() + 1;
  const late = 2010 + i;
  return late <= max ? late : 1980 + i;
}

// Производитель по первым знакам (WMI) — на случай, если база NHTSA не ответила.
const WMI: [string, string][] = [
  ['WBA', 'BMW'], ['WBS', 'BMW'], ['WBY', 'BMW'], ['5UX', 'BMW'], ['5YM', 'BMW'], ['4US', 'BMW'], ['X4X', 'BMW'], ['WMW', 'MINI'],
  ['WDD', 'Mercedes-Benz'], ['WDB', 'Mercedes-Benz'], ['WDC', 'Mercedes-Benz'], ['W1K', 'Mercedes-Benz'], ['W1N', 'Mercedes-Benz'], ['W1V', 'Mercedes-Benz'], ['4JG', 'Mercedes-Benz'], ['55S', 'Mercedes-Benz'], ['WMX', 'Mercedes-Benz'],
  ['WP0', 'Porsche'], ['WP1', 'Porsche'], ['WAU', 'Audi'], ['WUA', 'Audi'], ['TRU', 'Audi'], ['WVW', 'Volkswagen'], ['WVG', 'Volkswagen'], ['WV1', 'Volkswagen'], ['WV2', 'Volkswagen'],
  ['ZHW', 'Lamborghini'], ['ZFF', 'Ferrari'], ['ZAM', 'Maserati'], ['ZAR', 'Alfa Romeo'], ['SCB', 'Bentley'], ['SCA', 'Rolls-Royce'], ['SAL', 'Land Rover'], ['SAJ', 'Jaguar'], ['SCF', 'Aston Martin'], ['SBM', 'McLaren'], ['SCC', 'Lotus'],
  ['JTH', 'Lexus'], ['2T2', 'Lexus'], ['JT', 'Toyota'], ['5TD', 'Toyota'], ['5TF', 'Toyota'], ['JN1', 'Nissan'], ['JN8', 'Nissan'], ['JNK', 'Infiniti'], ['JNR', 'Infiniti'], ['5N1', 'Nissan'],
  ['1GY', 'Cadillac'], ['1GC', 'Chevrolet'], ['1G1', 'Chevrolet'], ['1GN', 'Chevrolet'], ['1GT', 'GMC'], ['1GK', 'GMC'], ['1FA', 'Ford'], ['1FT', 'Ford'], ['1FM', 'Ford'], ['5LM', 'Lincoln'],
  ['1C6', 'RAM'], ['3C6', 'RAM'], ['1C4', 'Jeep'], ['1J4', 'Jeep'], ['2C3', 'Dodge'], ['1C3', 'Chrysler'], ['2C4', 'Chrysler'], ['5YJ', 'Tesla'], ['7SA', 'Tesla'], ['LRW', 'Tesla'], ['XP7', 'Tesla'],
  ['KMH', 'Hyundai'], ['KM8', 'Hyundai'], ['KMU', 'Genesis'], ['KNA', 'Kia'], ['KND', 'Kia'], ['YV1', 'Volvo'], ['YV4', 'Volvo'], ['VF1', 'Renault'], ['VF3', 'Peugeot'], ['XTA', 'LADA (ВАЗ)'],
  ['LVS', 'Ford'], ['LFV', 'Volkswagen'], ['LB3', 'Geely'], ['L6T', 'Geely'], ['LVV', 'Chery'], ['LGW', 'Haval'], ['LGX', 'BYD'], ['LC0', 'BYD'], ['LS5', 'Changan'], ['LDP', 'Voyah'], ['LNB', 'Li'], ['HLX', 'Li'], ['LM6', 'Zeekr'], ['L6G', 'Zeekr'],
];
export const vinMake = (vin: string) => WMI.find(([w]) => vin.startsWith(w))?.[1] ?? null;

export const vinValid = (vin: string) => /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);

type Nhtsa = { make?: string; model?: string; year?: number; trim?: string; engine?: number; hp?: number; drive?: string; body?: string; fuel?: string };

async function nhtsa(vin: string): Promise<Nhtsa | null> {
  try {
    const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`, { signal: AbortSignal.timeout(8000) });
    const x = (await r.json()).Results?.[0];
    if (!x?.Make) return null;
    return {
      make: x.Make, model: x.Model || undefined, year: Number(x.ModelYear) || undefined, trim: x.Trim || x.Series2 || undefined,
      engine: Number(x.DisplacementL) || undefined, hp: Number(x.EngineHP) || undefined, drive: x.DriveType || undefined, body: x.BodyClass || undefined, fuel: x.FuelTypePrimary || undefined,
    };
  } catch {
    return null;
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9а-я]/g, '');
const modInfo = (r: CatalogRow): ModInfo => ({ name: r[3], body: r[6], doors: r[7], fuel: r[8], drive: r[9], transmission: r[10], power: r[11], engine: r[12], complectations: r[13], years: `${r[4] || '…'}–${r[5] || '…'}` });

export type VinResult = {
  vin: string; year: number | null; make: string | null; model: string | null; generation: string | null; modification: string | null; complectation: string | null;
  mod: ModInfo | null; source: string; note: string;
};

export async function decodeVin(raw: string): Promise<VinResult> {
  const vin = raw.toUpperCase().replace(/\s/g, '');
  if (!vinValid(vin)) throw new Error('VIN — 17 знаков: латинские буквы (кроме I, O, Q) и цифры');
  const n = await nhtsa(vin);
  const year = n?.year ?? vinYear(vin);
  const res: VinResult = { vin, year, make: null, model: null, generation: null, modification: null, complectation: null, mod: null, source: n ? 'база NHTSA + каталог Авито' : 'по коду производителя', note: '' };
  const cat = await avitoCatalog();
  const rawMake = n?.make ?? vinMake(vin);
  if (!cat || !rawMake) { res.make = rawMake; res.note = !rawMake ? 'Производитель не определён — выберите марку вручную' : 'Каталог Авито не загружен'; return res; }

  // Марка: точное совпадение без учёта регистра и знаков («MERCEDES-BENZ» → «Mercedes-Benz»).
  const makes = [...new Set(cat.rows.map((r) => r[0]))];
  const make = makes.find((m) => norm(m) === norm(rawMake)) ?? makes.find((m) => norm(m).startsWith(norm(rawMake)) || norm(rawMake).startsWith(norm(m)));
  if (!make) { res.make = rawMake; res.note = `Марки «${rawMake}» нет в каталоге Авито`; return res; }
  res.make = make;
  const byMake = cat.rows.filter((r) => r[0] === make);
  if (!n?.model) { res.note = 'Модель по VIN не определена — выберите из списка'; return res; }

  // Модель: точное совпадение, иначе модель каталога, с которой начинается название из VIN (и наоборот).
  const models = [...new Set(byMake.map((r) => r[1]))];
  const want = norm(n.model);
  const model = models.find((m) => norm(m) === want) ?? models.filter((m) => want.startsWith(norm(m)) || norm(m).startsWith(want)).sort((a, b) => b.length - a.length)[0];
  if (!model) { res.note = `Модели «${n.model}» нет в каталоге Авито — выберите похожую`; return res; }
  res.model = model;

  // Поколение — по году; модификация — по объёму, приводу, комплектации и мощности.
  const fits = byMake.filter((r) => r[1] === model && (!year || ((!r[4] || r[4] <= year) && (!r[5] || r[5] >= year))));
  if (!fits.length) { res.note = 'Поколение по году не найдено — выберите'; return res; }
  const awd = n.drive && /4WD|AWD|4x4/i.test(n.drive);
  const score = (r: CatalogRow) =>
    (n.engine && Number(r[12]) === Math.round(n.engine * 10) / 10 ? 4 : 0) +
    (n.drive ? ((r[9] === 'Полный') === !!awd ? 2 : -2) : 0) +
    (n.trim && r[13].some((c) => norm(c) === norm(n.trim!)) ? 3 : 0) +
    (n.hp ? -Math.min(3, Math.abs(r[11] - n.hp) / 30) : 0);
  // Сравниваем модификации всех подходящих по году поколений: лучшие по совпадению
  // объёма, привода, комплектации и мощности определяют поколение, а если лучшая одна — и модификацию.
  const ranked = fits.map((r) => ({ r, s: score(r) })).sort((a, b) => b.s - a.s);
  const top = ranked.filter((x) => x.s === ranked[0].s);
  const gens = [...new Set(top.map((x) => x.r[2]))];
  if (gens.length !== 1) { res.note = 'Поколений на этот год несколько — выберите'; return res; }
  res.generation = gens[0];
  if (top.length === 1) {
    const best = top[0].r;
    res.modification = best[3];
    res.mod = modInfo(best);
    res.complectation = n.trim ? best[13].find((c) => norm(c) === norm(n.trim!)) ?? null : null;
    res.note = ranked.length > 1 ? 'Модификация подобрана по объёму, приводу и комплектации — проверьте' : '';
  } else {
    res.note = `Подходит несколько модификаций (${top.map((x) => x.r[3]).join('; ')}) — выберите`;
    if (n.trim) res.complectation = n.trim;
  }
  return res;
}
