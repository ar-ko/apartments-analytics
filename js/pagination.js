// Страницы таблицы квартир. Чистые функции без DOM.

// Первый вариант — размер страницы по умолчанию.
export const PAGE_SIZES = [5, 10, 20, 50, 100, 'all'];

export function normalizePageSize(value) {
  if (value === 'all') return 'all';
  const n = Number(value);
  return PAGE_SIZES.includes(n) ? n : PAGE_SIZES[0];
}

// from — индекс первой строки страницы, to — индекс после последней.
export function paginate(total, page, size) {
  if (size === 'all' || total === 0) return { page: 0, pages: 1, from: 0, to: total };
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(0, page), pages - 1);
  return { page: p, pages, from: p * size, to: Math.min(total, (p + 1) * size) };
}

export function pageOfIndex(index, size) {
  return size === 'all' ? 0 : Math.floor(index / size);
}

// Кнопки страниц: первая, последняя и соседние с текущей; null — многоточие.
export function pageList(page, pages) {
  const set = [...new Set([0, pages - 1, page - 1, page, page + 1])].filter(p => p >= 0 && p < pages).sort((a, b) => a - b);
  const out = [];
  let prev = -1;
  for (const p of set) {
    if (p - prev > 1) out.push(null);
    out.push(p);
    prev = p;
  }
  return out;
}
