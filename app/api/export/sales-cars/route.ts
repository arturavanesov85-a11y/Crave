// Все автомобили в продаже — в Excel (.xlsx). Только из CRM, для тех, кто ведёт «Авто в продаже».
import ExcelJS from 'exceljs';
import { currentUser } from '@/lib/auth';
import { db, json } from '@/lib/db';
import { audit, formatPhone } from '@/lib/orders';
import { can } from '@/lib/permissions';
import { DEAL_KIND, SALE_STATUS, SUPPLY } from '@/lib/sales';
import { BODY_LABEL } from '@/lib/site';

export async function GET() {
  const user = await currentUser();
  if (!user || !can(user, 'sales.catalog')) return new Response('Нет доступа', { status: 403 });
  const cars = await db.saleCar.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], include: { deals: { where: { status: 'active' }, orderBy: { createdAt: 'desc' }, take: 1 } } });
  const users = new Map((await db.user.findMany({ select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'CRAVE CRM';
  const ws = wb.addWorksheet('Авто в продаже', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: '№', key: 'n', width: 5 },
    { header: 'Марка', key: 'make', width: 16 },
    { header: 'Модель', key: 'model', width: 22 },
    { header: 'Год', key: 'year', width: 7 },
    { header: 'Статус', key: 'status', width: 14 },
    { header: 'Наличие', key: 'supply', width: 12 },
    { header: 'Прибытие', key: 'eta', width: 14 },
    { header: 'Цена, ₽', key: 'price', width: 14, style: { numFmt: '#,##0' } },
    { header: 'НДС', key: 'vat', width: 8 },
    { header: 'Пробег, км', key: 'mileage', width: 11, style: { numFmt: '#,##0' } },
    { header: 'Кузов', key: 'body', width: 13 },
    { header: 'Мощность, л.с.', key: 'power', width: 10 },
    { header: 'Двигатель', key: 'engine', width: 18 },
    { header: 'Коробка', key: 'transmission', width: 12 },
    { header: 'Привод', key: 'drive', width: 11 },
    { header: 'Цвет кузова', key: 'color', width: 16 },
    { header: 'Цвет салона', key: 'interior', width: 16 },
    { header: 'VIN', key: 'vin', width: 20 },
    { header: 'Сделка', key: 'deal', width: 10 },
    { header: 'Клиент', key: 'client', width: 22 },
    { header: 'Телефон', key: 'phone', width: 18 },
    { header: 'Цена сделки, ₽', key: 'dealPrice', width: 14, style: { numFmt: '#,##0' } },
    { header: 'Менеджер', key: 'manager', width: 20 },
    { header: 'Дата сделки', key: 'dealAt', width: 12, style: { numFmt: 'dd.mm.yyyy' } },
    { header: 'Фото', key: 'photos', width: 7 },
    { header: 'Комплектация', key: 'equipment', width: 50 },
    { header: 'Заметка', key: 'note', width: 30 },
  ];
  cars.forEach((c, i) => {
    const d = c.deals[0];
    ws.addRow({
      n: i + 1, make: c.make, model: c.model, year: c.year, status: SALE_STATUS[c.status], supply: SUPPLY[c.supply],
      eta: c.etaAt ? c.etaAt.toLocaleDateString('ru-RU') : c.etaNote ?? '', price: c.price ? c.price / 100 : null, vat: c.price ? (c.priceVat ? 'с НДС' : 'без НДС') : '',
      mileage: c.mileageKm, body: BODY_LABEL[c.bodyType] ?? c.bodyType, power: c.powerHp, engine: c.engine, transmission: c.transmission, drive: c.drive,
      color: c.color, interior: c.colorInterior, vin: c.vin,
      deal: d ? DEAL_KIND[d.kind] : '', client: d?.clientName ?? '', phone: d ? formatPhone(d.clientPhone) : '', dealPrice: d ? d.price / 100 : null,
      manager: d ? users.get(d.managerId) ?? '' : '', dealAt: d?.createdAt ?? null,
      photos: json<string[]>(c.photos, []).length, equipment: json<string[]>(c.equipment, []).join('; '), note: c.note,
    });
  });
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF141414' } };
  head.alignment = { vertical: 'middle', wrapText: true };
  head.height = 30;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };

  const buf = await wb.xlsx.writeBuffer();
  await audit(db, user.id, 'export.salecars', 'salecar', 'all', { rows: cars.length });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(buf as ArrayBuffer), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="crave-auto-${date}.xlsx"`, 'Cache-Control': 'no-store' } });
}
