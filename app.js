const DATA_DIR = 'data/';

const els = {
  status: document.getElementById('status'),
  dateSelect: document.getElementById('dateSelect'),
  projectSelect: document.getElementById('projectSelect'),
  buildingSelect: document.getElementById('buildingSelect'),
  searchInput: document.getElementById('searchInput'),
  minArea: document.getElementById('minArea'),
  maxPrice: document.getElementById('maxPrice'),
  summaryCards: document.getElementById('summaryCards'),
  projectsTable: document.getElementById('projectsTable'),
  flatsTable: document.getElementById('flatsTable'),
  changesHead: document.getElementById('changesHead'),
  changesTable: document.getElementById('changesTable'),
  changesHint: document.getElementById('changesHint'),
  localFiles: document.getElementById('localFiles'),
  resetBtn: document.getElementById('resetBtn'),
  exportBtn: document.getElementById('exportBtn'),
};

let allRows = [];
let snapshots = [];
let latestByFlatId = new Map();
let flatSortState = { key: null, dir: null };
let projectSortState = { key: null, dir: null };
const changeSortStates = {
  changed: { key: null, dir: null },
  new: { key: null, dir: null },
  gone: { key: null, dir: null },
};
let activeChangeTab = 'changed';

const fmtMoney = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const fmtNumber = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

init();

async function init() {
  bindEvents();
  await loadFromSiteFiles();
}

function bindEvents() {
  [els.dateSelect, els.projectSelect, els.buildingSelect, els.searchInput, els.minArea, els.maxPrice].forEach(el => {
    el.addEventListener('input', render);
  });

  els.projectSelect.addEventListener('input', () => {
    fillBuildingSelector();
    render();
  });

  document.querySelectorAll('[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      flatSortState = toggleSort(flatSortState, key);
      renderFlats();
    });
  });

  document.querySelectorAll('[data-project-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.projectSort;
      projectSortState = toggleSort(projectSortState, key);
      renderProjects();
    });
  });

  els.changesHead.addEventListener('click', event => {
    const th = event.target.closest('[data-change-sort]');
    if (!th) return;
    const key = th.dataset.changeSort;
    changeSortStates[activeChangeTab] = toggleSort(changeSortStates[activeChangeTab], key);
    renderChanges();
  });

  document.querySelectorAll('[data-change-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeChangeTab = btn.dataset.changeTab;
      document.querySelectorAll('[data-change-tab]').forEach(b => b.classList.toggle('active', b === btn));
      renderChanges();
    });
  });

  if (els.localFiles) {
    els.localFiles.addEventListener('change', async event => {
      const files = [...event.target.files].filter(file => file.name.toLowerCase().endsWith('.csv'));
      if (!files.length) return;
      setStatus('Читаю выбранные CSV…');
      const loaded = await Promise.all(files.map(readLocalCsv));
      setData(loaded.flat());
    });
  }

  if (els.resetBtn) {
    els.resetBtn.addEventListener('click', loadFromSiteFiles);
  }

  els.exportBtn.addEventListener('click', exportFilteredCsv);
}

