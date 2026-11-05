// Логотип CRAVE как на crave-rental.ru. Прокат — оригинальная картинка с подписью CAR RENTAL.
// Автосалон, сервис и CRM — тот же знак (силуэт + CRAVE) и подпись тем же шрифтом.
// markOnly — только знак без подписи (шапка сайтов автосалона и сервиса).
// Подпись оригинала набрана Playfair Display Regular (сверено попиксельно).
// Пропорции из оригинала 1232×520: знак 382, от знака до верха прописных 57, высота прописных 74.

const W0 = 1232;
const LABEL: Record<string, string> = { rental: 'CAR RENTAL', auto: 'AUTO', service: 'SERVICE', crm: 'CRM' };
// Метрики Playfair Display: прописные 0,71 em; при line-height 1 верх прописных на 0,2055 em ниже верха строки.
const CAP_EM = 0.71;
const CAP_TOP_EM = 0.2055;

export function Logo({ variant = 'rental', height = 48, markOnly = false }: { variant?: 'rental' | 'auto' | 'service' | 'crm'; height?: number; markOnly?: boolean }) {
  const width = Math.round((height * W0) / 520);
  if (variant === 'rental') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/brand/crave-rental.webp" alt="CRAVE Car Rental" width={width} height={height} style={{ display: 'block', height, width: 'auto' }} />;
  }
  const k = width / W0;
  if (markOnly) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/brand/crave-mark.webp" alt="CRAVE" style={{ display: 'block', width, height: 382 * k }} />;
  }
  const fontSize = (74 * k) / CAP_EM;
  return (
    <span aria-label={`CRAVE ${LABEL[variant]}`} role="img" style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', width, height, lineHeight: 1, overflow: 'visible' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/crave-mark.webp" alt="" aria-hidden="true" style={{ display: 'block', width, height: 382 * k }} />
      <span
        aria-hidden="true"
        style={{
          fontFamily: "var(--font-logo), 'Playfair Display', serif",
          fontWeight: 400,
          fontSize,
          lineHeight: 1,
          color: '#CBCBC7',
          marginTop: 57 * k - CAP_TOP_EM * fontSize,
          whiteSpace: 'nowrap',
        }}
      >
        {LABEL[variant]}
      </span>
    </span>
  );
}
