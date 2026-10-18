import Link from 'next/link';
import { publicVehicles } from '@/lib/catalog';
import { CarCard, CarPhoto } from '@/components/site/CarCard';
import { DateSearch, defaultDates } from '@/components/site/DateSearch';
import { rub } from '@/lib/money';
import { CONTACTS } from '@/lib/site';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: { absolute: 'CRAVE — аренда премиальных автомобилей в Москве' },
  description: 'Посуточная и долгосрочная аренда премиальных автомобилей. Выберите автомобиль и даты — узнайте стоимость и отправьте заявку.',
};

export default async function Home() {
  const cars = await publicVehicles();
  const hero = cars.find((c) => c.slug === 'mercedes-amg-gt63-s') ?? cars[0];
  const featured = cars.slice(0, 4);
  const minDeposit = Math.min(...cars.map((c) => c.tariff.deposit));
  const { from, to } = defaultDates();

  return (
    <>
      <section className="wrap hero">
        <div className="hero-text">
          <p className="eyebrow" style={{ fontSize: 13 }}>Аренда премиальных автомобилей · Москва</p>
          <h1>Премиальные автомобили. Понятные условия аренды.</h1>
          <p className="text-2" style={{ fontSize: 18, maxWidth: 520 }}>
            Выберите автомобиль и даты — узнайте стоимость поездки и отправьте заявку на бронирование.
          </p>
          <DateSearch from={from} to={to} />
        </div>
        {hero ? (
          <figure className="hero-photo">
            <CarPhoto title={hero.title} rounded />
            <figcaption className="row text-2" style={{ flexWrap: 'wrap', fontSize: 14 }}>
              <span>{hero.title} · {hero.powerHp} л.с. · {hero.accel} с до 100 км/ч</span>
              {hero.from ? <Link href={`/avtopark/${hero.slug}`}>от {rub(hero.from.dailyRate)} / сутки при аренде от {hero.from.minDays} суток</Link> : null}
            </figcaption>
          </figure>
        ) : null}
      </section>

      <section className="wrap" aria-label="Краткие условия" style={{ paddingBottom: 64 }}>
        <div className="facts">
          <div><b>от 20 лет</b><span className="muted small">возраст водителя</span></div>
          <div><b>от 1,5 лет</b><span className="muted small">водительский стаж</span></div>
          <div><b>250 км / сутки</b><span className="muted small">включено в стоимость</span></div>
          <div><b>от {rub(minDeposit)}</b><span className="muted small">залог, отдельно от стоимости</span></div>
        </div>
      </section>

      <section className="wrap" style={{ paddingBottom: 72 }}>
        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 24 }}>
          <h2 className="section-title">Автопарк</h2>
          <Link href="/avtopark">Все автомобили ({cars.length}) →</Link>
        </div>
        <div className="car-grid">
          {featured.map((v) => <CarCard key={v.id} v={v} />)}
        </div>
      </section>

      <section style={{ background: 'var(--surface)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap section">
          <h2 className="section-title" style={{ marginBottom: 28 }}>Как получить автомобиль</h2>
          <ol className="steps">
            <li><span className="gold small" style={{ fontWeight: 600 }}>01</span><strong>Выберите автомобиль и даты</strong><span className="text-2">Сайт покажет итоговую стоимость с расшифровкой и залог отдельно.</span></li>
            <li><span className="gold small" style={{ fontWeight: 600 }}>02</span><strong>Менеджер подтвердит бронь</strong><span className="text-2">До подтверждения это заявка: мы проверим даты и условия и свяжемся с вами.</span></li>
            <li><span className="gold small" style={{ fontWeight: 600 }}>03</span><strong>Внесите залог для резерва</strong><span className="text-2">Залог закрепляет дату и не входит в стоимость аренды.</span></li>
            <li><span className="gold small" style={{ fontWeight: 600 }}>04</span><strong>Получите автомобиль</strong><span className="text-2">{CONTACTS.address}. Возьмите паспорт и водительское удостоверение.</span></li>
          </ol>
        </div>
      </section>

      <section className="wrap section">
        <h2 className="section-title" style={{ marginBottom: 24 }}>Дополнительные услуги</h2>
        <div className="boxes">
          <div className="box"><strong>Аренда с водителем</strong><span className="text-2">от {rub(Math.min(...cars.filter((c) => c.tariff.driverPerHour).map((c) => c.tariff.driverPerHour!)))} / час, цена зависит от модели</span></div>
          <div className="box"><strong>Дополнительный водитель</strong><span className="text-2">Заявляется до начала аренды. Стоимость уточняйте у менеджера.</span></div>
          <div className="box"><strong>Поездка за пределы региона</strong><span className="text-2">Москва и МО, Санкт-Петербург и ЛО — включены. Другие регионы — по согласованию.</span></div>
        </div>
      </section>

      <section className="wrap faq" style={{ maxWidth: 880, paddingBottom: 72 }}>
        <h2 className="section-title" style={{ marginBottom: 20 }}>Частые вопросы</h2>
        <div style={{ borderTop: '1px solid var(--line)' }}>
          <details open><summary>Когда возвращается залог?</summary><p>Сразу при возврате автомобиля. 20 000 ₽ удерживаются на 21 день для проверки штрафов.</p></details>
          <details><summary>Какие документы нужны?</summary><p>Паспорт и водительское удостоверение.</p></details>
          <details><summary>Можно ли арендовать иностранному гражданину?</summary><p>Да. Размер залога может быть увеличен.</p></details>
          <details><summary>Возвращается ли предоплата при отмене?</summary><p>Нет, предоплата не возвращается и не переносится.</p></details>
          <details><summary>Где можно ездить?</summary><p>Москва и Московская область, Санкт-Петербург и Ленинградская область. Выезд за их пределы согласовывается индивидуально.</p></details>
        </div>
      </section>
    </>
  );
}
