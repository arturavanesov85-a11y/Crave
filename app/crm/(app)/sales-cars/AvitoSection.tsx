// Авито: объявление собирается из карточки машины (каталог Авито, цена, описание, фото),
// здесь — только статус и кнопка отправки.
import { ActionForm } from '@/components/crm/ActionForm';

type Action = (prev: { error?: string; ok?: string } | undefined, fd: FormData) => Promise<{ error?: string; ok?: string } | undefined>;

export function AvitoSection({ carId, status, problems, since, action }: { carId: string; status: string; problems: string[]; since: string | null; action: Action }) {
  const live = status === 'live';
  return (
    <section className="card pad stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <h2>Авито</h2>
        <span className={`tag ${live ? 'ok' : ''}`}>{live ? 'Отправлено на Авито' : 'Не размещается'}</span>
        {live && since ? <span className="muted small">с {since}</span> : null}
      </div>
      <p className="muted small">Объявление берётся из этой карточки: модификация по каталогу Авито, цена, описание и фото. Характеристики на Авито — из каталога; тюнинг пишите в описании.</p>
      {live ? <p className="small">Изменения в карточке (цена, описание, фото, характеристики) уходят на Авито сами при ближайшей автозагрузке — повторно отправлять не нужно, Авито обновит это же объявление.</p> : null}
      {problems.length ? <p className="warn small">Чтобы отправить: {problems.join('; ')}.</p> : null}
      {live
        ? <ActionForm action={action} hidden={{ id: carId, intent: 'unpublish' }} submit="Снять с Авито" variant="quiet" confirm="Снять объявление с Авито?" />
        : <ActionForm action={action} hidden={{ id: carId, intent: 'publish' }} submit="Отправить на Авито" variant="quiet" confirm="Отправить объявление на Авито? Оно займёт место в пакете тарифа." />}
    </section>
  );
}
