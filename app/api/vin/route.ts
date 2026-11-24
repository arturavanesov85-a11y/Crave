// Расшифровка VIN для форм автомобиля (проката и продажи) — только сотрудникам.
import { currentUser } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { decodeVin } from '@/lib/vin';

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || !(can(user, 'fleet.write') || can(user, 'sales.catalog'))) return Response.json({ error: 'Нет доступа' }, { status: 403 });
  try {
    return Response.json(await decodeVin(new URL(req.url).searchParams.get('vin') ?? ''));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Не удалось расшифровать VIN' }, { status: 400 });
  }
}
