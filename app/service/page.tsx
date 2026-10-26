import { LeadForm } from '@/components/site/LeadForm';
import { BrandGrid } from '@/components/site/BrandGrid';
import { db } from '@/lib/db';
import { rub } from '@/lib/money';
import { serviceTexts } from '@/lib/site-settings';
import { CONTACTS } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default async function ServiceHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [t, items] = await Promise.all([serviceTexts(), db.serviceItem.findMany({ where: { isPublished: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })]);
  const phone = t['service.phone'] || CONTACTS.phone;
  const phoneHref = t['service.phone'] ? `tel:+${t['service.phone'].replace(/\D/g, '').replace(/^8/, '7')}` : CONTACTS.phoneHref;
  return (
    <>
      <section className="wrap hero">
        <div className="hero-text">
          <p className="eyebrow" style={{ fontSize: 13 }}>{t['service.heroEyebrow']}</p>
          <h1>{t['service.heroTitle']}</h1>
          <p className="text-2" style={{ fontSize: 18, maxWidth: 560, whiteSpace: 'pre-line' }}>{t['service.heroText']}</p>
          <p className="muted small">Это заявка на запись, а не подтверждённая запись: время подтвердит менеджер.</p>
        </div>
        <div className="hero-photo" id="contact" style={{ scrollMarginTop: 90 }}>
          <LeadForm direction="service" kind="service_request" back="/service" title="Заявка на обслуживание" carField="Марка, модель и год автомобиля" messageLabel="Какие работы нужны" submitLabel="Отправить заявку" anchor="contact" sent={sp.sent === 'service_request'} />
        </div>
      </section>

      <section className="wrap section" id="services" style={{ paddingTop: 24, scrollMarginTop: 90 }}>
        <h2 className="section-title" style={{ marginBottom: 20 }}>{t['service.servicesTitle']}</h2>
        {items.length ? (
          <div className="boxes">
            {items.map((x) => (
              <article key={x.id} className="box" style={{ background: 'var(--surface)' }}>
                <strong style={{ fontSize: 17 }}>{x.name}</strong>
                {x.description ? <span className="text-2 small" style={{ whiteSpace: 'pre-line' }}>{x.description}</span> : null}
                <span style={{ marginTop: 'auto', fontWeight: 600 }}>{x.priceFrom ? `от ${rub(x.priceFrom)}` : <span className="muted" style={{ fontWeight: 400 }}>цена по запросу</span>}</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty" style={{ whiteSpace: 'pre-line' }}>{t['service.servicesEmpty']}</div>
        )}
      </section>

      <section className="wrap" style={{ paddingBottom: 56 }}>
        <BrandGrid title={t['service.brandsTitle']} note="Если вашей марки нет в списке — уточните в заявке." />
      </section>

      <section className="wrap" style={{ paddingBottom: 64 }}>
        <div className="facts">
          <div><b style={{ fontSize: 18 }}>{t['service.address'] || CONTACTS.address}</b><span className="muted small">адрес</span></div>
          <div><b style={{ fontSize: 18 }}><a href={phoneHref} style={{ color: 'var(--text)' }}>{phone}</a></b><span className="muted small">{t['service.hours'] || 'телефон'}</span></div>
        </div>
      </section>
    </>
  );
}
