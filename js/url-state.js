// Фильтры в адресе страницы: ссылка открывает тот же вид, её можно сохранить или переслать.

// Поле состояния → имя параметра в адресе.
const PARAMS = {
  date: 'date',
  compareDate: 'cmp',
  project: 'project',
  building: 'building',
  search: 'q',
  minArea: 'area_from',
  maxArea: 'area_to',
  minPrice: 'price_from',
  maxPrice: 'price_to',
  tab: 'tab',
  view: 'view',
  flat: 'flat',
  from: 'from',
};

export const VIEWS = ['table', 'chess'];
// Откуда открыта панель квартиры, если не из блока «Квартиры» (его контекст задаёт view).
export const PANEL_SOURCES = ['changes'];

export function parseUrlState(search) {
  const params = new URLSearchParams(search);
  const state = {};
  for (const [key, param] of Object.entries(PARAMS)) {
    const value = params.get(param);
    if (value !== null && value !== '') state[key] = value;
  }
  return state;
}

// Значения по умолчанию в адрес не попадают, поэтому ссылка без даты
// всегда открывает самую свежую выгрузку.
export function buildUrlSearch(state, defaults) {
  const params = new URLSearchParams();
  for (const [key, param] of Object.entries(PARAMS)) {
    const value = state[key];
    if (value === undefined || value === null || value === '' || value === defaults[key]) continue;
    params.set(param, value);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

// Вид блока «Квартиры»: неизвестное значение — таблица по умолчанию.
export function viewFromState(state) {
  return VIEWS.includes(state.view) ? state.view : VIEWS[0];
}

// ID открытой квартиры — только цифры; что-то другое в адресе игнорируется.
export function flatFromState(state) {
  return /^\d+$/.test(state.flat ?? '') ? state.flat : null;
}

// Источник панели: неизвестное значение — панель открывается как обычно, из блока «Квартиры».
export function fromFromState(state) {
  return PANEL_SOURCES.includes(state.from) ? state.from : null;
}
