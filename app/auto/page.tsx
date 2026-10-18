import { LeadForm } from '@/components/site/LeadForm';
import { CONTACTS } from '@/lib/site';

export default async function AutoHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <>
      <section className="wrap hero">
        <div className="hero-text">
          <p className="eyebrow" style={{ fontSize: 13 }}>CRAVE Auto · Москва</p>
          <h1>Покупка автомобиля</h1>
          <p className="text-2" style={{ fontSize: 18, maxWidth: 560 }}>Расскажите, какой автомобиль вы ищете, — менеджер свяжется с вами и расскажет о вариантах.</p>
        </div>
        <div className="hero-photo" id="contact">
          <LeadForm direction="sales" kind="purchase" back="/auto" title="Заявка на покупку" carField="Интересующий автомобиль" messageLabel="Бюджет и пожелания" submitLabel="Отправить заявку" sent={sp.sent === '1'} />
        </div>
      </section>
      <section className="wrap section" id="catalog" style={{ paddingTop: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 20 }}>Автомобили в продаже</h2>
        <div className="empty">Каталог автомобилей появится, когда будет утверждён ассортимент. Пока оставьте заявку — подберём вариант.</div>
      </section>
      <section className="wrap" style={{ paddingBottom: 64 }}>
        <div className="facts">
          <div><b style={{ fontSize: 18 }}>{CONTACTS.address}</b><span className="muted small">адрес</span></div>
          <div><b style={{ fontSize: 18 }}><a href={CONTACTS.phoneHref} style={{ color: 'var(--text)' }}>{CONTACTS.phone}</a></b><span className="muted small">телефон автосалона уточняется</span></div>
        </div>
      </section>
    </>
  );
}
