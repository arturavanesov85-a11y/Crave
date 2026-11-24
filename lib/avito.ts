// Авито: справочник автомобилей и файл автозагрузки.
// Характеристики в объявлении берутся только из каталога Авито (марка → модель → поколение →
// модификация); свои данные (тюнинг, мощность после чипа) менеджер пишет в описании.
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

// [марка, модель, поколение, модификация, год с, год по, кузов, дверей, топливо, привод, коробка, л.с., объём, комплектации]
export type CatalogRow = [string, string, string, string, number, number, string, number, string, string, string, number, string, string[]];

let cache: { mtime: number; rows: CatalogRow[]; at: string } | null = null;
const FILE = join(process.cwd(), 'storage', 'avito-catalog.json');

export async function avitoCatalog() {
  const s = await stat(FILE).catch(() => null);
  if (!s) return null;
  if (!cache || cache.mtime !== s.mtimeMs) {
    const data = JSON.parse(await readFile(FILE, 'utf8')) as { at: string; rows: CatalogRow[] };
    cache = { mtime: s.mtimeMs, rows: data.rows, at: data.at };
  }
  return cache;
}

const uniq = (a: string[]) => [...new Set(a)].sort((x, y) => x.localeCompare(y, 'ru'));

/** Варианты для следующего шага выбора: марки, модели марки, поколения модели, модификации поколения. */
export async function catalogOptions(q: { make?: string; model?: string; generation?: string; year?: number }) {
  const c = await avitoCatalog();
  if (!c) return null;
  const fitsYear = (r: CatalogRow) => !q.year || ((!r[4] || r[4] <= q.year) && (!r[5] || r[5] >= q.year));
  if (!q.make) return { makes: uniq(c.rows.map((r) => r[0])) };
  const byMake = c.rows.filter((r) => r[0] === q.make);
  if (!q.model) return { models: uniq(byMake.map((r) => r[1])) };
  const byModel = byMake.filter((r) => r[1] === q.model);
  const gens = uniq(byModel.filter(fitsYear).map((r) => r[2]));
  if (!q.generation) return { generations: gens.length ? gens : uniq(byModel.map((r) => r[2])) };
  return { modifications: byModel.filter((r) => r[2] === q.generation).map(modInfo) };
}

export type ModInfo = { name: string; body: string; doors: number; fuel: string; drive: string; transmission: string; power: number; engine: string; complectations: string[]; years: string };
const modInfo = (r: CatalogRow): ModInfo => ({ name: r[3], body: r[6], doors: r[7], fuel: r[8], drive: r[9], transmission: r[10], power: r[11], engine: r[12], complectations: r[13], years: `${r[4] || '…'}–${r[5] || '…'}` });

export async function findModification(make: string, model: string, generation: string, modification: string) {
  const c = await avitoCatalog();
  const r = c?.rows.find((x) => x[0] === make && x[1] === model && x[2] === generation && x[3] === modification);
  return r ? modInfo(r) : null;
}

// ---------- Объявление ----------

export type AvitoAd = {
  make: string; model: string; generation: string; modification: string; complectation: string;
  price: number | null; // рубли; пусто — берём цену машины
  owners: string; accident: string; wheel: string; color: string; address: string; description: string;
  avitoId?: string;
};

export const AVITO_COLORS = ['Белый', 'Бежевый', 'Бордовый', 'Голубой', 'Жёлтый', 'Зелёный', 'Золотой', 'Коричневый', 'Красный', 'Оранжевый', 'Пурпурный', 'Розовый', 'Серебряный', 'Серый', 'Синий', 'Фиолетовый', 'Чёрный'];
export const AVITO_OWNERS = ['1', '2', '3', '4+'];
export const AVITO_DEFAULT_ADDRESS = 'Московская обл., г.о. Пушкинский, Пушкино, Ярославское ш., 2Вс4';

/** Цвет из CRM («синий», «тёмно-синий») → значение списка Авито. */
export function guessColor(c: string | null) {
  const s = (c ?? '').toLowerCase().replace('ё', 'е');
  return AVITO_COLORS.find((x) => s.includes(x.toLowerCase().replace('ё', 'е').slice(0, 4))) ?? '';
}

type Car = { id: string; make: string; model: string; year: number; mileageKm: number; vin: string | null; price: number | null; priceVat: boolean; color: string | null; description: string | null; equipment: string | null; photos: string | null; avito: string | null };

