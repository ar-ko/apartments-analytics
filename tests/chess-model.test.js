import { chessSections, findSlot, neighbour, posText, rowWidth, statusCounts } from '../js/chess-model.js';
import { assert, test } from './runner.js';

const FLATS = new Map([
  ['a', { id: 'a', status: 'sale' }],
  ['b', { id: 'b', status: 'booked' }],
  ['c', { id: 'c', status: 'sold' }],
  ['d', { id: 'd', status: 'sold' }],
  ['e', { id: 'e', status: 'sale' }],
]);
// Секция 1: 3 этажа, второй неизвестен (полоса шириной 2); секция 2: 2 этажа.
// Квартира z есть в раскладке, но ни в одной выгрузке её не было.
const BUILDING = {
  sections: [
    { id: '101', n: '1', rows: [
      { f: 3, cells: [{ k: 1, id: 'a' }, { k: 2, id: 'b' }] },
      { f: 2, cells: [], bar: 2 },
      { f: 1, cells: [{ k: 2, id: 'c' }, { k: 3 }] },
    ] },
    { id: '102', n: '2', rows: [
      { f: 2, cells: [{ k: 1, id: 'd' }] },
      { f: 1, cells: [{ k: 1, id: 'e' }, { k: 2, id: 'z' }] },
    ] },
  ],
};
const SECTIONS = chessSections(BUILDING, FLATS);

test('шахматка: статусы клеток, «нет данных» для пустых и невиданных квартир', () => {
  assert.deepEqual(statusCounts(SECTIONS), { sale: 2, booked: 1, sold: 2, nodata: 2 });
  assert.equal(findSlot(SECTIONS, 'e'), '1|1|0');
  assert.equal(findSlot(SECTIONS, 'нет'), null);
  assert.equal(posText(SECTIONS, '0|2|0'), 'секция 1 · 1 эт. · поз. 2');
  assert.equal(posText(SECTIONS, '0|1|-1'), 'секция 1 · 2 эт.');
});

test('соседи: влево и вправо по ряду и в соседнюю секцию на тот же или ближайший этаж', () => {
  assert.equal(neighbour(SECTIONS, '0|0|0', 'right'), '0|0|1');
  assert.equal(neighbour(SECTIONS, '0|0|0', 'left'), null);
  assert.equal(neighbour(SECTIONS, '0|0|1', 'right'), '1|0|0', 'в секции 2 нет 3 этажа — ближайший 2');
  assert.equal(neighbour(SECTIONS, '0|2|1', 'right'), '1|1|0');
  assert.equal(neighbour(SECTIONS, '1|1|0', 'left'), '0|2|1', 'в предыдущую секцию — на последнюю клетку ряда');
  assert.equal(neighbour(SECTIONS, '1|0|0', 'left'), '0|1|-1', 'этаж без данных — полоса');
  assert.equal(neighbour(SECTIONS, '1|1|1', 'right'), null);
});

test('соседи: вверх и вниз — тот же столбец, иначе ближайший; полоса неизвестного этажа', () => {
  assert.equal(neighbour(SECTIONS, '0|0|1', 'down'), '0|1|-1');
  assert.equal(neighbour(SECTIONS, '0|1|-1', 'down', 1), '0|2|1', 'с полосы — в столбец, с которого пришли');
  assert.equal(neighbour(SECTIONS, '0|2|0', 'up'), '0|1|-1');
  assert.equal(neighbour(SECTIONS, '1|1|1', 'up'), '1|0|0', 'позиции 2 этажом выше нет — ближайший столбец');
  assert.equal(neighbour(SECTIONS, '0|0|0', 'up'), null);
  assert.equal(neighbour(SECTIONS, '0|2|0', 'down'), null);
});

// Двухуровневые квартиры. Секция 1 (4 этажа): на 1 этаже t1 и t2 двухуровневые, 2 этаж — только их вторые уровни
// (полоса шириной 3 сужается до 1); на 3 этаже двухуровневая t3 и обычная m; на 4 этаже двухуровневая top —
// выше этажей нет, клетка обычная. Секция 2 (1 этаж): двухуровневая s — выше этажей нет.
const TWO = new Map([
  ['t1', { id: 't1', status: 'sale', levels: 2 }],
  ['t2', { id: 't2', status: 'sold', levels: 2 }],
  ['n1', { id: 'n1', status: 'sold', levels: 1 }],
  ['t3', { id: 't3', status: 'sale', levels: 2 }],
  ['m', { id: 'm', status: 'sale', levels: 1 }],
  ['top', { id: 'top', status: 'sale', levels: 2 }],
  ['s', { id: 's', status: 'sale', levels: 2 }],
]);
const TWO_SECTIONS = chessSections({
  sections: [
    { id: '1', n: '1', rows: [
      { f: 4, cells: [{ k: 1, id: 'top' }, { k: 2 }, { k: 3 }] },
      { f: 3, cells: [{ k: 1, id: 'm' }, { k: 2, id: 't3' }] },
      { f: 2, cells: [], bar: 3 },
      { f: 1, cells: [{ k: 1, id: 't1' }, { k: 2, id: 't2' }, { k: 3, id: 'n1' }] },
    ] },
    { id: '2', n: '2', rows: [{ f: 1, cells: [{ k: 1, id: 's' }] }] },
  ],
}, TWO);

