import { requireUser } from '@/lib/auth';
import { Workspace } from '@/components/crm/Workspace';

export const metadata = { title: 'Продажи' };

export default async function Sales({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser('leads.sales');
  return <Workspace direction="sales" user={user} sp={await searchParams} />;
}
