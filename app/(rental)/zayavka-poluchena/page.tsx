import Link from 'next/link';

export const metadata = { title: 'Заявка получена', robots: { index: false } };

export default async function Sent({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { n } = await searchParams;
  return (
    <div className="wrap stack" style={{ maxWidth: 640, paddingTop: 64, paddingBottom: 96, gap: 16 }}>
      <span className="eyebrow">Заявка {n}</span>
      <h1 className="page-title">Заявка получена</h1>
      <p className="text-2" style={{ fontSize: 17 }}>
        Менеджер проверит даты и условия и свяжется с вами. До подтверждения автомобиль закреплён за вами временно — бронь станет окончательной после звонка менеджера.
      </p>
      <div className="wrap-row">
        <Link className="btn btn-primary" href="/avtopark">Вернуться в автопарк</Link>
        <Link className="btn" href="/usloviya-arendy">Условия аренды</Link>
      </div>
    </div>
  );
}
