// Сборка набора данных из строк всех выгрузок: список выгрузок, индекс по дате,
// поля, которых нет в старых CSV, — из самой свежей строки квартиры.

import { groupBy } from './analytics.js';

export function buildDataset(rows) {
  const sorted = [...rows].sort((a, b) => a.date_sort.localeCompare(b.date_sort));
  const snapshots = [...new Map(sorted.map(r => [r.date, { date: r.date, label: r.date_label, sort: r.date_sort }])).values()];

  const latestByFlatId = buildLatestByFlatId(sorted);
  const allRows = sorted.map(row => enrichWithLatestStaticData(row, latestByFlatId));

  return {
    allRows,
    snapshots,
    rowsByDate: groupBy(allRows, r => r.date),
  };
}

function buildLatestByFlatId(sortedRows) {
  const map = new Map();
  // Строки отсортированы по дате, поэтому последняя запись по ID — самая свежая.
  for (const row of sortedRows) map.set(row.flat_id, row);
  return map;
}

// Площадь и цена за м² остаются из своей выгрузки: площадь квартиры со временем
// уточняется, и прошлую цену нужно делить на площадь, актуальную на ту дату.
function enrichWithLatestStaticData(row, latestByFlatId) {
  const latest = latestByFlatId.get(row.flat_id) || row;
  return {
    ...row,
    project: latest.project || row.project,
    link: latest.link || row.link,
    floor: latest.floor || row.floor,
    building_name: latest.building_name || row.building_name,
    section_number: latest.section_number || row.section_number,
    section_floors_count: latest.section_floors_count || row.section_floors_count,
  };
}

// Строки самой свежей выгрузки: по ним считаются сводка, проекты и блок «Квартиры».
export function latestRows(dataset) {
  const last = dataset.snapshots.at(-1);
  return last ? dataset.rowsByDate.get(last.date) ?? [] : [];
}

const COMPARE_DAYS = 7;

// Варианты «Сравнивать с» — выгрузки раньше выбранной даты.
// Ручной выбор сохраняется, пока он допустим; иначе сравнение следует за датой — выгрузка недельной давности:
// самая свежая не позже чем за 7 дней до даты, а если выгрузки идут меньше недели — самая ранняя.
export function compareChoice(snapshots, date, current, manual) {
  const idx = snapshots.findIndex(s => s.date === date);
  const options = idx > 0 ? snapshots.slice(0, idx) : [];
  if (!options.length) return { options, value: '', manual: false };
  const keep = Boolean(manual) && options.some(s => s.date === current);
  const weekAgo = new Date(Date.parse(`${date}T00:00:00Z`) - COMPARE_DAYS * 86400000).toISOString().slice(0, 10);
  const fallback = (options.filter(s => s.date <= weekAgo).at(-1) ?? options[0]).date;
  return { options, value: keep ? current : fallback, manual: keep };
}
