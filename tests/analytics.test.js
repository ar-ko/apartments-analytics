import { compareSnapshots, filterRows, median, summarizeProjects } from '../js/analytics.js';
import { flat } from './fixtures.js';
import { assert, test } from './runner.js';

const ALL = { project: 'all', building: 'all', search: '', minArea: 0, maxArea: Infinity, minPrice: 0, maxPrice: Infinity };
const ids = rows => rows.map(r => r.flat_id).sort();

test('filterRows: проект, дом, площадь и цена от/до, поиск', () => {
  const rows = [
    flat({ flat_id: '1', project: 'Зарека', building_name: 'Дом 1', area: 30, price_with_discount: 5000000 }),
    flat({ flat_id: '2', project: 'Зарека', building_name: 'Дом 2', area: 50, price_with_discount: 9000000 }),
    flat({ flat_id: '3', project: 'Речной порт', building_name: 'Дом 1', area: 60, price_with_discount: 8000000 }),
  ];
  assert.deepEqual(ids(filterRows(rows, { ...ALL, project: 'Зарека' })), ['1', '2']);
  assert.deepEqual(ids(filterRows(rows, { ...ALL, building: 'Дом 1' })), ['1', '3']);
  assert.deepEqual(ids(filterRows(rows, { ...ALL, minArea: 45 })), ['2', '3']);
  assert.deepEqual(ids(filterRows(rows, { ...ALL, maxPrice: 8000000 })), ['1', '3']);
  assert.deepEqual(ids(filterRows(rows, { ...ALL, maxArea: 50 })), ['1', '2']);
  assert.deepEqual(ids(filterRows(rows, { ...ALL, minPrice: 8000000 })), ['2', '3']);
  assert.deepEqual(ids(filterRows(rows, { ...ALL, minArea: 40, maxArea: 55, minPrice: 8500000, maxPrice: 9500000 })), ['2']);
  assert.deepEqual(ids(filterRows(rows, { ...ALL, search: '  РЕЧНОЙ ' })), ['3']);
});

test('compareSnapshots: изменили цену, новые, исчезли', () => {
  const prev = [
    flat({ flat_id: '1', price_with_discount: 6000000 }),
    flat({ flat_id: '2', price_with_discount: 7000000 }),
    flat({ flat_id: '3', price_with_discount: 8000000 }),
  ];
  const current = [
    flat({ flat_id: '1', price_with_discount: 5800000 }),
    flat({ flat_id: '2', price_with_discount: 7000000 }),
    flat({ flat_id: '4', price_with_discount: 9000000 }),
  ];
  const { changed, fresh, gone } = compareSnapshots(current, prev, ALL);
  assert.deepEqual(changed.map(r => [r.flat_id, r.old_price, r.delta]), [['1', 6000000, -200000]]);
  assert.deepEqual(ids(fresh), ['4']);
  assert.deepEqual(ids(gone), ['3']);
});

test('compareSnapshots учитывает все фильтры', () => {
  const prev = [
    flat({ flat_id: '1', area: 30, price_with_discount: 6000000 }),
    flat({ flat_id: '2', area: 60, price_with_discount: 9000000 }),
    flat({ flat_id: '3', area: 30, project: 'Речной порт' }),
  ];
  const current = [
    flat({ flat_id: '1', area: 30, price_with_discount: 5000000 }),
    flat({ flat_id: '2', area: 60, price_with_discount: 8000000 }),
  ];
  const bigOnly = compareSnapshots(current, prev, { ...ALL, minArea: 50 });
  assert.deepEqual(ids(bigOnly.changed), ['2']);
  assert.deepEqual(ids(bigOnly.gone), []);

  const search = compareSnapshots(current, prev, { ...ALL, search: 'речной' });
  assert.deepEqual(ids(search.changed), []);
  assert.deepEqual(ids(search.gone), ['3']);
});

test('цена пересекла границу фильтра — квартира не становится новой или исчезнувшей', () => {
  const prev = [flat({ flat_id: '1', price_with_discount: 5100000 }), flat({ flat_id: '2', price_with_discount: 4900000 })];
  const current = [flat({ flat_id: '1', price_with_discount: 4900000 }), flat({ flat_id: '2', price_with_discount: 5100000 })];
  const { changed, fresh, gone } = compareSnapshots(current, prev, { ...ALL, maxPrice: 5000000 });
  assert.deepEqual(ids(changed), ['1']);
  assert.deepEqual(ids(fresh), []);
  assert.deepEqual(ids(gone), []);
});

test('summarizeProjects считает количество, средние и медиану', () => {
  const [summary] = summarizeProjects([
    flat({ flat_id: '1', area: 20, price_with_discount: 4000000 }),
    flat({ flat_id: '2', area: 40, price_with_discount: 6000000 }),
  ]);
  assert.equal(summary.count, 2);
  assert.equal(summary.avgArea, 30);
  assert.equal(summary.avgPrice, 5000000);
  assert.equal(summary.medianM2, 175000);
  assert.ok(!('avgDiscount' in summary), 'средняя скидка больше не считается');
});

test('median для чётного и нечётного количества, пропуская пустые', () => {
  assert.equal(median([{ v: 3 }, { v: 1 }, { v: 2 }], 'v'), 2);
  assert.equal(median([{ v: 4 }, { v: 1 }, { v: 2 }, { v: 3 }, { v: '' }], 'v'), 2.5);
  assert.equal(median([], 'v'), 0);
});

test('нижняя граница цены тоже не превращает квартиру в новую или исчезнувшую', () => {
  const prev = [flat({ flat_id: '1', price_with_discount: 4900000 })];
  const current = [flat({ flat_id: '1', price_with_discount: 5100000 })];
  const { changed, fresh, gone } = compareSnapshots(current, prev, { ...ALL, minPrice: 5000000 });
  assert.deepEqual(ids(changed), ['1']);
  assert.deepEqual(ids(fresh), []);
  assert.deepEqual(ids(gone), []);
});
