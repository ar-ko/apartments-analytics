// Фильтрация, сравнение выгрузок и агрегаты. Только чистые функции без DOM.

export function matchesFilters(row, filters) {
  const {
    project = 'all', building = 'all', search = '',
    minArea = 0, maxArea = Infinity, minPrice = 0, maxPrice = Infinity,
  } = filters;
  const query = search.trim().toLowerCase();
  return (project === 'all' || row.project === project)
    && (building === 'all' || row.building_name === building)
    && (!query || [row.project, row.flat_id, row.link, row.building_name, row.section_number]
      .some(v => String(v).toLowerCase().includes(query)))
    && row.area >= minArea
    && row.area <= maxArea
    && row.price_with_discount >= minPrice
    && row.price_with_discount <= maxPrice;
}

export function filterRows(rows, filters) {
  return rows.filter(row => matchesFilters(row, filters));
}

// Сравнение считается по полным выгрузкам, а фильтры применяются к результату:
// иначе квартира, чья цена пересекла границу фильтра по цене, попала бы в «Новые» или «Исчезли».
// Фильтр проверяется по строке той выгрузки, в которой квартира показана:
// текущей — для «Изменили цену» и «Новые», более ранней — для «Исчезли».
export function compareSnapshots(currentRows, prevRows, filters) {
  const curIds = new Set(currentRows.map(r => r.flat_id));
  const prevMap = new Map(prevRows.map(r => [r.flat_id, r]));
  const matches = row => matchesFilters(row, filters);

  const changed = currentRows
    .filter(r => matches(r) && prevMap.has(r.flat_id) && r.price_with_discount !== prevMap.get(r.flat_id).price_with_discount)
    .map(r => {
      const oldPrice = prevMap.get(r.flat_id).price_with_discount;
      return { ...r, old_price: oldPrice, delta: r.price_with_discount - oldPrice };
    });
  const fresh = currentRows.filter(r => matches(r) && !prevMap.has(r.flat_id));
  const gone = prevRows.filter(r => matches(r) && !curIds.has(r.flat_id));

  return { changed, fresh, gone };
}

export function summarizeProjects(rows) {
  return [...groupBy(rows, r => r.project).entries()].map(([project, items]) => ({
    project,
    count: items.length,
    avgArea: average(items, 'area'),
    avgPrice: average(items, 'price_with_discount'),
    avgM2: average(items, 'price_m2'),
    medianM2: median(items, 'price_m2'),
  }));
}

export function average(rows, key) {
  if (!rows.length) return 0;
  return rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) / rows.length;
}

export function median(rows, key) {
  const values = rows
    .map(row => Number(row[key]))
    .filter(value => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  if (!values.length) return 0;

  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle];
}

export function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}
