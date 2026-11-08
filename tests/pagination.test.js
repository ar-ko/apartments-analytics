import { normalizePageSize, pageList, pageOfIndex, paginate } from '../js/pagination.js';
import { assert, test } from './runner.js';

test('пагинация: границы страниц, последняя неполная, «все» и пустой список', () => {
  assert.deepEqual(paginate(45, 0, 20), { page: 0, pages: 3, from: 0, to: 20 });
  assert.deepEqual(paginate(45, 2, 20), { page: 2, pages: 3, from: 40, to: 45 });
  assert.deepEqual(paginate(45, 9, 20), { page: 2, pages: 3, from: 40, to: 45 }, 'номер больше последнего прижимается');
  assert.deepEqual(paginate(45, 1, 'all'), { page: 0, pages: 1, from: 0, to: 45 });
  assert.deepEqual(paginate(0, 3, 50), { page: 0, pages: 1, from: 0, to: 0 });
  assert.equal(pageOfIndex(40, 20), 2);
  assert.equal(pageOfIndex(40, 'all'), 0);
});

test('пагинация: кнопки страниц с многоточиями и размер страницы из списка', () => {
  assert.deepEqual(pageList(0, 1), [0]);
  assert.deepEqual(pageList(0, 3), [0, 1, 2]);
  assert.deepEqual(pageList(5, 12), [0, null, 4, 5, 6, null, 11]);
  assert.deepEqual(pageList(1, 12), [0, 1, 2, null, 11]);
  assert.equal(normalizePageSize('50'), 50);
  assert.equal(normalizePageSize('all'), 'all');
  assert.equal(normalizePageSize('10'), 10);
  assert.equal(normalizePageSize('7'), 5, 'неизвестный размер — по умолчанию 5');
});
