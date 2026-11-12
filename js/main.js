// Точка входа: состояние страницы, обработчики и отрисовка блоков.

import { average, filterRows, median, summarizeProjects } from './analytics.js';
import { buildingOptionValue, buildingPairs, buildingsOfProject, groupBuildings, parseBuildingOption, resolveBuilding } from './building-filter.js';
import { CHANGE_TABS, createChangesBlock } from './changes-block.js';
import { buildDataset, compareChoice, latestRows } from './dataset.js';
import { createFlatsBlock } from './flats-block.js';
import { buildFlatsModel, loadFlatsJson } from './flats-data.js';
import { bindDigitGroups } from './dom.js';
import { areaText, digitsOnly, escapeHtml, fmtMoney, groupDigits, money } from './format.js';
import { loadHistory } from './history.js';
import { NO_SORT, sortRows } from './sort.js';
import { bindSortableHead, renderTable } from './table.js';
import { buildUrlSearch, flatFromState, fromFromState, parseUrlState, viewFromState } from './url-state.js';

const FILTER_DEBOUNCE_MS = 200;
// Поля «от/до» по площади и цене: одинаково читаются из адреса и пишутся в него.
const RANGE_KEYS = ['minArea', 'maxArea', 'minPrice', 'maxPrice'];

const els = {
  status: document.getElementById('status'),
  dataDate: document.getElementById('dataDate'),
  dateSelect: document.getElementById('dateSelect'),
  compareDateSelect: document.getElementById('compareDateSelect'),
  projectSelect: document.getElementById('projectSelect'),
  buildingSelect: document.getElementById('buildingSelect'),
  searchInput: document.getElementById('searchInput'),
  minArea: document.getElementById('minArea'),
  maxArea: document.getElementById('maxArea'),
  minPrice: document.getElementById('minPrice'),
  maxPrice: document.getElementById('maxPrice'),
  summaryCards: document.getElementById('summaryCards'),
  projectsHead: document.getElementById('projectsHead'),
  projectsTable: document.getElementById('projectsTable'),
  flatsBody: document.getElementById('flatsBody'),
  flatsHint: document.getElementById('flatsHint'),
  flatsViewButtons: document.querySelectorAll('[data-flats-view]'),
  changesBody: document.getElementById('changesBody'),
  changesHint: document.getElementById('changesHint'),
};
const RANGE_INPUTS = RANGE_KEYS.map(key => els[key]);
// Цена показывается группами разрядов («9 000 000»), а в адрес и фильтры идут одни цифры.
const PRICE_KEYS = ['minPrice', 'maxPrice'];
const rangeValue = key => (PRICE_KEYS.includes(key) ? digitsOnly(els[key].value) : els[key].value);

const PROJECT_COLUMNS = [
  { key: 'project', label: 'Проект', render: r => `<strong>${escapeHtml(r.project)}</strong>` },
  { key: 'count', label: 'Квартир', render: r => fmtMoney.format(r.count) },
  { key: 'avgArea', label: 'Средняя площадь', render: r => areaText(r.avgArea) },
  { key: 'avgPrice', label: 'Средняя цена', render: r => money(r.avgPrice) },
  { key: 'avgM2', label: 'Средняя цена за м²', render: r => money(r.avgM2) },
  { key: 'medianM2', label: 'Медианная цена за м²', render: r => money(r.medianM2) },
];

const state = {
  dataset: { allRows: [], snapshots: [], rowsByDate: new Map() },
  filters: {},
  // Строки последней выгрузки после общих фильтров: сводка, проекты, «Квартиры».
  latestRows: [],
  activeChangeTab: 'changed',
  // Выбрана ли дата сравнения вручную. Если нет — она следует за датой выгрузки.
  compareManual: false,
  projectSort: NO_SORT,
  // Пары (проект, дом) из выгрузок: дом всегда выбирается вместе со своим проектом.
  buildingPairs: [],
  // Блоки «Квартиры» и изменений создаются после загрузки данных.
  flatsBlock: null,
  changesBlock: null,
};

