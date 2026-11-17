import Link from 'next/link';
import { CONTACTS } from '@/lib/site';

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
      <div className="card pad stack" style={{ gap: 10 }}>
        <strong style={{ fontSize: 18 }}>Подтверждение и акт — в Telegram</strong>
        <p className="text-2">Подключите нашего бота: пришлём подтверждение брони, напомним о выдаче и отправим акт приёма-передачи с фотографиями автомобиля. Нажмите «Старт» и поделитесь номером, который указали в заявке.</p>
        <a className="btn btn-primary" href={CONTACTS.clientBot} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start' }}>Открыть бота в Telegram</a>
      </div>
      <div className="wrap-row">
        <Link className="btn" href="/avtopark">Вернуться в автопарк</Link>
        <Link className="btn" href="/usloviya-arendy">Условия аренды</Link>
      </div>
    </div>
  );
}
