// Конструктор строк выгрузки для тестов.

import { dateInfo } from '../js/history.js';

// Дата выгрузки из имени файла-примера: ГГГГ.ММ.ДД или ДД.ММ.ГГГГ.
function dateFromFile(name) {
  const ymd = name.match(/(\d{4})[.\-_](\d{1,2})[.\-_](\d{1,2})/);
  const dmy = name.match(/(\d{1,2})[.\-_](\d{1,2})[.\-_](\d{4})/);
  const [y, m, d] = ymd ? [ymd[1], ymd[2], ymd[3]] : [dmy[3], dmy[2], dmy[1]];
  return dateInfo(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
}

export function flat(overrides = {}) {
  const date = dateFromFile(overrides.file ?? '2026.11.07.csv');
  const row = {
    project: 'Зарека',
    link: 'https://example.com/flat/1/',
    area: 40,
    price_with_discount: 6000000,
    price_without_discount: 7000000,
    flat_id: '1',
    floor: 3,
    building_name: 'Дом 1',
    section_number: '1',
    section_floors_count: 9,
    source_file: overrides.file ?? '2026.11.07.csv',
    date: date.iso,
    date_label: date.label,
    date_sort: date.sort,
    ...overrides,
  };
  row.price_m2 = row.price_with_discount / row.area;
  row.discount = row.price_without_discount - row.price_with_discount;
  delete row.file;
  return row;
}