bindEvents();
loadFromSiteFiles();

function bindEvents() {
  // Дата выгрузки и дата сравнения относятся только к блоку изменений.
  els.dateSelect.addEventListener('input', () => {
    fillCompareDateSelector();
    renderChanges(true);
    syncUrl();
  });
  els.compareDateSelect.addEventListener('input', () => {
    state.compareManual = true;
    renderChanges(true);
    syncUrl();
  });
  els.projectSelect.addEventListener('input', () => {
    fillBuildingSelector();
    render();
  });
  // В списке с группами («Все проекты») выбор дома выставляет и его проект.
  els.buildingSelect.addEventListener('input', () => {
    const pair = parseBuildingOption(els.buildingSelect.value);
    if (pair) {
      setSelectValue(els.projectSelect, pair.project);
      fillBuildingSelector();
      setSelectValue(els.buildingSelect, pair.name);
    }
    render();
  });

  // Текстовые поля перерисовывают страницу после паузы в наборе, а не на каждый символ.
  const debouncedRender = debounce(render, FILTER_DEBOUNCE_MS);
  PRICE_KEYS.forEach(key => bindDigitGroups(els[key]));
  RANGE_INPUTS.concat(els.searchInput).forEach(el => el.addEventListener('input', debouncedRender));

  bindSortableHead(els.projectsHead, {
    getState: () => state.projectSort,
    setState: next => { state.projectSort = next; },
    rerender: renderProjects,
  });

  document.querySelectorAll('[data-change-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveChangeTab(btn.dataset.changeTab);
      renderChanges();
      syncUrl();
    });
  });
}

async function loadFromSiteFiles() {
  try {
    // Постоянные данные квартир необязательны: без них нет картинок и шахматки, остальное работает.
    // Пока данные грузятся, в строке статуса остаётся «Загружаю данные…»; после загрузки она скрывается.
    const [saved, flatsJson] = await Promise.all([loadHistory(), loadFlatsJson()]);
    setData(saved.rows, flatsJson, saved.lastTime);
  } catch (error) {
    console.error(error);
    setStatus(`Ошибка загрузки: ${error.message}. Проверь data/history.json.`, true);
  }
}

function setData(rows, flatsJson, lastTime = null) {
  state.dataset = buildDataset(rows);
  // Дата и время последней выгрузки — в шапке и в заголовке вкладки: по ней считаются сводка, проекты и «Квартиры».
  const latest = state.dataset.snapshots.at(-1);
  if (latest) {
    const when = lastTime ? `${latest.label}, ${lastTime}` : latest.label;
    els.dataDate.textContent = `Последняя выгрузка: ${when}`;
    els.dataDate.hidden = false;
    document.title = `Аналитика квартир · ${when}`;
  }
  state.buildingPairs = buildingPairs(state.dataset.allRows);
  const model = buildFlatsModel(state.dataset, flatsJson);
  fillSelectors();
  const urlState = parseUrlState(location.search);
  applyUrlState(urlState);
  state.flatsBlock = createFlatsBlock({
    model,
    els: { body: els.flatsBody, hint: els.flatsHint, viewButtons: els.flatsViewButtons },
    initialView: viewFromState(urlState),
    getFilters: readFilters,
    setGlobalFilters,
    onUrlChange: syncUrl,
  });
  state.changesBlock = createChangesBlock({
    els: { body: els.changesBody, hint: els.changesHint },
    createTable: state.flatsBlock.createTable,
  });
  setStatus('');
  render();
  // Панель из ссылки открывается там же, где была: в блоке изменений (from=changes) или в «Квартирах».
  const flatId = flatFromState(urlState);
  if (flatId && !(fromFromState(urlState) === 'changes' && state.changesBlock.openFlat(flatId))) state.flatsBlock.openFlat(flatId);
}

