'use server';

// Удаление записей руководителем. Копия записи остаётся в журнале (/crm/journal).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { Forbidden } from '@/lib/permissions';
import { deleteCustomer, deleteLead, deleteOrder } from '@/lib/trash';

type ActionState = { error?: string; ok?: string } | undefined;

const LEAD_LIST: Record<string, string> = { rental: '/crm/leads?dir=rental', sales: '/crm/sales', service: '/crm/service-desk' };

export async function deleteRecordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let to: string | null = null;
  try {
    const user = await currentUser();
    if (!user) throw new Forbidden('Сессия истекла — войдите снова');
    const kind = String(fd.get('kind') ?? '');
    const id = String(fd.get('id') ?? '');
    if (kind === 'lead') {
      const l = await deleteLead(user, id);
      to = fd.get('stay') ? null : LEAD_LIST[l.direction] ?? '/crm';
    } else if (kind === 'order') {
      await deleteOrder(user, id);
      to = '/crm/orders';
    } else if (kind === 'customer') {
      await deleteCustomer(user, id);
      to = '/crm/customers';
    } else throw new Error('Неизвестная запись');
    revalidatePath('/crm', 'layout');
    revalidatePath('/tg', 'layout');
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось удалить' };
  }
  if (to) redirect(to);
  return { ok: 'Удалено — копия в журнале' };
}
