import { buildDataset, compareChoice, latestRows } from '../js/dataset.js';
import { flat } from './fixtures.js';
import { assert, test } from './runner.js';

test('выгрузки упорядочены по дате независимо от порядка файлов', () => {
  const { snapshots } = buildDataset([
    flat({ file: '2026.11.07.csv' }),
    flat({ file: '30.05.2026.csv' }),
    flat({ file: '2026.06.13.csv' }),
  ]);
  assert.deepEqual(snapshots.map(s => s.label), ['30.05.2026', '13.06.2026', '07.11.2026']);
});

test('строки индексируются по дате выгрузки', () => {
  const { rowsByDate } = buildDataset([
    flat({ flat_id: '1', file: '2026.10.31.csv' }),
    flat({ flat_id: '2', file: '2026.10.31.csv' }),
    flat({ flat_id: '1', file: '2026.11.07.csv' }),
  ]);
  assert.equal(rowsByDate.get('2026-10-31').length, 2);
  assert.equal(rowsByDate.get('2026-11-07').length, 1);
});

test('пустые постоянные поля старой выгрузки берутся из свежей строки, цена — своя', () => {
  const { rowsByDate } = buildDataset([
    flat({ file: '2026.05.30.csv', building_name: '', floor: '', price_with_discount: 5000000 }),
    flat({ file: '2026.11.07.csv', building_name: 'Дом 8', floor: 7, price_with_discount: 6000000 }),
  ]);
  const old = rowsByDate.get('2026-05-30')[0];
  assert.equal(old.building_name, 'Дом 8');
  assert.equal(old.floor, 7);
  assert.equal(old.price_with_discount, 5000000);
});

test('площадь и цена за м² берутся из своей выгрузки, а не из свежей', () => {
  const { rowsByDate } = buildDataset([
    flat({ file: '2026.06.20.csv', area: 27.2, price_with_discount: 6650000 }),
    flat({ file: '2026.08.15.csv', area: 27.6, price_with_discount: 6650000 }),
  ]);
  const old = rowsByDate.get('2026-06-20')[0];
  assert.equal(old.area, 27.2);
  assert.equal(Math.round(old.price_m2), 244485);
  assert.equal(rowsByDate.get('2026-08-15')[0].area, 27.6);
});

test('сводка, проекты и квартиры берут последнюю выгрузку, независимо от даты блока изменений', () => {
  const dataset = buildDataset([
    flat({ flat_id: '1', file: '2026.11.07.csv' }),
    flat({ flat_id: '2', file: '2026.10.31.csv' }),
    flat({ flat_id: '3', file: '2026.11.07.csv' }),
  ]);
  assert.deepEqual(latestRows(dataset).map(r => r.flat_id), ['1', '3']);
  assert.deepEqual(latestRows(buildDataset([])), []);
});

test('«Сравнивать с» следует за датой, пока сравнение не выбрали вручную', () => {
  const snapshots = ['2026-10-17', '2026-10-24', '2026-10-31', '2026-11-07'].map(date => ({ date, label: date }));
  const pick = (date, current, manual) => { const c = compareChoice(snapshots, date, current, manual); return [c.options.length, c.value, c.manual]; };
  assert.deepEqual(pick('2026-11-07', '', false), [3, '2026-10-31', false]);
  assert.deepEqual(pick('2026-10-31', '2026-10-31', false), [2, '2026-10-24', false], 'не выбрано вручную — неделя назад');
  assert.deepEqual(pick('2026-11-07', '2026-10-17', true), [3, '2026-10-17', true], 'ручной выбор сохраняется');
  assert.deepEqual(pick('2026-10-24', '2026-10-31', true), [1, '2026-10-17', false], 'ручной выбор стал недопустим — сброс');
  assert.deepEqual(pick('2026-10-17', '', false), [0, '', false], 'для первой выгрузки сравнивать не с чем');
});

test('сравнение по умолчанию — выгрузка недельной давности, а не вчерашняя', () => {
  const at = (dates, date) => compareChoice(dates.map(d => ({ date: d, label: d })), date, '', false).value;
  const daily = ['2026-10-31', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-14', '2026-11-15'];
  assert.equal(at(daily, '2026-11-08'), '2026-10-31', 'ровно за неделю выгрузки нет — ближайшая более ранняя');
  assert.equal(at(daily, '2026-11-14'), '2026-11-07', 'ровно 7 дней');
  assert.equal(at(daily, '2026-11-15'), '2026-11-08');
  assert.equal(at(['2026-11-05', '2026-11-06', '2026-11-08'], '2026-11-08'), '2026-11-05', 'выгрузки идут меньше недели — самая ранняя');
});
