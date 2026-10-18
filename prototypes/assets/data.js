// Тарифы с crave-rental.ru/prajs/ (снято 2026-10-18). ТРЕБУЮТ ПРОВЕРКИ ВЛАДЕЛЬЦЕМ.
// Ставки за сутки: [1–2 сут, от 3, от 7, от 14, от 30].
window.CRAVE_CARS = [
  { slug: 'bmw-m5', name: 'BMW M5 F90 Competition', brand: 'BMW', cls: 'sedan', specs: '750 л.с. · 2,8 с · 2020 · полный привод', t: [40000, 38000, 36000, 32000, 28000], deposit: 50000, overKm: 150, driver: 7000, free: true },
  { slug: 'amg-gt63', name: 'Mercedes-AMG GT63 S 4-door', brand: 'Mercedes', cls: 'coupe', specs: '740 л.с. · 2,8 с · 2020 · полный привод', t: [45000, 42000, 38000, 34000, 30000], deposit: 50000, overKm: 150, driver: 7000, free: false },
  { slug: 'cayenne', name: 'Porsche Cayenne S III', brand: 'Porsche', cls: 'suv', specs: '530 л.с. · 4,4 с · 2020 · полный привод', t: [30000, 28500, 27000, 24000, 21000], deposit: 50000, overKm: 150, driver: 6000, free: true },
  { slug: 'g63', name: 'Mercedes-Benz G63 First Edition', brand: 'Mercedes', cls: 'suv', specs: '750 л.с. · 3,9 с · 2018 · полный привод', t: [54000, 52000, 49500, 46000, 39500], deposit: 100000, overKm: 150, driver: null, free: true },
  { slug: 'bmw-540i', name: 'BMW 540i', brand: 'BMW', cls: 'sedan', specs: '340 л.с. · 4,8 с · 2020 · полный привод', t: [22500, 20000, 18700, 17500, 15000], deposit: 50000, overKm: 150, driver: null, free: true },
  { slug: 'bmw-m340i', name: 'BMW M340i xDrive LCI', brand: 'BMW', cls: 'sedan', specs: '387 л.с. · 4,1 с · 2024 · полный привод', t: [21000, 19000, 17000, 15500, 13000], deposit: 50000, overKm: 150, driver: null, free: true },
  { slug: 'ram-trx', name: 'Dodge RAM TRX', brand: 'Dodge', cls: 'pickup', specs: '900 л.с. · 3,5 с · 2022 · полный привод', t: [50000, 47500, 45000, 40500, 35000], deposit: 100000, overKm: 200, driver: null, free: false },
  { slug: 'lc300', name: 'Toyota Land Cruiser 300 70th Anniversary', brand: 'Toyota', cls: 'suv', specs: '360 л.с. · 5,9 с · 2022 · дизель', t: [30000, 28500, 27000, 24000, 21000], deposit: 50000, overKm: 100, driver: 6000, free: true }
];

window.CRAVE_CLS = { sedan: 'Седан', coupe: 'Купе', suv: 'Внедорожник', pickup: 'Пикап' };

// Ступень по сроку. ПРЕДПОЛОЖЕНИЕ: весь срок считается по ставке своей ступени (вопрос A2).
window.CRAVE_TIERS = [
  { min: 30, idx: 4, label: 'от 30 суток' },
  { min: 14, idx: 3, label: 'от 14 суток' },
  { min: 7, idx: 2, label: 'от 7 суток' },
  { min: 3, idx: 1, label: 'от 3 суток' },
  { min: 1, idx: 0, label: '1–2 суток' }
];
window.crave = {
  tierOf: function (days) {
    var T = window.CRAVE_TIERS;
    for (var i = 0; i < T.length; i++) if (days >= T[i].min) return T[i];
    return T[T.length - 1];
  },
  fmt: function (n) { return n.toLocaleString('ru-RU'); },
  days: function (n) {
    var m10 = n % 10, m100 = n % 100;
    return n + (m10 === 1 && m100 !== 11 ? ' сутки' : ' суток');
  },
  esc: function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
};
