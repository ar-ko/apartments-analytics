// Состояние сортировки таблиц: по возрастанию → по убыванию → исходный порядок.

export const NO_SORT = Object.freeze({ key: null, dir: null });

export function toggleSort(currentState, key) {
  if (currentState.key !== key) {
    return { key, dir: 'asc' };
  }

  if (currentState.dir === 'asc') {
    return { key, dir: 'desc' };
  }

  // Третье нажатие сбрасывает сортировку к исходному порядку таблицы.
  return NO_SORT;
}

// Возвращает отсортированную копию, исходный массив не меняется.
export function sortRows(rows, state) {
  if (!state || !state.key || !state.dir) return [...rows];
  const sign = state.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => sign * compareValues(a[state.key], b[state.key]));
}

export function compareValues(av, bv) {
  const aEmpty = av === null || av === undefined || av === '';
  const bEmpty = bv === null || bv === undefined || bv === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const aNum = Number(av);
  const bNum = Number(bv);
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
    return aNum - bNum;
  }

  return String(av).localeCompare(String(bv), 'ru', { numeric: true });
}
