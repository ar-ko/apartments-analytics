// Шахматка дома: одна строка секций с горизонтальной прокруткой, общая липкая колонка этажей, чипы секций,
// легенда «статус (N)». В клетке — цена со скидкой (млн ₽) и площадь; «—» — нет данных; полоса — неизвестный этаж.
// Двухуровневая квартира — клетка в два ряда (столбцы считает chess-model.js).
// Если дом не выбран глобальными фильтрами, на месте шахматки — выбор проекта и дома.
// Прокрутка при открытии, листании и по чипам — одна плавная анимация; секция встаёт с тем же зазором
// от колонки этажей, что и первая секция в исходном положении.

import { matchesFilters } from './analytics.js';
import { chessSections, findSlot, floorsText, maxFloor, neighbour, posText, rowWidth, slotInfo, slotKey, statusCounts } from './chess-model.js';
import { el, fillLegend, isPhone } from './dom.js';
import { buildingKey, mediaUrl, statusBadge } from './flats-data.js';
import { areaText, fmtMoney, fmtNumber, mlnNumber, money } from './format.js';
import { createBoardScroller } from './scroll-anim.js';

const STATUS_CLASS = { sale: 'st-sale', booked: 'st-booked', sold: 'st-sold', nodata: 'st-nodata' };

export function createChess({ model, popover, onOpen, setGlobalFilters }) {
  let host = null;
  let current = { bid: null, building: null, sections: [] };
  const sc = { sec: null, open: false };
  let lastCol = 0;
  const panel = document.getElementById('panel');
  const scroller = createBoardScroller(() => host?.querySelector('.board'));

  // ---- выбор проекта и дома ----
  function chessBuildingId(project, name) {
    const id = model.buildingIndex.get(buildingKey(project, name));
    const b = id && model.json.buildings[id];
    return b?.sections?.some(s => s.rows?.length) ? id : null;
  }

  function choice(title, sub, onPick, note) {
    const b = el('button', 'choice');
    b.type = 'button';
    b.append(el('strong', '', title), el('span', '', sub));
    if (note) b.append(el('em', '', note));
    if (onPick) b.addEventListener('click', onPick); else b.disabled = true;
    return b;
  }

  function renderChooser(project, building) {
    // Выбор — по квартирам из выгрузок: те же проекты и дома, что в глобальных фильтрах.
    const flats = [...model.flats.values()].filter(f => !f.soldBefore);
    const onSale = flats.filter(f => f.inLatest);
    const box = el('div', 'chooser');
    const grid = el('div', 'choice-grid');
    if (project === 'all') {
      box.append(el('h3', '', 'Выберите проект'));
      const projects = [...new Set(flats.map(f => f.project))].sort((a, b) => a.localeCompare(b, 'ru'));
      for (const p of projects) {
        const n = onSale.filter(f => f.project === p).length;
        const has = flats.some(f => f.project === p && chessBuildingId(p, f.building));
        grid.append(choice(p, `в продаже ${fmtMoney.format(n)}`, () => setGlobalFilters({ project: p, building: 'all' }), has ? '' : 'нет шахматки'));
      }
    } else {
      const head = el('div', 'chooser-head');
      const back = el('button', 'chooser-back', '← Все проекты');
      back.type = 'button';
      back.addEventListener('click', () => setGlobalFilters({ project: 'all', building: 'all' }));
      head.append(el('h3', '', `Выберите дом · ${project}`), back);
      box.append(head);
      if (building !== 'all') box.append(el('p', 'chooser-note', `Для дома «${building}» шахматки нет.`));
      const names = [...new Set(flats.filter(f => f.project === project).map(f => f.building).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
      for (const name of names) {
        const n = onSale.filter(f => f.project === project && f.building === name).length;
        const ok = chessBuildingId(project, name);
        grid.append(choice(name, `в продаже ${fmtMoney.format(n)}`, ok ? () => setGlobalFilters({ project, building: name }) : null, ok ? '' : 'нет шахматки'));
      }
    }
    box.append(grid);
    host.append(box);
  }

  // ---- доска ----
  function cellLabel(flat, sec, floors) {
    // Подпись для экранных читалок — тем же названием статуса, что в панели.
    const status = statusBadge(flat);
    const text = status.text[0].toLowerCase() + status.text.slice(1) + (status.hint ? ' (может вернуться в продажу)' : '');
    return `Квартира ${flat.id}, секция ${sec.n}, ${floors} этаж, ${text}${flat.price ? `, ${money(flat.price)}` : ''}${flat.areaNow ? `, ${areaText(flat.areaNow)}` : ''}`;
  }

  function renderBoard(filters) {
    const sections = current.sections;
    const matches = flat => matchesFilters(flat.row, { ...filters, project: 'all', building: 'all' });
    const chips = el('div', 'sec-chips');
    const legend = el('div', 'legend chess-legend');
    const caption = el('p', 'chess-cap', 'В клетке: цена со скидкой (млн ₽) и площадь (м²).');
    host.append(chips, legend, caption);
    const top = maxFloor(sections);
    const wrap = el('div', 'board-wrap');
    const board = el('div', 'board');
    const inner = el('div', 'board-inner');
    board.append(inner);
    const arrowL = el('button', 'edge-btn left', '‹');
    const arrowR = el('button', 'edge-btn right', '›');
    arrowL.type = arrowR.type = 'button';
    arrowL.setAttribute('aria-label', 'Прокрутить влево');
    arrowR.setAttribute('aria-label', 'Прокрутить вправо');
    wrap.append(board, arrowL, arrowR);
    host.append(wrap);
    const floorsCol = el('div', 'floors-col');
    floorsCol.append(el('div', 'sec-title fl-head', 'Этаж'));
    for (let f = top; f >= 1; f--) floorsCol.append(el('div', 'fl', String(f)));
    inner.append(floorsCol);

    sections.forEach((sec, si) => {
      const col = el('div', 'sec-col');
      col.dataset.sec = String(si);
      col.append(el('div', 'sec-title', `Секция ${sec.n}`));
      const byFloor = new Map(sec.rows.map((row, ri) => [row.f, ri]));
      for (let f = top; f >= 1; f--) {
        const line = el('div', 'chess-row');
        col.append(line);
        const ri = byFloor.get(f);
        const row = ri === undefined ? null : sec.rows[ri];
        if (!row || (!row.cells.length && !row.bar && !row.up.length)) { line.classList.add('void'); continue; }
        // Ряд рисуется по столбцам: столбец, занятый двухуровневой квартирой снизу, и пропуск — пустое место.
        const byCol = new Map(row.cells.map((cell, ci) => [cell.col, ci]));
        for (let c = 0; c < rowWidth(row); c++) {
          if (row.bar && c === row.barCol) {
            // Полоса шириной в одну клетку — «—», как у клетки без данных: надпись в неё не помещается.
            const strip = el('button', 'cell cell-wide st-nodata', row.bar > 1 ? 'нет данных' : '—');
            strip.type = 'button';
            strip.style.setProperty('--n', row.bar);
            strip.dataset.slot = slotKey(si, ri, -1);
            strip.setAttribute('aria-label', `Секция ${sec.n}, ${f} этаж: нет данных по этажу`);
            popover.bind(strip, null, { open: () => onOpen(strip.dataset.slot) });
            line.append(strip);
            c += row.bar - 1;
            continue;
          }
          const ci = byCol.get(c);
          if (ci === undefined) { line.append(el('span', 'cell-gap')); continue; }
          const cell = row.cells[ci];
          const b = el('button', `cell ${STATUS_CLASS[cell.status]}${cell.tall ? ' tall' : ''}`);
          b.type = 'button';
          b.dataset.slot = slotKey(si, ri, ci);
          const flat = cell.flat;
          const floors = floorsText(row, cell);
          if (flat) {
            b.dataset.id = flat.id;
            b.append(el('span', 'cp', flat.price ? mlnNumber(flat.price) : '—'), el('span', 'ca', flat.areaNow ? fmtNumber.format(flat.areaNow) : ''));
            if (cell.tall) b.append(el('span', 'clv', '2 уровня'));
            if (flat.inLatest && !matches(flat)) b.classList.add('dim');
            b.setAttribute('aria-label', cellLabel(flat, sec, floors));
          } else {
            b.append(el('span', 'nd', '—'));
            b.setAttribute('aria-label', `Секция ${sec.n}, ${floors} этаж${cell.k != null ? `, позиция ${cell.k}` : ''}: нет данных`);
          }
          popover.bind(b, flat, { open: () => onOpen(b.dataset.slot), planUrl: mediaUrl(model.media, flat?.info?.plan), withPlan: true });
          line.append(b);
        }
      }
      inner.append(col);
    });

    // Тени по краям и стрелки показывают, что ряд продолжается; чипы прокручивают к своей секции.
    const edges = () => {
      const max = board.scrollWidth - board.clientWidth;
      arrowL.hidden = board.scrollLeft <= 2;
      arrowR.hidden = board.scrollLeft >= max - 2;
      let cur = '0';
      inner.querySelectorAll('.sec-col').forEach(c => { if (secLeft(c) <= board.scrollLeft + 2) cur = c.dataset.sec; });
      chips.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sec === cur)));
    };
    const toSection = si => {
      const c = inner.querySelector(`.sec-col[data-sec="${si}"]`);
      if (!c) return;
      sc.sec = si;
      scroller.scrollTo(secLeft(c), null);
    };
    board.addEventListener('scroll', edges, { passive: true });
    arrowL.addEventListener('click', () => scroller.scrollTo(scroller.baseLeft() - board.clientWidth * 0.7, null));
    arrowR.addEventListener('click', () => scroller.scrollTo(scroller.baseLeft() + board.clientWidth * 0.7, null));
    chips.replaceChildren(...sections.map((sec, si) => {
      const b = el('button', '', `Секция ${sec.n}`);
      b.type = 'button';
      b.dataset.sec = String(si);
      b.addEventListener('click', () => toSection(si));
      return b;
    }));
    // Хвост в конце ряда: любая секция, и последняя тоже, может встать к колонке этажей с зазором первой секции.
    const firstCol = inner.querySelector('.sec-col');
    const lastCol = inner.querySelector('.sec-col:last-of-type');
    const gap = parseFloat(getComputedStyle(inner).columnGap) || 0;
    const tail = el('div', 'board-tail');
    inner.append(tail);
    const fitTail = () => { tail.style.width = `${Math.max(0, Math.ceil(board.clientWidth - firstCol.offsetLeft - gap - lastCol.offsetWidth) + 2)}px`; };
    fitTail();
    if (window.ResizeObserver) new ResizeObserver(() => { fitTail(); edges(); }).observe(board);
    requestAnimationFrame(edges);

    const counts = statusCounts(sections);
    fillLegend(legend, [
      { kind: 'rect', color: 'var(--st-sale)', label: `продаётся (${counts.sale})` },
      { kind: 'rect', color: 'var(--st-booked)', label: `забронирована (${counts.booked})` },
      { kind: 'rect', color: 'var(--st-sold)', label: `продана (${counts.sold})` },
      { kind: 'dashkey', label: `нет данных (${counts.nodata})` },
    ]);
    if (!model.bookingFresh && model.listDate) caption.textContent += ' Бронь не показана: она собрана раньше последней выгрузки.';
  }

  // ---- прокрутка к клетке ----
  function secLeft(col) {
    return col.offsetLeft - col.parentElement.querySelector('.sec-col').offsetLeft;
  }

  // Вертикаль — только если цель ушла из видимой области, и на минимальное расстояние.
  function vertical(topDoc, bottomDoc, by) {
    const bottomGap = isPhone() && !panel.hidden ? panel.offsetHeight + 8 : 16;
    if (topDoc < by + 16) return topDoc - 16;
    if (bottomDoc > by + innerHeight - bottomGap) return Math.min(topDoc - 16, bottomDoc - innerHeight + bottomGap);
    return by;
  }

  function revealCell(node) {
    const board = node.closest('.board');
    const col = node.closest('.sec-col');
    if (!board || !col) return;
    const opening = !sc.open;
    sc.open = true;
    const si = col.dataset.sec;
    const sectionChanged = si !== sc.sec;
    sc.sec = si;
    let toLeft = scroller.baseLeft();
    if (isPhone()) {
      // На телефоне секция шире экрана: достаточно, чтобы в видимую часть попала сама клетка.
      const g0 = col.parentElement.querySelector('.sec-col').offsetLeft;
      const left = node.offsetLeft;
      const right = left + node.offsetWidth;
      if (left < toLeft + g0) toLeft = left - g0;
      else if (right > toLeft + board.clientWidth - 4) toLeft = right - board.clientWidth + 4;
    } else if (sectionChanged || opening) {
      toLeft = secLeft(col);
    }
    const by = scroller.baseY();
    let toY;
    const rectOf = n => { const r = n.getBoundingClientRect(); return [r.top + window.scrollY, r.bottom + window.scrollY]; };
    if (opening && !isPhone()) {
      const [top, bottom] = rectOf(col);
      toY = bottom - top <= innerHeight - 32 ? vertical(top, bottom, by) : vertical(...rectOf(node), by);
    } else {
      toY = vertical(...rectOf(node), by);
    }
    scroller.scrollTo(toLeft, toY);
  }

  function mark(key, scroll) {
    host?.querySelectorAll('.is-open').forEach(n => n.classList.remove('is-open'));
    if (key == null || !host) return;
    const node = host.querySelector(`[data-slot="${key}"]`);
    if (!node) return;
    node.classList.add('is-open');
    if (scroll) revealCell(node);
  }

  // ---- контекст панели ----
  const ctx = {
    kind: 'grid',
    resolve(key) {
      const p = slotInfo(current.sections, key);
      if (!p) return null;
      if (p.flat) return { flat: p.flat };
      const b = current.building;
      return {
        empty: {
          title: p.strip ? 'Нет данных по этажу' : 'Нет данных',
          sub: [b?.project, b?.name, `секция ${p.sec.n}`, `${floorsText(p.row, p.cell)} этаж`, !p.strip && p.cell.k != null ? `позиция ${p.cell.k}` : ''].filter(Boolean).join(' · '),
          note: p.strip ? 'Нет данных по этому этажу' : 'Нет данных по этой квартире',
        },
      };
    },
    neighbour: (key, dir) => neighbour(current.sections, key, dir, lastCol),
    posText: key => posText(current.sections, key),
    reveal(key) {
      const p = slotInfo(current.sections, key);
      if (p && p.ci >= 0) lastCol = p.cell.col;
      mark(key, true);
    },
    unreveal() {
      sc.open = false;
      sc.sec = null;
      mark(null);
    },
  };

  // Возвращает id показанного дома или null, если показан выбор.
  function render(target, { project, building, filters, openKey }) {
    // Тот же дом перерисовывается при смене фильтров — прокрутка доски сохраняется.
    const keepLeft = host === target && host.querySelector('.board') ? scroller.baseLeft() : null;
    host = target;
    scroller.cancel();
    host.replaceChildren();
    const bid = model.json && project !== 'all' && building !== 'all' ? chessBuildingId(project, building) : null;
    if (!bid) {
      current = { bid: null, building: null, sections: [] };
      if (model.json) renderChooser(project, building);
      return null;
    }
    const sameBuilding = current.bid === bid;
    if (!sameBuilding) {
      const b = model.json.buildings[bid];
      current = { bid, building: b, sections: chessSections(b, model.flats) };
    }
    renderBoard(filters);
    if (sameBuilding && keepLeft) host.querySelector('.board').scrollLeft = keepLeft;
    if (openKey != null) mark(openKey, false);
    return bid;
  }

  return {
    ctx,
    render,
    currentBuildingId: () => current.bid,
    keyOf: flatId => findSlot(current.sections, flatId),
    // Дом шахматки, в котором есть квартира: { project, name } или null.
    buildingOfFlat(flatId) {
      const info = model.json?.flats[flatId];
      const b = info && model.json.buildings[info.b];
      return b && chessBuildingId(b.project, b.name) ? { project: b.project, name: b.name } : null;
    },
  };
}
