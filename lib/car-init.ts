// Начальные значения общего блока «Автомобиль» (components/crm/CarFields) для машин проката и продажи.
import type { CarInit } from '@/components/crm/CarFields';

type Extra = { generation?: string; modification?: string; complectation?: string; owners?: string; accident?: string; wheel?: string };
const extra = (raw: string | null | undefined): Extra => { try { return raw ? JSON.parse(raw) : {}; } catch { return {}; } };
const s = (x: string | number | null | undefined) => (x == null ? '' : String(x));
const lines = (raw: string | null | undefined) => { try { return raw ? (JSON.parse(raw) as string[]).join('\n') : ''; } catch { return ''; } };
const blank: CarInit = { vin: '', plate: '', make: '', model: '', year: '', generation: '', modification: '', complectation: '', bodyType: '', powerHp: '', drive: 'полный', mileageKm: '0', color: '', colorInterior: '', title: '', autoTitle: '', description: '', equipment: '', engine: '', transmission: '', owners: '', accident: 'Не битый', wheel: 'Левый', fuel: 'бензин', accel: '', seats: '5' };

type Common = { vin: string | null; make: string; model: string; year: number; bodyType: string; powerHp: number | null; drive: string | null; mileageKm: number; colorInterior: string | null; title: string; description: string | null; equipment: string | null; avito: string | null };

function common(c: Common): CarInit {
  const x = extra(c.avito);
  return {
    ...blank, vin: s(c.vin), make: c.make, model: c.model, year: s(c.year), generation: s(x.generation), modification: s(x.modification), complectation: s(x.complectation),
    bodyType: c.bodyType, powerHp: s(c.powerHp), drive: s(c.drive) || 'полный', mileageKm: s(c.mileageKm), colorInterior: s(c.colorInterior),
    title: c.title, autoTitle: [c.make, c.model, x.complectation].filter(Boolean).join(' '), description: s(c.description), equipment: lines(c.equipment),
    owners: s(x.owners), accident: x.accident || 'Не битый', wheel: x.wheel || 'Левый',
  };
}

export function saleCarInit(c: (Common & { color: string | null; engine: string | null; transmission: string | null }) | null): CarInit {
  if (!c) return { ...blank, drive: '' };
  return { ...common(c), color: s(c.color), engine: s(c.engine), transmission: s(c.transmission) };
}

export function vehicleInit(v: (Common & { plate: string | null; colorExterior: string | null; fuel: string; accel: string; seats: number | null }) | null): CarInit {
  if (!v) return { ...blank, bodyType: 'sedan' };
  return { ...common(v), plate: s(v.plate), color: s(v.colorExterior), fuel: v.fuel, accel: v.accel, seats: s(v.seats) };
}
