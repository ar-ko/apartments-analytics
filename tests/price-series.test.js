import { gapsBetween, pointAt, presenceRuns, stepPaths } from '../js/price-series.js';
import { assert, test } from './runner.js';

test('ряды цен: отрезки присутствия и пропуски между ними', () => {
  assert.deepEqual(presenceRuns([null, 5, 5, null, null, 4, null]), [[1, 2], [5, 5]]);
  assert.deepEqual(presenceRuns([1, 2, 3]), [[0, 2]]);
  assert.deepEqual(gapsBetween([[1, 2], [5, 5]]), [{ from: 2, to: 5 }]);
  assert.deepEqual(gapsBetween([[0, 2]]), []);
});

test('пропуск рисуется пунктиром на последнем известном значении, затем ступенька к новому', () => {
  const values = [10, 10, null, 8];
  const runs = presenceRuns(values);
  const { solid, dashed } = stepPaths(values, runs, i => i * 10, v => v, 100);
  // Отрезок до пропуска заканчивается на своей последней неделе, последний — доходит до правого края.
  assert.equal(solid, 'M0.0,10.0H10.0V10.0H10.0M30.0,8.0H100.0');
  assert.equal(dashed, 'M10.0,10.0H30.0V8.0');
});

test('подсказка: неделя без квартиры — «Неизвестно», иначе цены, скидка и цена за м²', () => {
  assert.deepEqual(pointAt([null], [null], [null], 0), { known: false });
  const p = pointAt([8000000], [10000000], [40], 0);
  assert.equal(p.known, true);
  assert.equal(Math.round(p.disc * 1000) / 1000, 20);
  assert.equal(p.m2, 200000);
});
