import { requireUser } from '@/lib/auth';
import { Workspace } from '@/components/crm/Workspace';

export const metadata = { title: 'Сервис' };

export default async function ServiceDesk({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser('leads.service');
  return <Workspace direction="service" user={user} sp={await searchParams} />;
}
