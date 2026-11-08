import { buildUrlSearch, flatFromState, fromFromState, parseUrlState, viewFromState } from '../js/url-state.js';
import { assert, test } from './runner.js';

const DEFAULTS = {
  date: '2026-11-07',
  compareDate: '2026-10-31',
  project: 'all',
  building: 'all',
  search: '',
  minArea: '',
  maxArea: '',
  minPrice: '',
  maxPrice: '',
  tab: 'changed',
  view: 'table',
  flat: null,
  from: null,
};

test('адрес без параметров — пустое состояние', () => {
  assert.deepEqual(parseUrlState(''), {});
  assert.deepEqual(parseUrlState('?q=&area_from='), {});
});

test('параметры адреса читаются в поля состояния', () => {
  assert.deepEqual(
    parseUrlState('?date=2026-10-31&cmp=2026-10-24&project=%D0%97%D0%B0%D1%80%D0%B5%D0%BA%D0%B0&building=%D0%94%D0%BE%D0%BC+3&q=46565&area_from=30&area_to=60&price_from=5000000&price_to=8000000&tab=new'),
    { date: '2026-10-31', compareDate: '2026-10-24', project: 'Зарека', building: 'Дом 3', search: '46565', minArea: '30', maxArea: '60', minPrice: '5000000', maxPrice: '8000000', tab: 'new' },
  );
});

test('значения по умолчанию в адрес не пишутся', () => {
  assert.equal(buildUrlSearch({ ...DEFAULTS }, DEFAULTS), '');
});

test('изменённые фильтры попадают в адрес и читаются обратно', () => {
  const state = { ...DEFAULTS, project: 'Кварталы «На Минской»', building: 'Дом 3-1', search: 'дом 3', maxPrice: '8000000', tab: 'gone' };
  const search = buildUrlSearch(state, DEFAULTS);
  assert.ok(!search.includes('date='), 'дата по умолчанию не пишется');
  assert.deepEqual(parseUrlState(search), {
    project: 'Кварталы «На Минской»', building: 'Дом 3-1', search: 'дом 3', maxPrice: '8000000', tab: 'gone',
  });
});

test('старая дата и нестандартное сравнение сохраняются', () => {
  const search = buildUrlSearch({ ...DEFAULTS, date: '2026-10-31', compareDate: '2026-09-26' }, { ...DEFAULTS, compareDate: '2026-10-24' });
  assert.equal(search, '?date=2026-10-31&cmp=2026-09-26');
});

test('вид и открытая квартира: view=chess и flat пишутся, таблица и закрытая панель — нет', () => {
  assert.equal(buildUrlSearch({ ...DEFAULTS, view: 'chess', flat: '71878' }, DEFAULTS), '?view=chess&flat=71878');
  assert.equal(buildUrlSearch({ ...DEFAULTS, view: 'table', flat: null }, DEFAULTS), '');
  const state = parseUrlState('?project=%D0%A0%D0%B5%D1%81%D0%BF%D1%83%D0%B1%D0%BB%D0%B8%D0%BA%D0%B8+205&building=%D0%94%D0%BE%D0%BC+3-1&view=chess&flat=71878');
  assert.equal(state.building, 'Дом 3-1');
  assert.equal(viewFromState(state), 'chess');
  assert.equal(flatFromState(state), '71878');
});

test('неизвестные значения вида и квартиры игнорируются', () => {
  assert.equal(viewFromState(parseUrlState('?view=grid')), 'table');
  assert.equal(viewFromState(parseUrlState('')), 'table');
  assert.equal(flatFromState(parseUrlState('?flat=abc')), null);
  assert.equal(flatFromState(parseUrlState('?flat=')), null);
});

test('источник панели: from=changes пишется вместе с квартирой и читается обратно, неизвестный — игнорируется', () => {
  const search = buildUrlSearch({ ...DEFAULTS, tab: 'gone', flat: '71878', from: 'changes' }, DEFAULTS);
  assert.equal(search, '?tab=gone&flat=71878&from=changes');
  const state = parseUrlState(search);
  assert.equal(fromFromState(state), 'changes');
  assert.equal(flatFromState(state), '71878');
  assert.equal(buildUrlSearch({ ...DEFAULTS, flat: null, from: null }, DEFAULTS), '', 'панель закрыта — ни flat, ни from');
  assert.equal(fromFromState(parseUrlState('?from=chess&flat=1')), null);
  assert.equal(fromFromState(parseUrlState('?flat=1')), null);
});
