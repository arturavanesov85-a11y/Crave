'use client';

// Кнопки брони и продажи машины. Бронь и продажа — только с клиентом (имя, телефон) и ценой:
// окно не отправится без них, а в CRM запишется, какой менеджер это сделал.
import { ActionDialog, ActionForm, type ActionState } from './ActionForm';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;
export type DealDefaults = { clientName?: string; clientPhone?: string; price?: number | null; priceVat?: boolean; note?: string | null };

const rubInput = (kop?: number | null) => (kop ? String(Math.round(kop / 100)) : '');

export function DealFields({ d }: { d: DealDefaults }) {
  return (
    <>
      <label className="field">Имя клиента<input className="input" name="clientName" required maxLength={120} defaultValue={d.clientName ?? ''} autoComplete="off" /></label>
      <label className="field">Телефон<input className="input" name="clientPhone" required type="tel" inputMode="tel" placeholder="+7 999 123-45-67" defaultValue={d.clientPhone ? `+${d.clientPhone}` : ''} autoComplete="off" /></label>
      <label className="field">Стоимость, ₽<input className="input" name="price" required inputMode="numeric" defaultValue={rubInput(d.price)} /></label>
      <label className="check"><input type="checkbox" name="priceVat" defaultChecked={!!d.priceVat} /> Цена с НДС</label>
      <label className="field">Комментарий (необязательно)<textarea className="input" name="note" rows={2} maxLength={500} defaultValue={d.note ?? ''} /></label>
    </>
  );
}

export function SaleDealButtons({ carId, title, status, action, d }: { carId: string; title: string; status: string; action: Action; d: DealDefaults }) {
  const hidden = (op: string) => ({ id: carId, op });
  if (status === 'sold') {
    return <ActionForm action={action} hidden={hidden('release')} submit="Вернуть в продажу" variant="quiet" confirm={`Вернуть «${title}» в продажу? Продажа отменится, запись о ней останется в истории.`} />;
  }
  return (
    <div className="wrap-row" style={{ gap: 6 }}>
      {status !== 'reserved' ? (
        <ActionDialog label="Забронировать" title={`Бронь · ${title}`} action={action} submit="Забронировать" hidden={hidden('reserve')} description="Имя, телефон и стоимость обязательны. Бронь будет записана на вас.">
          <DealFields d={d} />
        </ActionDialog>
      ) : null}
      <ActionDialog label="Продано" title={`Продажа · ${title}`} action={action} submit="Отметить продажу" hidden={hidden('sell')} description={status === 'reserved' ? 'Данные взяты из брони — проверьте и поправьте при необходимости.' : 'Имя, телефон и стоимость обязательны. Продажа будет записана на вас.'}>
        <DealFields d={d} />
      </ActionDialog>
      {status === 'reserved' ? <ActionForm action={action} hidden={hidden('release')} submit="Снять бронь" variant="quiet" confirm={`Снять бронь с «${title}»? Машина вернётся в продажу.`} /> : null}
    </div>
  );
}
