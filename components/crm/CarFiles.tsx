// Блок «Документы» в карточке автомобиля: загрузка файлов (PDF, фото, Word, Excel), просмотр, удаление.
import { db } from '@/lib/db';
import { fmtDateTime } from '@/lib/dates';
import { ActionDialog, ActionForm } from '@/components/crm/ActionForm';
import { carFileAction } from '@/app/crm/actions';

export const CAR_FILE_KIND: Record<string, string> = { pts: 'ПТС', sts: 'СТС', osago: 'ОСАГО', kasko: 'КАСКО', contract: 'Договор', diagnostic: 'Диагностическая карта', other: 'Другое' };
const size = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`);

export async function CarFiles({ carType, carId, canWrite, title = 'Документы' }: { carType: 'vehicle' | 'salecar'; carId: string; canWrite: boolean; title?: string }) {
  const files = await db.carFile.findMany({ where: { carType, carId }, orderBy: { createdAt: 'desc' } });
  return (
    <section className="card pad stack" style={{ gap: 8 }}>
      <div className="row"><h2>{title} · {files.length}</h2>{canWrite ? (
        <ActionDialog label="Загрузить" title="Документы автомобиля" action={carFileAction} submit="Загрузить" hidden={{ carType, carId }} description="PDF, фото (в том числе с телефона), Word или Excel, до 50 МБ каждый. Можно выбрать несколько файлов сразу.">
          <label className="field">Вид<select className="input" name="kind">{Object.entries(CAR_FILE_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="field">Подпись (необязательно)<input className="input" name="title" placeholder="например, ПТС оригинал" /></label>
          <label className="field">Файлы<input className="input" type="file" name="files" multiple required accept=".pdf,.doc,.docx,.xls,.xlsx,image/*,.heic,.heif" /></label>
        </ActionDialog>
      ) : null}</div>
      {files.length ? files.map((f) => (
        <div key={f.id} className="row small" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className="tag">{CAR_FILE_KIND[f.kind] ?? f.kind}</span>
          <a href={`/api/files/car/${f.id}`} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>{f.title}</a>
          <span className="muted">{size(f.size)} · {fmtDateTime(f.createdAt)}</span>
          <div className="grow" />
          <a className="btn btn-quiet btn-sm" href={`/api/files/car/${f.id}?download`}>Скачать</a>
          {canWrite ? <ActionForm action={carFileAction} hidden={{ carType, carId, op: 'remove', fileId: f.id }} submit="Удалить" variant="quiet" confirm={`Удалить «${f.title}»? Файл будет удалён без возможности восстановления.`} /> : null}
        </div>
      )) : <p className="muted small">Файлов пока нет{canWrite ? ' — нажмите «Загрузить»' : ''}.</p>}
    </section>
  );
}
