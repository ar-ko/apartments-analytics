// История выгрузок: data/history.json разворачивается в строки выгрузок — те же, что раньше давали CSV.
// Формат файла описан в scripts/history.py: постоянные поля квартиры один раз, цены и площадь —
// точками изменения, наличие в выгрузках — интервалами.

const HISTORY_URL = 'data/history.json';

export async function loadHistoryRows() {
  const response = await fetch(HISTORY_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Не найден ${HISTORY_URL}`);
  return expandHistory(await response.json());
}

export function dateInfo(iso) {
  const [y, m, d] = iso.split('-');
  return { iso, label: `${d}.${m}.${y}`, sort: iso };
}

// Строки упорядочены по дате, а внутри даты — по цене, как шли квартиры в выгрузках застройщика.
export function expandHistory(history) {
  const dates = history.dates.map(dateInfo);
  const rows = [];
  for (const [flatId, flat] of Object.entries(history.flats)) {
    const base = {
      project: history.projects[flat.p],
      link: flat.l || (history.link ? history.link.replace('{id}', flatId) : ''),
      flat_id: flatId,
      floor: flat.f ?? '',
      building_name: flat.b ?? '',
      section_number: flat.s ?? '',
      section_floors_count: flat.fc ?? '',
    };
    let priceAt = 0;
    let areaAt = 0;
    for (const [start, end] of flat.r) {
      for (let i = start; i <= end; i++) {
        while (priceAt + 1 < flat.pr.length && flat.pr[priceAt + 1][0] <= i) priceAt++;
        while (areaAt + 1 < flat.a.length && flat.a[areaAt + 1][0] <= i) areaAt++;
        const [, price, full] = flat.pr[priceAt];
        const area = flat.a[areaAt][1];
        rows.push({
          ...base,
          area,
          price_with_discount: price,
          price_without_discount: full,
          date: dates[i].iso,
          date_label: dates[i].label,
          date_sort: dates[i].sort,
          price_m2: price / area,
          discount: Math.max(0, full - price),
        });
      }
    }
  }
  return rows.sort((a, b) => a.date_sort.localeCompare(b.date_sort)
    || a.price_with_discount - b.price_with_discount
    || Number(a.flat_id) - Number(b.flat_id));
}
