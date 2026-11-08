// Таблица квартир: миниатюра планировки с лентой «бронь», дом с ID второй строкой, числа справа,
// ссылка на сайт застройщика, сортировка по заголовкам, страницы «Показывать по: 5 / 10 / 20 / 50 / 100 / все».
// Строка открывает панель квартиры; ↑/↓ в панели идут по строкам в порядке таблицы, через страницы.
// Одна и та же таблица служит блоку «Квартиры» и вкладкам блока изменений — отличаются только колонки (kind).
// На телефоне вместо таблицы — карточки: планировка слева, цена крупно, вторая цена, параметры, где находится;
// сортировка — списком и кнопкой направления. Состояние (сортировка, страница) у таблицы и карточек общее.

import { el } from './dom.js';
import { floorRange, floorText, mediaUrl } from './flats-data.js';
import { deltaBadge, escapeHtml, fmt1, fmtMoney, fmtNumber, mlnText, money } from './format.js';
import { normalizePageSize, PAGE_SIZES, pageList, pageOfIndex, paginate } from './pagination.js';
import { NO_SORT, sortRows } from './sort.js';
import { bindSortableHead, renderTable } from './table.js';

// Колонки по видам таблицы: «Квартиры» и вкладки блока изменений.
export const COLUMN_SETS = {
  flats: ['plan', 'project', 'building', 'section', 'floor', 'area', 'eff', 'full', 'm2', 'discount', 'site'],
  changed: ['plan', 'project', 'building', 'section', 'floor', 'area', 'old', 'now', 'delta', 'site'],
  new: ['plan', 'project', 'building', 'section', 'floor', 'area', 'eff', 'm2', 'discount', 'site'],
  gone: ['plan', 'project', 'building', 'section', 'floor', 'area', 'last', 'm2', 'site'],
};

