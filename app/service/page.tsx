import { LeadForm } from '@/components/site/LeadForm';
import { CONTACTS } from '@/lib/site';

export default async function ServiceHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <>
      <section className="wrap hero">
        <div className="hero-text">
          <p className="eyebrow" style={{ fontSize: 13 }}>CRAVE Service · Москва</p>
          <h1>Обслуживание автомобиля</h1>
          <p className="text-2" style={{ fontSize: 18, maxWidth: 560 }}>Оставьте заявку на обслуживание. Менеджер свяжется с вами, уточнит работы и предложит время.</p>
          <p className="muted small">Это заявка на запись, а не подтверждённая запись: расписание сервиса пока ведёт менеджер.</p>
        </div>
        <div className="hero-photo" id="contact">
          <LeadForm direction="service" kind="service_request" back="/service" title="Заявка на обслуживание" carField="Марка, модель и год автомобиля" messageLabel="Какие работы нужны" submitLabel="Отправить заявку" sent={sp.sent === '1'} />
        </div>
      </section>
      <section className="wrap section" id="services" style={{ paddingTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 20 }}>Услуги</h2>
        <div className="empty">Перечень услуг и цены появятся после утверждения. Опишите задачу в заявке — мы ответим.</div>
      </section>
      <section className="wrap" style={{ paddingBottom: 64 }}>
        <div className="facts">
          <div><b style={{ fontSize: 18 }}>{CONTACTS.address}</b><span className="muted small">адрес сервиса уточняется</span></div>
          <div><b style={{ fontSize: 18 }}><a href={CONTACTS.phoneHref} style={{ color: 'var(--text)' }}>{CONTACTS.phone}</a></b><span className="muted small">телефон</span></div>
        </div>
      </section>
    </>
  );
}
