import { LeadForm } from '@/components/site/LeadForm';
import { BrandGrid } from '@/components/site/BrandGrid';
import { CarPhoto } from '@/components/site/CarCard';
import { SaleCarCard } from '@/components/site/SaleCarCard';
import { publicSaleCars } from '@/lib/sales';
import { autoTexts } from '@/lib/site-settings';
import { CONTACTS } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default async function AutoHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [cars, t] = await Promise.all([publicSaleCars(), autoTexts()]);
  const hero = cars[0];
  const phone = t['auto.phone'] || CONTACTS.phone;
  const phoneHref = t['auto.phone'] ? `tel:+${t['auto.phone'].replace(/\D/g, '').replace(/^8/, '7')}` : CONTACTS.phoneHref;

  return (
    <>
      <section className="wrap hero">
        <div className="hero-text">
          <p className="eyebrow" style={{ fontSize: 13 }}>{t['auto.heroEyebrow']}</p>
          <h1>{t['auto.heroTitle']}</h1>
          <p className="text-2" style={{ fontSize: 18, maxWidth: 560, whiteSpace: 'pre-line' }}>{t['auto.heroText']}</p>
          <div className="wrap-row" style={{ gap: 12 }}>
            <a className="btn btn-primary" href="#stock" style={{ flex: '1 1 200px' }}>Авто в наличии</a>
            <a className="btn" href="#order" style={{ flex: '1 1 200px' }}>Авто под заказ</a>
          </div>
        </div>
        {hero ? (
          <figure className="hero-photo">
            <CarPhoto title={hero.title} src={hero.photos[0]} rounded eager />
            <figcaption className="text-2" style={{ fontSize: 14 }}>{hero.title} · {hero.year}</figcaption>
          </figure>
        ) : null}
      </section>

      <section className="wrap section" id="stock" style={{ paddingTop: 24, scrollMarginTop: 90 }}>
        <h2 className="section-title" style={{ marginBottom: 20 }}>{t['auto.stockTitle']}</h2>
        {cars.length ? (
          <div className="car-grid">{cars.map((c) => <SaleCarCard key={c.id} c={c} />)}</div>
        ) : (
          <div className="empty" style={{ whiteSpace: 'pre-line' }}>{t['auto.stockEmpty']}</div>
        )}
      </section>

      <section style={{ background: 'var(--surface)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap section layout-2" id="order" style={{ scrollMarginTop: 90 }}>
          <div className="main stack" style={{ gap: 14 }}>
            <h2 className="section-title">{t['auto.orderTitle']}</h2>
            <p className="text-2" style={{ fontSize: 17, maxWidth: 560, whiteSpace: 'pre-line' }}>{t['auto.orderText']}</p>
            <BrandGrid title={t['auto.brandsTitle']} note="И другие марки — уточните в заявке." />
          </div>
          <div className="aside">
            <LeadForm direction="sales" kind="custom_order" back="/auto" anchor="order" title="Заявка на авто под заказ" carField="Марка, модель, год" messageLabel="Комплектация, цвет, бюджет, сроки" submitLabel="Отправить заявку" sent={sp.sent === 'custom_order'} />
          </div>
        </div>
      </section>

      <section className="wrap section layout-2" id="contact" style={{ scrollMarginTop: 90 }}>
        <div className="main stack" style={{ gap: 14 }}>
          <h2 className="section-title">Контакты</h2>
          <div className="facts">
            <div><b style={{ fontSize: 18 }}>{t['auto.address'] || CONTACTS.address}</b><span className="muted small">адрес</span></div>
            <div><b style={{ fontSize: 18 }}><a href={phoneHref} style={{ color: 'var(--text)' }}>{phone}</a></b><span className="muted small">{t['auto.hours'] || 'телефон'}</span></div>
          </div>
        </div>
        <div className="aside">
          <LeadForm direction="sales" kind="purchase" back="/auto" anchor="contact" title="Вопрос по покупке" carField="Интересующий автомобиль" messageLabel="Ваш вопрос" submitLabel="Отправить" sent={sp.sent === 'purchase'} />
        </div>
      </section>
    </>
  );
}