// kind — набор колонок; idPrefix — уникальная приставка id элементов таблицы на странице.
export function createFlatsTable({ model, popover, onOpen, kind = 'flats', idPrefix = 'flats', emptyText = 'Нет квартир по выбранным фильтрам' }) {
  const state = { rows: [], ids: [], page: 0, size: PAGE_SIZES[0], sort: NO_SORT, latest: true, openId: null };
  let host = null;

  const wrap = el('div', 'table-wrap flats-wrap');
  const table = el('table', 'ftable');
  const thead = el('thead');
  const tbody = el('tbody');
  table.append(thead, tbody);
  wrap.append(table);
  const sortBar = el('div', 'msort');
  const cards = el('ul', 'fcards');
  const pager = el('div', 'pager');
  const phone = matchMedia('(max-width: 640px)');
  // Повернули телефон или сузили окно — перерисовать в другом виде (таблица ↔ карточки).
  phone.addEventListener('change', () => { if (host?.isConnected) draw(); });

  // Этаж строки в виде, который понимают floorRange и floorText: двухуровневость — из flats.json.
  const rowFloor = r => ({ floor: r.floor, floors: r.section_floors_count, levels: model.flats.get(r.flat_id)?.levels });

  const planCell = r => {
    const flat = model.flats.get(r.flat_id);
    const url = mediaUrl(model.media, flat?.info?.plan);
    const ribbon = state.latest && flat?.booked ? '<span class="ribbon">бронь</span>' : '';
    const img = url
      ? `<img alt="Планировка кв. ${escapeHtml(r.flat_id)}" loading="lazy" src="${escapeHtml(url)}">`
      : '<span class="ph">нет данных</span>';
    return `<div class="thumbbox">${img}${ribbon}</div>`;
  };

  const ALL_COLUMNS = {
    plan: { key: 'flat_id', label: 'План', cls: 'col-plan', render: planCell },
    project: { key: 'project', label: 'Проект', cls: 'txt', render: r => escapeHtml(r.project) },
    building: { key: 'building_name', label: 'Дом · ID', cls: 'txt', render: r => `<span class="stack">${escapeHtml(r.building_name) || '—'}<span class="sub2">ID ${escapeHtml(r.flat_id)}</span></span>` },
    section: { key: 'section_number', label: 'Секция', cls: 'mid', render: r => escapeHtml(r.section_number) || '—' },
    floor: { key: 'floor', label: 'Этаж', cls: 'mid', render: r => escapeHtml(floorRange(rowFloor(r))) || '—' },
    area: { key: 'area', label: 'Площадь', cls: 'num', render: r => `${fmtNumber.format(r.area)} м²` },
    eff: { key: 'price_with_discount', label: 'Цена со скидкой', cls: 'num', render: r => money(r.price_with_discount) },
    full: { key: 'price_without_discount', label: 'Полная цена', cls: 'num', render: r => money(r.price_without_discount) },
    old: { key: 'old_price', label: 'Было', cls: 'num', render: r => money(r.old_price) },
    now: { key: 'price_with_discount', label: 'Стало', cls: 'num', render: r => money(r.price_with_discount) },
    delta: { key: 'delta', label: 'Изменение', cls: 'num', render: r => deltaBadge(r.delta) },
    last: { key: 'price_with_discount', label: 'Последняя цена', cls: 'num', render: r => money(r.price_with_discount) },
    m2: { key: 'price_m2', label: '₽/м²', cls: 'num', render: r => fmtMoney.format(r.price_m2) },
    discount: { key: 'discount_pct', label: 'Скидка', cls: 'num', render: r => (r.discount_pct > 0.05 ? `<span class="stack">${fmt1.format(r.discount_pct)}%<span class="sub2">${mlnText(r.discount)}</span></span>` : '—') },
    site: { label: 'Сайт', cls: 'site', render: r => (r.link ? `<a class="site-link" href="${escapeHtml(r.link)}" target="_blank" rel="noopener" aria-label="Квартира ${escapeHtml(r.flat_id)} на сайте застройщика">Открыть ↗</a>` : '—') },
  };
  // Без flats.json картинок нет — колонки «План» тоже.
  const columns = COLUMN_SETS[kind].filter(name => name !== 'plan' || model.json).map(name => ALL_COLUMNS[name]);

  bindSortableHead(thead, {
    getState: () => state.sort,
    setState: next => { state.sort = next; state.page = 0; },
    rerender: () => draw(),
  });

  // Картинка не загрузилась — подпись вместо неё (событие error не всплывает, ловим на погружении).
  tbody.addEventListener('error', e => {
    if (e.target.tagName === 'IMG') e.target.replaceWith(Object.assign(el('span', 'ph'), { textContent: 'нет данных' }));
  }, true);

  // ---- карточки на телефоне ----
  const pill = (text, cls) => `<span class="badge ${cls}">${text}</span>`;

  function cardHtml(r) {
    const id = escapeHtml(r.flat_id);
    const m2 = `${fmtMoney.format(r.price_m2)} ₽/м²`;
    let badge = '';
    let second = m2;
    if (kind === 'changed') {
      const pct = r.old_price ? (r.delta / r.old_price) * 100 : 0;
      badge = pill(`${pct > 0 ? '+' : '−'}${fmt1.format(Math.abs(pct))}%`, r.delta < 0 ? 'good' : 'bad');
      second = `было ${mlnText(r.old_price)} · ${m2}`;
    } else if (kind === 'gone') {
      second = `последняя цена · ${m2}`;
    } else if (r.discount_pct > 0.05) {
      badge = pill(`−${fmt1.format(r.discount_pct)}%`, 'disc');
      second = `<s>${mlnText(r.price_without_discount)}</s> · ${m2}`;
    }
    const floor = floorText(rowFloor(r), true);
    const params = [`${fmtNumber.format(r.area)} м²`, floor, r.section_number ? `секция ${escapeHtml(r.section_number)}` : ''].filter(Boolean).join(' · ');
    const place = [r.project, r.building_name, `ID ${r.flat_id}`].filter(Boolean).map(escapeHtml).join(' · ');
    const site = r.link
      ? `<a class="site-link fc-site" href="${escapeHtml(r.link)}" target="_blank" rel="noopener" aria-label="Квартира ${id} на сайте застройщика">↗</a>`
      : '';
    return `<li class="fcard flat-row" tabindex="0" data-id="${id}">${model.json ? planCell(r) : ''}<div class="fc-body">`
      + `<div class="fc-top"><span class="fc-price">${mlnText(r.price_with_discount)} ₽</span>${badge}${site}</div>`
      + `<div class="fc-second">${second}</div><div class="fc-params">${params}</div><div class="fc-place">${place}</div></div></li>`;
  }

  function drawCards(rows) {
    cards.innerHTML = rows.length ? rows.map(cardHtml).join('') : `<li class="fcard-empty">${escapeHtml(emptyText)}</li>`;
    cards.querySelectorAll('li[data-id]').forEach(li => {
      const id = li.dataset.id;
      popover.bind(li, model.flats.get(id), { open: () => onOpen(id) });
      li.querySelector('a.site-link')?.addEventListener('click', e => e.stopPropagation());
      li.addEventListener('keydown', e => {
        if (e.target === li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(id); }
      });
    });
  }

  // Сортировка на телефоне: заголовков нет — список колонок и кнопка направления.
  function drawSortBar() {
    const label = el('label', 'msort-sel');
    const select = el('select');
    select.id = `${idPrefix}MobileSort`;
    label.htmlFor = select.id;
    select.append(new Option('без сортировки', ''));
    for (const c of columns) if (c.key && c.cls !== 'col-plan') select.append(new Option(c.label, c.key));
    select.value = state.sort.key ?? '';
    select.addEventListener('change', () => {
      state.sort = select.value ? { key: select.value, dir: 'asc' } : NO_SORT;
      state.page = 0;
      draw();
    });
    label.append(el('span', '', 'Сортировка'), select);
    const desc = state.sort.dir === 'desc';
    const dir = el('button', 'msort-dir', desc ? '↓' : '↑');
    dir.type = 'button';
    dir.disabled = !state.sort.key;
    dir.setAttribute('aria-label', desc ? 'По убыванию, сменить на по возрастанию' : 'По возрастанию, сменить на по убыванию');
    dir.addEventListener('click', () => {
      state.sort = { key: state.sort.key, dir: desc ? 'asc' : 'desc' };
      state.page = 0;
      draw();
    });
    sortBar.replaceChildren(label, dir);
  }

  function bindRows() {
    tbody.querySelectorAll('tr[data-id]').forEach(tr => {
      const id = tr.dataset.id;
      const flat = model.flats.get(id);
      popover.bind(tr, flat, { open: () => onOpen(id) });
      tr.querySelector('a.site-link')?.addEventListener('click', e => e.stopPropagation());
      tr.querySelector('a.site-link')?.addEventListener('keydown', e => e.stopPropagation());
      tr.addEventListener('keydown', e => {
        if (e.target !== tr || !document.getElementById('panel').hidden) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); popover.hide(); onOpen(id); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const sib = e.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling;
          if (sib?.dataset.id) { e.preventDefault(); sib.focus(); }
        }
      });
    });
  }

  function drawPager(view, total) {
    pager.replaceChildren();
    const left = el('div', 'pager-l');
    const label = el('label', 'pager-label', 'Показывать по:');
    const select = el('select', 'pagesize');
    select.id = `${idPrefix}PageSize`;
    label.htmlFor = select.id;
    for (const size of PAGE_SIZES) select.append(new Option(size === 'all' ? 'все' : String(size), String(size)));
    select.value = String(state.size);
    select.addEventListener('change', () => { state.size = normalizePageSize(select.value); state.page = 0; draw(); });
    const range = total ? `${fmtMoney.format(view.from + 1)}–${fmtMoney.format(view.to)} из ${fmtMoney.format(total)}` : '0 квартир';
    left.append(label, select, el('span', 'pager-range', range));
    pager.append(left);
    if (view.pages < 2) return;
    const pages = el('div', 'pages');
    const button = (text, page, isCurrent) => {
      const b = el('button', '', text);
      b.type = 'button';
      if (isCurrent) b.setAttribute('aria-current', 'page');
      b.disabled = page < 0 || page >= view.pages;
      b.addEventListener('click', () => { state.page = page; draw(); });
      return b;
    };
    pages.append(button('‹', view.page - 1));
    for (const p of pageList(view.page, view.pages)) pages.append(p === null ? el('span', 'muted', '…') : button(String(p + 1), p, p === view.page));
    pages.append(button('›', view.page + 1));
    pager.append(pages);
  }

  function draw() {
    const sorted = sortRows(state.rows, state.sort);
    state.ids = sorted.map(r => r.flat_id);
    const view = paginate(sorted.length, state.page, state.size);
    state.page = view.page;
    const pageRows = sorted.slice(view.from, view.to);
    const onPhone = phone.matches;
    wrap.hidden = onPhone;
    sortBar.hidden = cards.hidden = !onPhone;
    if (onPhone) {
      tbody.replaceChildren();
      drawSortBar();
      drawCards(pageRows);
    } else {
      cards.replaceChildren();
      renderTable({
        head: thead,
        body: tbody,
        columns,
        rows: pageRows,
        sortState: state.sort,
        emptyText,
        rowAttrs: r => `class="flat-row" tabindex="0" data-id="${escapeHtml(r.flat_id)}"`,
      });
      bindRows();
    }
    drawPager(view, sorted.length);
    if (state.openId != null) mark(state.openId, false);
  }

  function mark(id, scroll) {
    const scope = phone.matches ? cards : tbody;
    scope.querySelectorAll('.is-open').forEach(node => node.classList.remove('is-open'));
    if (id == null) return;
    const node = scope.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!node) return;
    node.classList.add('is-open');
    if (scroll) requestAnimationFrame(() => node.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  }

  // rows — строки после глобальных фильтров; latest — строки последней выгрузки (для ленты «бронь»);
  // resetPage — фильтры или выгрузка изменились, таблица начинается с первой страницы.
  function render(target, { rows, latest, resetPage }) {
    host = target;
    state.rows = rows.map(r => ({ ...r, discount_pct: r.price_without_discount ? (r.discount / r.price_without_discount) * 100 : 0 }));
    state.latest = latest;
    if (resetPage) state.page = 0;
    host.replaceChildren(sortBar, wrap, cards, pager);
    draw();
  }

  const ctx = {
    kind: 'list',
    resolve: id => {
      const flat = model.flats.get(id);
      return flat ? { flat } : null;
    },
    neighbour(id, dir) {
      const i = state.ids.indexOf(id);
      if (i < 0) return null;
      if (dir === 'up') return state.ids[i - 1] ?? null;
      if (dir === 'down') return state.ids[i + 1] ?? null;
      return null;
    },
    posText(id) {
      const i = state.ids.indexOf(id);
      return i >= 0 ? `${i + 1} из ${state.ids.length}` : '';
    },
    reveal(id) {
      state.openId = id;
      const i = state.ids.indexOf(id);
      if (host?.isConnected && i >= 0 && pageOfIndex(i, state.size) !== state.page) {
        state.page = pageOfIndex(i, state.size);
        draw();
      }
      mark(id, true);
    },
    unreveal() {
      state.openId = null;
      mark(null);
    },
  };

  return {
    ctx,
    render,
    // Есть ли квартира среди строк таблицы (все страницы) и открыть её панель — для ссылки с from.
    has: id => state.ids.includes(id),
    open: id => onOpen(id),
  };
}
