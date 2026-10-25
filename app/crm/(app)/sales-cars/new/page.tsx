import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { SaleCarForm } from '../SaleCarForm';

export const metadata = { title: 'Новый автомобиль в продаже' };

export default async function NewSaleCar() {
  await requireUser('sales.catalog');
  const vehicles = await db.vehicle.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, title: true } });
  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <Link href="/crm/sales-cars" className="small">← Авто в продаже</Link>
      <h1>Новый автомобиль в продаже</h1>
      <SaleCarForm car={null} vehicles={vehicles} />
    </div>
  );
}
