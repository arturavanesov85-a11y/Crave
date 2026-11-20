'use client';

// Галочка «Почасовая тарификация» в форме тарифа. Когда она стоит, поля посуточного тарифа
// (блоки с классом daily-only) скрываются и отключаются, а ставка с водителем становится обязательной.
import { useEffect, useRef, useState } from 'react';
import { DRIVER_MIN_HOURS } from '@/lib/pricing';

export function HourlyToggle({ defaultChecked = false }: { defaultChecked?: boolean }) {
  const [on, setOn] = useState(defaultChecked);
  const ref = useRef<HTMLLabelElement>(null);

  useEffect(() => {
    const form = ref.current?.closest('form');
    if (!form) return;
    form.querySelectorAll<HTMLElement>('.daily-only').forEach((el) => {
      el.hidden = on;
      el.querySelectorAll<HTMLInputElement>('input, select').forEach((i) => (i.disabled = on));
    });
    const driver = form.querySelector<HTMLInputElement>('input[name="driver"]');
    if (driver) driver.required = on;
  }, [on]);

  return (
    <label ref={ref} className="check">
      <input type="checkbox" name="driverOnly" checked={on} onChange={(e) => setOn(e.target.checked)} />
      <span>Почасовая тарификация — только с водителем, от {DRIVER_MIN_HOURS} ч<span className="muted small" style={{ display: 'block' }}>Посуточной аренды нет: клиент выбирает время и число часов, цена — ставка с водителем × часы.</span></span>
    </label>
  );
}
