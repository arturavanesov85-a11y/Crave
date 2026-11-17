// Акт приёма-передачи в PDF: ?kind=pickup (выдача) или return (возврат).
import { currentUser } from '@/lib/auth';
import { buildAct, actFileName } from '@/lib/act-pdf';
import { db } from '@/lib/db';
import { can } from '@/lib/permissions';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response('Нужен вход', { status: 401 });
  const o = await db.rentalOrder.findUnique({ where: { id: (await params).id }, select: { id: true, number: true, handoverId: true } });
  if (!o) return new Response('Заказ не найден', { status: 404 });
  if (!can(user, 'rental.read') && !(can(user, 'rental.read.assigned') && o.handoverId === user.id)) return new Response('Нет доступа', { status: 403 });
  const kind = new URL(req.url).searchParams.get('kind') === 'return' ? 'return' : 'pickup';
  const pdf = await buildAct(o.id, kind);
  if (!pdf) return new Response(kind === 'pickup' ? 'Выдача ещё не проведена' : 'Возврат ещё не проведён', { status: 404 });
  return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${actFileName(o.number, kind)}"`, 'Cache-Control': 'no-store' } });
}
