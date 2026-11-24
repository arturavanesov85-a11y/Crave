// Подсказки каталога Авито для блока «Авито» в карточке машины (только сотрудникам).
import { currentUser } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { catalogOptions } from '@/lib/avito';

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || !can(user, 'sales.catalog')) return Response.json({ error: 'Нет доступа' }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const res = await catalogOptions({ make: q.get('make') || undefined, model: q.get('model') || undefined, generation: q.get('generation') || undefined, year: Number(q.get('year')) || undefined });
  if (!res) return Response.json({ error: 'Каталог Авито ещё не загружен на сервер' }, { status: 503 });
  return Response.json(res);
}
