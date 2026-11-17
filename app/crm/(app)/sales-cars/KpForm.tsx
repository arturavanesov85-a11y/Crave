// КП в PDF из CRM: стоимость подставлена из объявления, её можно поменять перед выгрузкой.
export function KpForm({ carId, price, vat }: { carId: string; price: number | null; vat: boolean }) {
  return (
    <section className="card pad stack" style={{ gap: 10 }}>
      <h2>Коммерческое предложение</h2>
      <form action={`/api/sales-cars/${carId}/kp`} method="get" target="_blank" className="wrap-row" style={{ gap: 10, alignItems: 'end' }}>
        <label className="field" style={{ flex: '1 1 200px' }}>Стоимость в КП, ₽ (пусто — «по запросу»)
          <input className="input" name="price" inputMode="numeric" defaultValue={price ? String(Math.round(price / 100)) : ''} />
        </label>
        <label className="check"><input type="checkbox" name="vat" value="1" defaultChecked={vat} />с НДС</label>
        <button className="btn btn-primary btn-sm" type="submit">Скачать КП (PDF)</button>
      </form>
      <p className="muted small">В КП попадут характеристики, комплектация и все фото объявления в текущем порядке.</p>
    </section>
  );
}