async function loadFromSiteFiles() {
  try {
    setStatus('Загружаю data/files.json…');
    const response = await fetch(`${DATA_DIR}files.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Не найден data/files.json');
    const files = await response.json();
    const csvFiles = files.filter(name => name.toLowerCase().endsWith('.csv'));
    if (!csvFiles.length) throw new Error('В data/files.json нет CSV-файлов');
    setStatus(`Загружаю CSV: ${csvFiles.join(', ')}`);
    const loaded = await Promise.all(csvFiles.map(loadSiteCsv));
    setData(loaded.flat());
  } catch (error) {
    console.error(error);
    setStatus(`Ошибка загрузки: ${error.message}. Проверь data/files.json и CSV в папке data.`, true);
  }
}

async function loadSiteCsv(filename) {
  const response = await fetch(`${DATA_DIR}${filename}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Не найден файл ${filename}`);
  const text = await response.text();
  return parseCsv(text, filename);
}

function readLocalCsv(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(parseCsv(reader.result, file.name));
    reader.onerror = reject;
    reader.readAsText(file, 'utf-8');
  });
}

function parseCsv(text, filename) {
  const parsed = Papa.parse(text, {
    header: true,
    delimiter: ';',
    skipEmptyLines: true,
    transformHeader: h => h.trim().replace(/^"|"$/g, '')
  });

  if (parsed.errors.length) console.warn('CSV warnings', filename, parsed.errors);
  const snapshotDate = parseDateFromFilename(filename);

  return parsed.data.map(row => normalizeRow(row, filename, snapshotDate)).filter(Boolean);
}

function normalizeRow(row, filename, snapshotDate) {
  const project = clean(row.project || row['название проекта']);
  const flatId = clean(row.flat_id || row['id квартиры'] || row.id);
  const area = parseRuNumber(row.area || row['площадь']);
  const priceWithDiscount = parseRuNumber(row.price_with_discount || row['цена со скидкой']);
  const priceWithoutDiscount = parseRuNumber(row.price_without_discount || row['цена без скидки']);
  const link = clean(row.link || row['ссылка на квартиру']);

  if (!project || !flatId || !area || !priceWithDiscount) return null;

  return {
    project,
    link,
    area,
    price_with_discount: priceWithDiscount,
    price_without_discount: priceWithoutDiscount || priceWithDiscount,
    flat_id: String(flatId),
    floor: parseOptionalNumber(row.floor || row['этаж']),
    building_name: clean(row.building_name || row['дом']),
    section_number: clean(row.section_number || row['секция']),
    section_floors_count: parseOptionalNumber(row.section_floors_count || row['этажей в секции']),
    source_file: filename,
    date: snapshotDate.iso,
    date_label: snapshotDate.label,
    date_sort: snapshotDate.sort,
    price_m2: priceWithDiscount / area,
    discount: Math.max(0, (priceWithoutDiscount || priceWithDiscount) - priceWithDiscount),
  };
}

function parseDateFromFilename(filename) {
  const base = filename.replace(/\.csv$/i, '');
  const match = base.match(/(\d{1,2})[.\-_](\d{1,2})[.\-_](\d{4})/);
  if (!match) {
    return { iso: base, label: base, sort: base };
  }
  const [, d, m, y] = match;
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return { iso, label: `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`, sort: iso };
}

function parseRuNumber(value) {
  if (value === null || value === undefined) return 0;
  return Number(String(value).replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  const parsed = parseRuNumber(value);
  return Number.isFinite(parsed) ? parsed : '';
}

function clean(value) {
  return String(value ?? '').trim().replace(/^"|"$/g, '');
}

function setData(rows) {
  allRows = rows.sort((a, b) => a.date_sort.localeCompare(b.date_sort));
  snapshots = [...new Map(allRows.map(r => [r.date, { date: r.date, label: r.date_label, sort: r.date_sort }])).values()]
    .sort((a, b) => a.sort.localeCompare(b.sort));

  latestByFlatId = buildLatestByFlatId(allRows);
  allRows = allRows.map(row => enrichWithLatestStaticData(row));

  fillSelectors();
  setStatus(`Загружено: ${allRows.length} строк, ${snapshots.length} выгрузок. Постоянные данные берутся из самой свежей строки по ID квартиры.`);
  render();
}

function buildLatestByFlatId(rows) {
  const map = new Map();
  const sorted = [...rows].sort((a, b) => b.date_sort.localeCompare(a.date_sort));
  for (const row of sorted) {
    if (!map.has(row.flat_id)) {
      map.set(row.flat_id, row);
    }
  }
  return map;
}

function enrichWithLatestStaticData(row) {
  const latest = latestByFlatId.get(row.flat_id) || row;
  return {
    ...row,
    project: latest.project || row.project,
    link: latest.link || row.link,
    area: latest.area || row.area,
    floor: latest.floor || row.floor,
    building_name: latest.building_name || row.building_name,
    section_number: latest.section_number || row.section_number,
    section_floors_count: latest.section_floors_count || row.section_floors_count,
    price_m2: row.price_with_discount / (latest.area || row.area),
  };
}

function fillSelectors() {
  els.dateSelect.innerHTML = snapshots.map(s => `<option value="${s.date}">${s.label}</option>`).join('');
  if (snapshots.length) els.dateSelect.value = snapshots.at(-1).date;

  const projects = [...new Set(allRows.map(r => r.project))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ru'));
  els.projectSelect.innerHTML = `<option value="all">Все проекты</option>` + projects.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
  fillBuildingSelector();
}

function fillBuildingSelector() {
  const selectedProject = els.projectSelect.value;
  const buildings = [...new Set(allRows
    .filter(r => selectedProject === 'all' || r.project === selectedProject)
    .map(r => r.building_name)
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));

  const current = els.buildingSelect.value;
  els.buildingSelect.innerHTML = `<option value="all">Все дома</option>` + buildings.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
  if (buildings.includes(current)) els.buildingSelect.value = current;
}

function render() {
  renderSummary();
  renderProjects();
  renderChanges();
  renderFlats();
}

function getSelectedRows(date = els.dateSelect.value) {
  const project = els.projectSelect.value;
  const building = els.buildingSelect.value;
  const search = els.searchInput.value.trim().toLowerCase();
  const minArea = Number(els.minArea.value) || 0;
  const maxPrice = Number(els.maxPrice.value) || Infinity;

  return allRows.filter(row => {
    const matchesDate = row.date === date;
    const matchesProject = project === 'all' || row.project === project;
    const matchesBuilding = building === 'all' || row.building_name === building;
    const matchesSearch = !search || [row.project, row.flat_id, row.link, row.building_name, row.section_number].some(v => String(v).toLowerCase().includes(search));
    return matchesDate && matchesProject && matchesBuilding && matchesSearch && row.area >= minArea && row.price_with_discount <= maxPrice;
  });
}

function renderSummary() {
  const rows = getSelectedRows();
  const projectCount = new Set(rows.map(r => r.project)).size;
  const avgM2 = average(rows, 'price_m2');
  const medianM2 = median(rows, 'price_m2');
  const avgDiscount = average(rows, 'discount');
  const totalValue = rows.reduce((sum, r) => sum + r.price_with_discount, 0);

  els.summaryCards.innerHTML = [
    metric('Квартир', fmtMoney.format(rows.length), 'в выбранной выгрузке'),
    metric('Проектов', fmtMoney.format(projectCount), 'с учётом фильтров'),
    metric('Средняя цена за м²', `${fmtMoney.format(avgM2)} ₽`, 'по цене со скидкой'),
    metric('Медианная цена за м²', `${fmtMoney.format(medianM2)} ₽`, 'половина квартир дешевле, половина дороже'),
    metric('Средняя скидка', `${fmtMoney.format(avgDiscount)} ₽`, `суммарно ${fmtMoney.format(totalValue)} ₽`),
  ].join('');
}

function metric(title, value, note) {
  return `<article class="card metric"><p>${title}</p><strong>${value}</strong><span>${note}</span></article>`;
}

function renderProjects() {
  const rows = getSelectedRows();
  const grouped = groupBy(rows, r => r.project);
  const summary = [...grouped.entries()].map(([project, items]) => ({
    project,
    count: items.length,
    avgArea: average(items, 'area'),
    avgPrice: average(items, 'price_with_discount'),
    avgM2: average(items, 'price_m2'),
    medianM2: median(items, 'price_m2'),
    avgDiscount: average(items, 'discount'),
  })).sort((a, b) => compareBySortState(a, b, projectSortState));

  els.projectsTable.innerHTML = summary.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.project)}</strong></td>
      <td>${fmtMoney.format(item.count)}</td>
      <td>${fmtNumber.format(item.avgArea)} м²</td>
      <td>${fmtMoney.format(item.avgPrice)} ₽</td>
      <td>${fmtMoney.format(item.avgM2)} ₽</td>
      <td>${fmtMoney.format(item.medianM2)} ₽</td>
      <td>${fmtMoney.format(item.avgDiscount)} ₽</td>
    </tr>
  `).join('') || emptyRow(7, 'Нет данных по выбранным фильтрам');

  updateSortIndicators('[data-project-sort]', projectSortState, 'projectSort');
}

function renderChanges() {
  const idx = snapshots.findIndex(s => s.date === els.dateSelect.value);
  if (idx <= 0) {
    els.changesHint.textContent = 'Для сравнения нужен минимум второй CSV и выбранная не первая дата.';
    els.changesHead.innerHTML = '';
    els.changesTable.innerHTML = emptyRow(8, 'Добавь следующую выгрузку, и здесь появятся изменения цен, новые и исчезнувшие квартиры.');
    return;
  }

  const currentDate = snapshots[idx].date;
  const prevDate = snapshots[idx - 1].date;
  const project = els.projectSelect.value;
  const building = els.buildingSelect.value;
  const rowMatches = r => (project === 'all' || r.project === project) && (building === 'all' || r.building_name === building);
  const current = allRows.filter(r => r.date === currentDate && rowMatches(r));
  const prev = allRows.filter(r => r.date === prevDate && rowMatches(r));
  const curMap = new Map(current.map(r => [r.flat_id, r]));
  const prevMap = new Map(prev.map(r => [r.flat_id, r]));

  const changed = current
    .filter(r => prevMap.has(r.flat_id) && r.price_with_discount !== prevMap.get(r.flat_id).price_with_discount)
    .map(r => ({
      ...r,
      old_price: prevMap.get(r.flat_id).price_with_discount,
      delta: r.price_with_discount - prevMap.get(r.flat_id).price_with_discount,
    }))
    .sort((a, b) => compareBySortState(a, b, changeSortStates.changed));
  const fresh = current
    .filter(r => !prevMap.has(r.flat_id))
    .sort((a, b) => compareBySortState(a, b, changeSortStates.new));
  const gone = prev
    .filter(r => !curMap.has(r.flat_id))
    .sort((a, b) => compareBySortState(a, b, changeSortStates.gone));

  els.changesHint.textContent = `Сравнение ${snapshots[idx].label} с ${snapshots[idx - 1].label}: ${changed.length} изменили цену, ${fresh.length} новых, ${gone.length} исчезли.`;

  if (activeChangeTab === 'changed') {
    els.changesHead.innerHTML = `<tr>${changeTh('project', 'Проект')}${changeTh('flat_id', 'ID')}${changeTh('building_name', 'Дом')}${changeTh('floor', 'Этаж')}${changeTh('old_price', 'Было')}${changeTh('price_with_discount', 'Стало')}${changeTh('delta', 'Изменение')}${plainTh('Ссылка')}</tr>`;
    els.changesTable.innerHTML = changed.map(r => `
      <tr>
        <td>${escapeHtml(r.project)}</td><td>${r.flat_id}</td><td>${escapeHtml(r.building_name) || '—'}</td><td>${displayValue(r.floor)}</td>
        <td>${fmtMoney.format(r.old_price)} ₽</td><td>${fmtMoney.format(r.price_with_discount)} ₽</td>
        <td>${deltaBadge(r.delta)}</td><td>${linkCell(r.link)}</td>
      </tr>`).join('') || emptyRow(8, 'Цены не менялись');
  } else if (activeChangeTab === 'new') {
    els.changesHead.innerHTML = `<tr>${changeTh('project', 'Проект')}${changeTh('flat_id', 'ID')}${changeTh('area', 'Площадь')}${changeTh('building_name', 'Дом')}${changeTh('floor', 'Этаж')}${changeTh('price_with_discount', 'Цена')}${changeTh('price_m2', 'Цена за м²')}${plainTh('Ссылка')}</tr>`;
    els.changesTable.innerHTML = fresh.map(flatChangeRow).join('') || emptyRow(8, 'Новых квартир нет');
  } else {
    els.changesHead.innerHTML = `<tr>${changeTh('project', 'Проект')}${changeTh('flat_id', 'ID')}${changeTh('area', 'Площадь')}${changeTh('building_name', 'Дом')}${changeTh('floor', 'Этаж')}${changeTh('price_with_discount', 'Последняя цена')}${changeTh('price_m2', 'Цена за м²')}${plainTh('Ссылка')}</tr>`;
    els.changesTable.innerHTML = gone.map(flatChangeRow).join('') || emptyRow(8, 'Исчезнувших квартир нет');
  }

  updateSortIndicators('[data-change-sort]', changeSortStates[activeChangeTab], 'changeSort');
}

function flatChangeRow(r) {
  return `<tr><td>${escapeHtml(r.project)}</td><td>${r.flat_id}</td><td>${fmtNumber.format(r.area)} м²</td><td>${escapeHtml(r.building_name) || '—'}</td><td>${displayValue(r.floor)}</td><td>${fmtMoney.format(r.price_with_discount)} ₽</td><td>${fmtMoney.format(r.price_m2)} ₽</td><td>${linkCell(r.link)}</td></tr>`;
}

function renderFlats() {
  const rows = getSelectedRows().sort((a, b) => compareBySortState(a, b, flatSortState));

  els.flatsTable.innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.project)}</td>
      <td>${r.flat_id}</td>
      <td>${fmtNumber.format(r.area)} м²</td>
      <td>${displayValue(r.floor)}</td>
      <td>${escapeHtml(r.building_name) || '—'}</td>
      <td>${displayValue(r.section_number)}</td>
      <td>${displayValue(r.section_floors_count)}</td>
      <td>${fmtMoney.format(r.price_with_discount)} ₽</td>
      <td>${fmtMoney.format(r.price_without_discount)} ₽</td>
      <td>${fmtMoney.format(r.price_m2)} ₽</td>
      <td>${fmtMoney.format(r.discount)} ₽</td>
      <td>${linkCell(r.link)}</td>
    </tr>
  `).join('') || emptyRow(12, 'Нет квартир по выбранным фильтрам');

  updateSortIndicators('[data-sort]', flatSortState, 'sort');
}

function toggleSort(currentState, key) {
  if (currentState.key !== key) {
    return { key, dir: 'asc' };
  }

  if (currentState.dir === 'asc') {
    return { key, dir: 'desc' };
  }

  // Третье нажатие сбрасывает сортировку к исходному порядку таблицы.
  return { key: null, dir: null };
}

function compareBySortState(a, b, state) {
  if (!state || !state.key || !state.dir) return 0;

  const result = compareValues(a[state.key], b[state.key]);
  return state.dir === 'asc' ? result : -result;
}

function compareValues(av, bv) {
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

function updateSortIndicators(selector, state, datasetKey) {
  document.querySelectorAll(selector).forEach(th => {
    const isActive = th.dataset[datasetKey] === state.key;
    th.classList.toggle('sort-asc', isActive && state.dir === 'asc');
    th.classList.toggle('sort-desc', isActive && state.dir === 'desc');
    th.setAttribute('aria-sort', isActive ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none');
  });
}

function changeTh(key, label) {
  return `<th data-change-sort="${key}">${label}</th>`;
}

function plainTh(label) {
  return `<th>${label}</th>`;
}

function exportFilteredCsv() {
  const rows = getSelectedRows();
  const header = [
    'project',
    'link',
    'area',
    'price_with_discount',
    'price_without_discount',
    'flat_id',
    'floor',
    'building_name',
    'section_number',
    'section_floors_count'
  ];
  const body = rows.map(r => header.map(key => csvCell(key === 'area' ? String(r[key]).replace('.', ',') : r[key])).join(';'));
  const csv = [header.join(';'), ...body].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `filtered_${els.dateSelect.value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const str = value === null || value === undefined ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

function average(rows, key) {
  if (!rows.length) return 0;
  return rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) / rows.length;
}

function median(rows, key) {
  const values = rows
    .map(row => Number(row[key]))
    .filter(value => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  if (!values.length) return 0;

  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle];
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function linkCell(link) {
  return link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener">Открыть</a>` : '<span class="muted">—</span>';
}

function deltaBadge(delta) {
  const cls = delta < 0 ? 'good' : 'bad';
  const sign = delta > 0 ? '+' : '';
  const text = `${sign}${fmtMoney.format(delta)} ₽`;
  return `<span class="badge ${cls}">${text}</span>`;
}

function displayValue(value) {
  return value === null || value === undefined || value === '' ? '—' : escapeHtml(value);
}

function emptyRow(cols, text) {
  return `<tr><td colspan="${cols}" class="muted">${text}</td></tr>`;
}

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle('error', isError);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}
