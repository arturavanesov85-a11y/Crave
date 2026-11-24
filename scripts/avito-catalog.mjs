// Справочник автомобилей Авито → компактный JSON для CRM (storage/avito-catalog.json).
// Запуск: node scripts/avito-catalog.mjs [путь к Autocatalog.xml]
// Без аргумента скачивает https://autoload.avito.ru/format/Autocatalog.xml.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const src = process.argv[2];
const xml = src ? await readFile(src, 'utf8') : await (await fetch('https://autoload.avito.ru/format/Autocatalog.xml')).text();
if (!xml.includes('<Catalog')) throw new Error('Не похоже на каталог Авито');

const val = (block, tag) => (block.match(new RegExp(`<${tag} id="[^"]*"(?: [^>]*)?>([^<]*)</${tag}>`)) || [])[1] ?? '';
const out = [];
// Каждая модификация повторяет в себе всю цепочку (марка, модель, поколение) и свои характеристики.
const re = /<Modification id="(\d+)" name="[^"]*">([\s\S]*?)<\/Modification>\s*(?=<Modification id|<\/Generation>)/g;
for (let m; (m = re.exec(xml)); ) {
  const b = m[2];
  const compl = [...b.matchAll(/<Complectation id="\d+" name="([^"]*)"/g)].map((x) => x[1]);
  out.push([
    val(b, 'Make'), val(b, 'Model'), val(b, 'Generation'), val(b, 'Modification'),
    Number(val(b, 'YearFrom')) || 0, Number(val(b, 'YearTo')) || 0,
    val(b, 'BodyType'), Number(val(b, 'Doors')) || 0, val(b, 'FuelType'), val(b, 'DriveType'), val(b, 'Transmission'),
    Number(val(b, 'Power')) || 0, val(b, 'EngineSize'), compl,
  ]);
}
if (out.length < 1000) throw new Error(`Слишком мало модификаций: ${out.length}`);
const dir = join(process.cwd(), 'storage');
await mkdir(dir, { recursive: true });
await writeFile(join(dir, 'avito-catalog.json'), JSON.stringify({ at: new Date().toISOString(), rows: out }));
console.log(`avito-catalog: ${out.length} модификаций`);
