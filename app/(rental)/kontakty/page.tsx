import { LeadForm } from '@/components/site/LeadForm';
import { CONTACTS } from '@/lib/site';

export const metadata = { title: 'Контакты', description: 'Адрес и телефон CRAVE. Москва, Коровинское шоссе, 10.' };

export default async function Contacts({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="wrap layout-2" style={{ paddingTop: 32, paddingBottom: 72 }}>
      <div className="main stack" style={{ gap: 20 }}>
        <h1 className="page-title">Контакты</h1>
        <div className="facts">
          <div><b style={{ fontSize: 18 }}>{CONTACTS.address}</b><span className="muted small">адрес выдачи</span></div>
          <div><b style={{ fontSize: 18 }}><a href={CONTACTS.phoneHref} style={{ color: 'var(--text)' }}>{CONTACTS.phone}</a></b><span className="muted small">{CONTACTS.hours}</span></div>
          <div><b style={{ fontSize: 18 }}><a href={CONTACTS.telegram}>Telegram</a></b><span className="muted small">@crave_rental</span></div>
        </div>
      </div>
      <div className="aside" id="help">
        <LeadForm direction="rental" kind="callback" back="/kontakty" title="Помочь с выбором" messageLabel="Даты и пожелания" submitLabel="Перезвоните мне" sent={sp.sent === '1'} />
      </div>
    </div>
  );
}
