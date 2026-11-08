import { dateInfo, expandHistory } from '../js/history.js';
import { assert, test } from './runner.js';

const HISTORY = {
  version: 1,
  dates: ['2026-05-30', '2026-06-13', '2026-06-20', '2026-06-27'],
  link: 'https://example.com/flat/{id}/',
  projects: ['Зарека', 'Речной порт'],
  flats: {
    // была в 1-й и 2-й выгрузках, пропала, вернулась в 4-й с новой ценой и уточнённой площадью
    10: { p: 0, b: 'Дом 1', s: '2', f: 7, fc: 9, r: [[0, 1], [3, 3]], pr: [[0, 5000000, 6000000], [3, 4800000, 6000000]], a: [[0, 40], [3, 40.5]] },
    // ссылка не по шаблону, постоянных полей нет
    20: { p: 1, l: 'https://example.com/other/20', r: [[2, 3]], pr: [[2, 3000000, 3000000]], a: [[2, 20]] },
  },
};

test('dateInfo: подпись и ключ сортировки из ISO-даты', () => {
  assert.deepEqual(dateInfo('2026-11-07'), { iso: '2026-11-07', label: '07.11.2026', sort: '2026-11-07' });
});

test('expandHistory: квартира есть только в выгрузках своих интервалов', () => {
  const rows = expandHistory(HISTORY).filter(r => r.flat_id === '10');
  assert.deepEqual(rows.map(r => r.date), ['2026-05-30', '2026-06-13', '2026-06-27']);
});

test('expandHistory: цена и площадь держатся до следующей точки изменения', () => {
  const rows = expandHistory(HISTORY).filter(r => r.flat_id === '10');
  assert.deepEqual(rows.map(r => [r.price_with_discount, r.price_without_discount, r.area]), [
    [5000000, 6000000, 40], [5000000, 6000000, 40], [4800000, 6000000, 40.5],
  ]);
  assert.equal(rows[2].discount, 1200000);
  assert.equal(rows[0].price_m2, 125000);
});

test('expandHistory: постоянные поля, ссылка по шаблону и своя ссылка', () => {
  const rows = expandHistory(HISTORY);
  const a = rows.find(r => r.flat_id === '10');
  const b = rows.find(r => r.flat_id === '20');
  assert.deepEqual([a.project, a.building_name, a.section_number, a.floor, a.section_floors_count, a.link],
    ['Зарека', 'Дом 1', '2', 7, 9, 'https://example.com/flat/10/']);
  assert.deepEqual([b.project, b.building_name, b.floor, b.link], ['Речной порт', '', '', 'https://example.com/other/20']);
});

test('expandHistory: строки идут по дате, внутри даты — по цене', () => {
  const rows = expandHistory(HISTORY).filter(r => r.date === '2026-06-27');
  assert.deepEqual(rows.map(r => r.flat_id), ['20', '10']);
});
