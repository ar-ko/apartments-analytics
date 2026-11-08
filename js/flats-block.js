// Блок «Квартиры»: переключатель «Таблица | Шахматка», таблица квартир, шахматка дома и общая панель квартиры.
// Фильтры — глобальные фильтры страницы; вид и открытая квартира хранятся в адресе (view, flat).
// Без data/flats.json блок работает как раньше: только таблица и панель с ценами, графиком и событиями.

import { createCarousel } from './carousel.js';
import { createChess } from './chess.js';
import { createDrawer } from './drawer.js';
import { createFlatsTable } from './flats-table.js';
import { createPopover } from './popover.js';

const HINTS = {
  table: 'Таблица по последней выгрузке с фильтрами. Нажатие на квартиру открывает подробности.',
  chess: 'Шахматка дома по последней выгрузке. Поиск, площадь и цена приглушают клетки, которые не подходят.',
};

// els: { body, hint, viewButtons: NodeList кнопок с data-view }.
// getFilters() — текущие глобальные фильтры; setGlobalFilters({ project, building }) — выставить их и перерисовать страницу.
export function createFlatsBlock({ model, els, initialView, getFilters, setGlobalFilters, onUrlChange }) {
  const state = { view: model.json && initialView === 'chess' ? 'chess' : 'table', last: null };
  const carousel = createCarousel();
  let drawer = null;
  const popover = createPopover({ dates: model.dates, isBlocked: () => Boolean(drawer?.isOpen()) });
  drawer = createDrawer({ model, carousel, popover, onChange: () => onUrlChange() });
  const table = createFlatsTable({ model, popover, onOpen: id => drawer.open(table.ctx, id) });
  const chess = createChess({ model, popover, onOpen: key => drawer.open(chess.ctx, key), setGlobalFilters });

  const viewButtons = [...els.viewButtons];
  viewButtons.forEach(b => {
    b.closest('[role="group"]').hidden = !model.json;
    b.addEventListener('click', () => setView(b.dataset.flatsView));
  });

  // rows — строки последней выгрузки после фильтров.
  function render({ rows, filters, resetPage = false }) {
    state.last = { rows, filters };
    viewButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.flatsView === state.view)));
    els.hint.textContent = HINTS[state.view];
    popover.hide();
    if (state.view === 'table') {
      table.render(els.body, { rows, latest: true, resetPage });
      return;
    }
    const before = chess.currentBuildingId();
    const openInChess = drawer.isOpen() && drawer.context() === chess.ctx;
    const shown = chess.render(els.body, { project: filters.project, building: filters.building, filters, openKey: openInChess ? drawer.key() : null });
    // Дом сменился — открытая клетка относилась к другой шахматке.
    if (openInChess && shown !== before) drawer.close();
  }

  function rerender() {
    if (state.last) render(state.last);
  }

  // Открыть квартиру в текущем виде. В шахматке дом выставляется глобальными фильтрами;
  // если у квартиры нет шахматки, вид переключается на таблицу (или панель закрывается, если вид менять нельзя).
  // Квартира, проданная до первой выгрузки, есть только в шахматке — для неё вид переключается на шахматку.
  function openFlat(id, keepView = false) {
    const flat = model.flats.get(id);
    if (!flat) return;
    if (flat.soldBefore && state.view !== 'chess' && !keepView) {
      state.view = 'chess';
      rerender();
    }
    if (state.view === 'chess') {
      const home = chess.buildingOfFlat(id);
      if (home) {
        const filters = getFilters();
        if (filters.project !== home.project || filters.building !== home.name) setGlobalFilters({ project: home.project, building: home.name });
        const key = chess.keyOf(id);
        if (key) { drawer.open(chess.ctx, key); return; }
      }
      if (keepView) { drawer.close(); return; }
      state.view = 'table';
      rerender();
    }
    drawer.open(table.ctx, id);
  }

  function setView(view) {
    if (view === state.view || (view === 'chess' && !model.json)) return;
    const openId = drawer.isOpen() ? drawer.flatId() : null;
    const wasOpen = drawer.isOpen();
    state.view = view;
    rerender();
    if (wasOpen) {
      if (openId) openFlat(openId, true);
      else drawer.close();
    }
    onUrlChange();
  }

  // При смене ширины окна перерисовываются шахматка и график в панели.
  let lastWidth = innerWidth;
  addEventListener('resize', () => {
    if (Math.abs(innerWidth - lastWidth) < 5) return;
    lastWidth = innerWidth;
    if (!drawer.isOpen()) return;
    if (drawer.context() === chess.ctx) rerender();
    drawer.show(drawer.key());
  });

  // Ещё одна таблица квартир с той же панелью и поповером (вкладки блока изменений).
  // source — откуда открыта панель (попадает в адрес как from), у таблицы «Квартир» его нет.
  function createTable({ source = null, ...options }) {
    const t = createFlatsTable({ model, popover, onOpen: id => drawer.open(t.ctx, id), ...options });
    t.ctx.source = source;
    return t;
  }

  return {
    render,
    openFlat,
    createTable,
    urlState: () => ({
      view: state.view,
      flat: drawer.isOpen() ? drawer.flatId() : null,
      from: drawer.isOpen() && drawer.flatId() ? drawer.context()?.source ?? null : null,
    }),
  };
}