test('двухуровневые: клетка в два ряда, столбцы ряда выше сдвигаются, полоса сужается', () => {
  const [sec, sec2] = TWO_SECTIONS;
  const view = row => row.cells.map(c => `${c.id ?? '—'}@${c.col}${c.tall ? '↑' : ''}`).join(' ');
  assert.equal(view(sec.rows[3]), 't1@0↑ t2@1↑ n1@2');
  assert.deepEqual(sec.rows[2].up, [0, 1]);
  assert.deepEqual([sec.rows[2].bar, sec.rows[2].barCol], [1, 2], 'над обычной n1 этаж по-прежнему неизвестен');
  assert.equal(view(sec.rows[1]), 'm@0 t3@1↑');
  assert.equal(view(sec.rows[0]), 'top@0 —@2 —@3', 'столбец 1 занят вторым уровнем t3; у top выше этажей нет');
  assert.equal(rowWidth(sec.rows[0]), 4);
  assert.equal(view(sec2.rows[0]), 's@0', 'единственный этаж секции — клетка обычная');
  assert.equal(posText(TWO_SECTIONS, '0|3|0'), 'секция 1 · 1–2 эт. · поз. 1');
  assert.equal(posText(TWO_SECTIONS, '0|3|2'), 'секция 1 · 1 эт. · поз. 3');
});

test('двухуровневые: вверх — над вторым уровнем, вниз и вверх в занятый столбец — на двухуровневую', () => {
  assert.equal(neighbour(TWO_SECTIONS, '0|3|0', 'up'), '0|1|0', 'с t1 (1–2 этаж) — на 3 этаж');
  assert.equal(neighbour(TWO_SECTIONS, '0|3|2', 'up'), '0|2|-1', 'с n1 — на полосу 2 этажа');
  assert.equal(neighbour(TWO_SECTIONS, '0|1|0', 'down'), '0|3|0', 'с m — на второй уровень t1');
  assert.equal(neighbour(TWO_SECTIONS, '0|1|1', 'down'), '0|3|1', 'с t3 — на второй уровень t2');
  assert.equal(neighbour(TWO_SECTIONS, '0|0|1', 'down'), '0|1|1', 'с клетки справа над t3 — на ближайшую, t3');
  assert.equal(neighbour(TWO_SECTIONS, '0|1|1', 'up'), null, 't3 занимает 3–4 этаж, выше ничего');
  assert.equal(neighbour(TWO_SECTIONS, '0|2|-1', 'down', 2), '0|3|2');
  assert.equal(neighbour(TWO_SECTIONS, '1|0|0', 'left'), '0|3|2', 'в предыдущую секцию — на последнюю клетку 1 этажа');
});

test('двухуровневые: влево и вправо — по видимым столбцам, включая ряд второго уровня', () => {
  assert.equal(neighbour(TWO_SECTIONS, '0|1|1', 'right'), '0|0|1', 'у t3 справа на 3 этаже пусто — клетка 4 этажа рядом со вторым уровнем');
  assert.equal(neighbour(TWO_SECTIONS, '0|0|1', 'left'), '0|1|1', 'обратно — на t3, а не в предыдущую секцию');
  assert.equal(neighbour(TWO_SECTIONS, '0|0|0', 'right'), '0|1|1', 'между top и клеткой справа — второй уровень t3');
  assert.equal(neighbour(TWO_SECTIONS, '0|3|1', 'right'), '0|3|2', 'справа и на своём этаже, и на этаже выше — свой этаж');
  assert.equal(neighbour(TWO_SECTIONS, '0|2|-1', 'left'), '0|3|1', 'с полосы — на второй уровень t2');
  assert.equal(neighbour(TWO_SECTIONS, '0|1|0', 'right'), '0|1|1');
});
