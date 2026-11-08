import { NO_SORT, sortRows, toggleSort } from '../js/sort.js';
import { assert, test } from './runner.js';

test('сортировка: возрастание → убывание → исходный порядок', () => {
  const asc = toggleSort(NO_SORT, 'area');
  const desc = toggleSort(asc, 'area');
  assert.deepEqual(asc, { key: 'area', dir: 'asc' });
  assert.deepEqual(desc, { key: 'area', dir: 'desc' });
  assert.deepEqual(toggleSort(desc, 'area'), NO_SORT);
  assert.deepEqual(toggleSort(desc, 'floor'), { key: 'floor', dir: 'asc' });
});

test('sortRows не меняет исходный массив, сброс возвращает исходный порядок', () => {
  const rows = [{ v: 2 }, { v: 3 }, { v: 1 }];
  const sorted = sortRows(rows, { key: 'v', dir: 'asc' });
  assert.deepEqual(sorted.map(r => r.v), [1, 2, 3]);
  assert.deepEqual(rows.map(r => r.v), [2, 3, 1]);
  assert.deepEqual(sortRows(rows, NO_SORT).map(r => r.v), [2, 3, 1]);
});

test('пустые значения — в конце при возрастании, строки — по-русски с числами', () => {
  assert.deepEqual(sortRows([{ v: '' }, { v: 2 }, { v: 1 }], { key: 'v', dir: 'asc' }).map(r => r.v), [1, 2, '']);
  assert.deepEqual(sortRows([{ v: 'Дом 10' }, { v: 'Дом 9' }, { v: 'Дом 3-1' }], { key: 'v', dir: 'asc' }).map(r => r.v), ['Дом 3-1', 'Дом 9', 'Дом 10']);
});