/** Поля каталога Авито, которые хранятся у машины рядом с обычными (марка и модель — общие). */
// avitoId — номер объявления, которое уже размещено на Авито вручную: с ним автозагрузка
// подхватывает и обновляет это объявление, а не создаёт второе.
export type AvitoExtra = { generation: string; modification: string; complectation: string; owners: string; accident: string; wheel: string; avitoId?: string };
export const emptyExtra = (): AvitoExtra => ({ generation: '', modification: '', complectation: '', owners: '', accident: 'Не битый', wheel: 'Левый' });
export function avitoExtra(car: { avito: string | null }): AvitoExtra {
  try { return { ...emptyExtra(), ...(car.avito ? JSON.parse(car.avito) : {}) }; } catch { return emptyExtra(); }
}

/** Объявление Авито из карточки машины: одна карточка — и сайт, и Авито. */
export function adFromCar(car: Car): AvitoAd {
  const x = avitoExtra(car);
  const desc = [car.price && car.priceVat ? 'Цена указана с НДС.' : '', car.description ?? ''].filter(Boolean).join('\n');
  return { make: car.make, model: car.model, ...x, price: car.price ? Math.round(car.price / 100) : null, color: guessColor(car.color), address: AVITO_DEFAULT_ADDRESS, description: desc };
}

/** Чего не хватает, чтобы объявление приняли. Пустой список — можно отправлять. */
export async function avitoProblems(car: Pick<Car, 'mileageKm' | 'vin' | 'price' | 'photos'>, ad: AvitoAd | null) {
  const p: string[] = [];
  if (!ad) return ['поля Авито не заполнены'];
  if (!ad.make || !ad.model || !ad.generation || !ad.modification) p.push('выберите модификацию по каталогу Авито');
  else if (!(await findModification(ad.make, ad.model, ad.generation, ad.modification))) p.push('модификации больше нет в каталоге Авито — выберите заново');
  if (!(ad.price ?? (car.price ? car.price / 100 : 0))) p.push('нет цены');
  if (!car.mileageKm) p.push('пробег 0 км — Авито сочтёт машину новой, а тариф только на машины с пробегом');
  if (!car.vin || car.vin.length !== 17) p.push('нет VIN (17 знаков)');
  if (!ad.color) p.push('цвет кузова не из списка Авито');
  if (!ad.owners) p.push('не указано число владельцев');
  if (!JSON.parse(car.photos || '[]').length) p.push('нет фото');
  return p;
}

const esc = (s: string | number) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
const tag = (k: string, v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? '' : `<${k}>${esc(v)}</${k}>`);

/** Один элемент <Ad> файла автозагрузки. photoUrl — абсолютный адрес JPEG для каждого фото. */
export async function avitoAdXml(car: Pick<Car, 'id' | 'year' | 'mileageKm' | 'vin' | 'price' | 'description' | 'photos'>, ad: AvitoAd, photoUrl: (p: string) => string) {
  const mod = await findModification(ad.make, ad.model, ad.generation, ad.modification);
  if (!mod) return '';
  const price = ad.price ?? (car.price ? Math.round(car.price / 100) : 0);
  const photos = (JSON.parse(car.photos || '[]') as string[]).slice(0, 40);
  const html = (ad.description || car.description || '').split(/\n+/).filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join('');
  return [
    '<Ad>',
    tag('Id', `crave-${car.id}`),
    tag('AvitoId', ad.avitoId),
    tag('ListingFee', 'Package'),
    tag('ContactMethod', 'По телефону и в сообщениях'),
    tag('Address', ad.address || AVITO_DEFAULT_ADDRESS),
    tag('Category', 'Автомобили'),
    tag('CarType', 'С пробегом'),
    tag('Make', ad.make), tag('Model', ad.model), tag('Generation', ad.generation), tag('Modification', ad.modification), tag('Complectation', ad.complectation),
    tag('Year', car.year), tag('Kilometrage', car.mileageKm), tag('VIN', car.vin),
    tag('BodyType', mod.body), tag('Doors', mod.doors), tag('FuelType', mod.fuel), tag('DriveType', mod.drive), tag('Transmission', mod.transmission),
    tag('EngineSize', mod.engine), tag('Power', mod.power),
    tag('Color', ad.color), tag('WheelType', ad.wheel || 'Левый'), tag('Owners', ad.owners), tag('Accident', ad.accident || 'Не битый'),
    tag('Price', price),
    html ? `<Description>${cdata(html)}</Description>` : '',
    photos.length ? `<Images>${photos.map((p) => `<Image url="${esc(photoUrl(p))}"/>`).join('')}</Images>` : '',
    '</Ad>',
  ].join('');
}