// Шахматка выставляет проект и дом в глобальных фильтрах: выбор дома на месте шахматки и ссылка на квартиру.
function setGlobalFilters({ project, building }) {
  setSelectValue(els.projectSelect, project);
  fillBuildingSelector();
  setSelectValue(els.buildingSelect, building);
  render();
}

function fillSelectors() {
  const { snapshots, allRows } = state.dataset;
  els.dateSelect.innerHTML = snapshots.map(s => `<option value="${escapeHtml(s.date)}">${escapeHtml(s.label)}</option>`).join('');
  if (snapshots.length) els.dateSelect.value = snapshots.at(-1).date;
  fillCompareDateSelector();

  const projects = [...new Set(allRows.map(r => r.project))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ru'));
  els.projectSelect.innerHTML = `<option value="all">Все проекты</option>` + projects.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
  fillBuildingSelector();
}

function fillCompareDateSelector() {
  const choice = compareChoice(state.dataset.snapshots, els.dateSelect.value, els.compareDateSelect.value, state.compareManual);
  state.compareManual = choice.manual;
  if (!choice.options.length) {
    els.compareDateSelect.innerHTML = '<option value="">Нет выгрузки для сравнения</option>';
    els.compareDateSelect.disabled = true;
    return;
  }
  els.compareDateSelect.disabled = false;
  els.compareDateSelect.innerHTML = choice.options
    .map(s => `<option value="${escapeHtml(s.date)}">${escapeHtml(s.label)}</option>`)
    .join('');
  els.compareDateSelect.value = choice.value;
}

// Проект выбран — только его дома; «Все проекты» — все дома, сгруппированные по проектам,
// значение опции задаёт пару «проект + дом». Дом, которого нет в выбранном проекте, сбрасывается на «Все дома».
function fillBuildingSelector() {
  const project = els.projectSelect.value;
  const current = els.buildingSelect.value;
  const option = (value, label) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
  if (project === 'all') {
    els.buildingSelect.innerHTML = option('all', 'Все дома') + groupBuildings(state.buildingPairs)
      .map(g => `<optgroup label="${escapeHtml(g.project)}">${g.names.map(name => option(buildingOptionValue(g.project, name), name)).join('')}</optgroup>`)
      .join('');
    els.buildingSelect.value = 'all';
    return;
  }
  const names = buildingsOfProject(state.buildingPairs, project);
  els.buildingSelect.innerHTML = option('all', 'Все дома') + names.map(name => option(name, name)).join('');
  els.buildingSelect.value = names.includes(current) ? current : 'all';
}

function setActiveChangeTab(tabKey) {
  state.activeChangeTab = tabKey;
  document.querySelectorAll('[data-change-tab]').forEach(b => {
    const isActive = b.dataset.changeTab === tabKey;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', String(isActive));
  });
}

// Порядок важен: список «Сравнивать с» зависит от даты, список домов — от проекта.
// Значения, которых нет в данных (старая ссылка, опечатка), молча пропускаются.
function applyUrlState(urlState) {
  setSelectValue(els.dateSelect, urlState.date);
  fillCompareDateSelector();
  const defaultCompare = els.compareDateSelect.value;
  setSelectValue(els.compareDateSelect, urlState.compareDate);
  state.compareManual = els.compareDateSelect.value !== defaultCompare;
  // Старая ссылка с одним домом: проект выставляется, если такой дом есть ровно в одном проекте.
  setSelectValue(els.projectSelect, urlState.project);
  const pair = resolveBuilding(state.buildingPairs, els.projectSelect.value, urlState.building);
  setSelectValue(els.projectSelect, pair.project);
  fillBuildingSelector();
  setSelectValue(els.buildingSelect, pair.building);
  els.searchInput.value = urlState.search ?? '';
  for (const key of RANGE_KEYS) {
    const value = urlState[key] ?? '';
    els[key].value = PRICE_KEYS.includes(key) ? groupDigits(value) : value;
  }
  if (urlState.tab in CHANGE_TABS) setActiveChangeTab(urlState.tab);
}

function setSelectValue(select, value) {
  if (value !== undefined && [...select.options].some(option => option.value === value)) {
    select.value = value;
  }
}

function syncUrl() {
  const { snapshots } = state.dataset;
  if (!snapshots.length) return;
  const date = els.dateSelect.value;
  const search = buildUrlSearch({
    date,
    compareDate: els.compareDateSelect.value,
    project: els.projectSelect.value,
    building: els.buildingSelect.value,
    search: els.searchInput.value.trim(),
    ...Object.fromEntries(RANGE_KEYS.map(key => [key, rangeValue(key)])),
    tab: state.activeChangeTab,
    ...(state.flatsBlock?.urlState() ?? {}),
  }, {
    date: snapshots.at(-1).date,
    compareDate: compareChoice(snapshots, date, '', false).value,
    project: 'all',
    building: 'all',
    search: '',
    ...Object.fromEntries(RANGE_KEYS.map(key => [key, ''])),
    tab: 'changed',
    view: 'table',
    flat: null,
    from: null,
  });
  if (search !== location.search) {
    history.replaceState(null, '', `${location.pathname}${search}${location.hash}`);
  }
}

function readFilters() {
  return {
    project: els.projectSelect.value,
    building: els.buildingSelect.value,
    search: els.searchInput.value,
    minArea: Number(els.minArea.value) || 0,
    maxArea: Number(els.maxArea.value) || Infinity,
    minPrice: Number(rangeValue('minPrice')) || 0,
    maxPrice: Number(rangeValue('maxPrice')) || Infinity,
  };
}

function rowsForDate(date) {
  return state.dataset.rowsByDate.get(date) ?? [];
}

function findSnapshot(date) {
  return state.dataset.snapshots.find(s => s.date === date);
}

// Общие фильтры изменились: сводка, проекты и «Квартиры» — по последней выгрузке, изменения — по своим датам.
function render() {
  state.filters = readFilters();
  state.latestRows = filterRows(latestRows(state.dataset), state.filters);
  renderSummary();
  renderProjects();
  renderChanges(true);
  state.flatsBlock?.render({ rows: state.latestRows, filters: state.filters, resetPage: true });
  syncUrl();
}

function renderSummary() {
  const rows = state.latestRows;
  const projectCount = new Set(rows.map(r => r.project)).size;

  els.summaryCards.innerHTML = [
    metric('Квартир', fmtMoney.format(rows.length), 'в последней выгрузке'),
    metric('Проектов', fmtMoney.format(projectCount), 'с учётом фильтров'),
    metric('Средняя цена за м²', money(average(rows, 'price_m2')), 'по цене со скидкой'),
    metric('Медианная цена за м²', money(median(rows, 'price_m2')), 'половина квартир дешевле, половина дороже'),
  ].join('');
}

function metric(title, value, note) {
  return `<article class="card metric"><p>${title}</p><strong>${value}</strong><span>${note}</span></article>`;
}

function renderProjects() {
  renderTable({
    head: els.projectsHead,
    body: els.projectsTable,
    columns: PROJECT_COLUMNS,
    rows: sortRows(summarizeProjects(state.latestRows), state.projectSort),
    sortState: state.projectSort,
    emptyText: 'Нет данных по выбранным фильтрам',
  });
}

// resetPage — даты или фильтры изменились; при смене вкладки страница вкладки сохраняется.
function renderChanges(resetPage = false) {
  const date = els.dateSelect.value;
  const compareDate = els.compareDateSelect.value;
  state.changesBlock?.render({
    current: findSnapshot(date),
    compare: findSnapshot(compareDate),
    currentRows: rowsForDate(date),
    compareRows: rowsForDate(compareDate),
    filters: state.filters,
    tab: state.activeChangeTab,
    latest: date === state.dataset.snapshots.at(-1)?.date,
    resetPage,
  });
}

// Пустой текст скрывает строку статуса, чтобы она не занимала места.
function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.hidden = !text;
  els.status.classList.toggle('error', isError);
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
