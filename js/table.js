// Отрисовка таблиц по описанию колонок и сортировка по клику или с клавиатуры.
// Колонка: { key?, label, render(row), cls? }. Колонка без key не сортируется; cls — класс ячеек колонки.
// rowAttrs(row) — необязательные атрибуты строки (уже экранированные), например data-id и tabindex.

import { escapeHtml } from './format.js';
import { toggleSort } from './sort.js';

export function renderTable({ head, body, columns, rows, sortState, emptyText, rowAttrs }) {
  head.innerHTML = `<tr>${columns.map(col => headerCell(col, sortState)).join('')}</tr>`;
  body.innerHTML = rows.length
    // data-label нужен для карточного вида таблицы на телефоне.
    ? rows.map(row => `<tr${rowAttrs ? ` ${rowAttrs(row)}` : ''}>${columns.map(col => `<td${col.cls ? ` class="${col.cls}"` : ''} data-label="${escapeHtml(col.label)}">${col.render(row)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${columns.length}" class="muted">${emptyText}</td></tr>`;
}

export function bindSortableHead(head, { getState, setState, rerender }) {
  const activate = th => {
    const key = th.dataset.sortKey;
    setState(toggleSort(getState(), key));
    rerender();
    // Заголовок перерисован — возвращаем фокус, чтобы можно было листать сортировку с клавиатуры.
    head.querySelector(`[data-sort-key="${key}"]`)?.focus();
  };

  head.addEventListener('click', event => {
    const th = event.target.closest('[data-sort-key]');
    if (th) activate(th);
  });

  head.addEventListener('keydown', event => {
    const th = event.target.closest('[data-sort-key]');
    if (!th || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    activate(th);
  });
}

function headerCell(col, state) {
  const extra = col.cls ? [col.cls] : [];
  if (!col.key) return `<th scope="col"${extra.length ? ` class="${extra.join(' ')}"` : ''}>${col.label}</th>`;
  const dir = state.key === col.key ? state.dir : null;
  if (dir) extra.push(`sort-${dir}`);
  const cls = extra.length ? ` class="${extra.join(' ')}"` : '';
  const ariaSort = dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none';
  return `<th scope="col" data-sort-key="${col.key}" tabindex="0" aria-sort="${ariaSort}"${cls}>${col.label}</th>`;
}
