// Панель квартиры поверх страницы (на телефоне — нижняя шторка): шапка со стрелками и ссылкой на сайт застройщика,
// карточки цен, карусель картинок, график, события. Для клетки без данных — та же раскладка с надписью по центру.
//
// Контекст панели задаёт блок, из которого она открыта:
// { kind: 'list' | 'grid', resolve(key), neighbour(key, dir), posText(key), reveal(key), unreveal() }.
// resolve возвращает { flat } или { empty: { title, sub, note } }. В списке ←/→ не работают, в шахматке — во все 4 стороны.

import { slideItems } from './carousel.js';
import { badge, el } from './dom.js';
import { flatEvents } from './flat-events.js';
import { floorText, soldBeforeTexts, statusBadge } from './flats-data.js';
import { hideHint, hintIcon } from './hint.js';
import { areaText, dateShort, fmt1, money, pctText } from './format.js';
import { minMaxText } from './popover.js';
import { chartLegend, hideTip, priceChart } from './price-chart.js';

const DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const STATUS_PILL = { sale: 'sale', booked: 'booked', sold: 'sold-fill' };

export function createDrawer({ model, carousel, popover, onChange }) {
  const $ = id => document.getElementById(id);
  const panel = $('panel');
  const backdrop = $('backdrop');
  const navButtons = { left: $('pLeft'), up: $('pUp'), down: $('pDown'), right: $('pRight') };
  const state = { ctx: null, key: null, lastFocus: null, flat: null };
  $('pCar').hidden = !model.json;

  function setFacts(list) {
    $('pFacts').replaceChildren(...list.map(([label, value, sub]) => {
      const d = el('div');
      // Дополнение (процент скидки) — в той же строке, что и значение: все карточки в одну строку одной высоты.
      const line = el('strong', '', value);
      if (sub) line.append(' ', el('em', '', sub));
      d.append(el('span', '', label), line);
      return d;
    }));
  }

  function renderFlat(flat) {
    panel.classList.remove('is-empty');
    $('pEmptyNote').hidden = true;
    $('pTitle').textContent = `${flat.project}, кв. ${flat.id}`;
    const site = $('pSite');
    site.href = flat.link || '#';
    site.hidden = !flat.link;
    $('pSub').textContent = [
      flat.areaNow ? areaText(flat.areaNow) : '',
      flat.building,
      flat.section ? `секция ${flat.section}` : '',
      floorText(flat, true),
    ].filter(Boolean).join(' · ');
    const badges = $('pBadges');
    badges.replaceChildren();
    // Статус — всегда плашкой; у «Продана» внутри значок «?» с оговоркой, что квартира может вернуться в продажу.
    const status = statusBadge(flat);
    const pill = badge(status.text, STATUS_PILL[status.kind]);
    if (status.hint) pill.append(hintIcon(status.hint, 'Пояснение к статусу «продана»'));
    badges.append(pill);
    if (flat.delivery) badges.append(badge(flat.delivery.replace(/^Срок сдачи:\s*/i, 'сдача ')));
    if (model.json) carousel.setItems(slideItems(flat.info, model.json), 'Нет картинок');
    chartLegend($('pLegend'));
    if (flat.soldBefore) { renderNoHistory(flat); return; }
    panel.classList.remove('no-history');
    const host = $('pChart');
    priceChart(host, flat, model.dates, { interactive: true, height: 160, width: host.clientWidth });
    setFacts([
      [flat.inLatest ? 'Цена со скидкой' : 'Последняя цена', money(flat.price)],
      ['Полная цена', money(flat.fullNow)],
      ['Скидка', flat.disc > 0.05 ? money(flat.discRub) : 'нет', flat.disc > 0.05 ? `${fmt1.format(flat.disc)}%` : ''],
      ['За м²', money(flat.m2)],
      ['С первой выгрузки', pctText(flat.fromFirst, fmt1)],
      ['Мин / макс', minMaxText(flat)],
    ]);
    $('pEventsBlock').hidden = false;
    $('pEvents').replaceChildren(...flatEvents(flat, model.dates).map(e => {
      const li = el('li');
      if (e.tone) li.dataset.tone = e.tone;
      li.append(el('span', 'ev-date', dateShort(e.date)), el('span', e.muted ? 'ev-muted' : '', e.text));
      return li;
    }));
  }

  // Квартира продана до первой выгрузки: истории цен нет — вместо графика строка той же высоты, событий нет.
  function renderNoHistory(flat) {
    const texts = soldBeforeTexts(flat);
    panel.classList.add('no-history');
    $('pChart').replaceChildren(el('p', 'chart-note', texts.chartNote));
    setFacts(texts.facts);
    $('pEventsBlock').hidden = true;
  }

  // Клетка без данных: те же блоки и высоты, без цен, графика и событий.
  function renderEmpty(empty) {
    panel.classList.add('is-empty');
    panel.classList.remove('no-history');
    $('pTitle').textContent = empty.title;
    $('pSite').hidden = true;
    $('pSub').textContent = empty.sub;
    $('pBadges').replaceChildren();
    if (model.json) carousel.setItems([], '');
    const note = $('pEmptyNote');
    note.textContent = empty.note;
    note.hidden = false;
    if (!$('pFacts').childElementCount) setFacts([1, 2, 3, 4, 5, 6].map(() => ['—', '—']));
    if (!$('pChart').childElementCount) $('pChart').append(el('div', 'chart-ph'));
    $('pEventsBlock').hidden = true;
  }

  function updateNav() {
    const { ctx, key } = state;
    const grid = ctx?.kind === 'grid';
    navButtons.left.hidden = navButtons.right.hidden = !grid;
    for (const [dir, button] of Object.entries(navButtons)) button.disabled = !ctx || ctx.neighbour(key, dir) == null;
    navButtons.up.setAttribute('aria-label', grid ? 'Этаж выше' : 'Предыдущая квартира');
    navButtons.down.setAttribute('aria-label', grid ? 'Этаж ниже' : 'Следующая квартира');
    $('pPos').textContent = ctx ? ctx.posText(key) : '';
  }

  function show(key) {
    hideTip();
    hideHint();
    state.key = key;
    const result = state.ctx.resolve(key);
    state.flat = result?.flat ?? null;
    if (state.flat) renderFlat(state.flat);
    else renderEmpty(result?.empty ?? { title: 'Нет данных', sub: '', note: 'Нет данных по этой квартире' });
    panel.scrollTop = 0;
    state.ctx.reveal(key);
    updateNav();
    onChange();
  }

  function open(ctx, key) {
    popover.hide();
    if (panel.hidden) state.lastFocus = document.activeElement;
    if (state.ctx && state.ctx !== ctx) state.ctx.unreveal();
    state.ctx = ctx;
    panel.hidden = false;
    panel.classList.toggle('grid-ctx', ctx.kind === 'grid');
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('drawer-open');
    show(key);
    panel.focus({ preventScroll: true });
  }

  function close() {
    if (panel.hidden) return;
    carousel.closeLightbox();
    carousel.resetPreference();
    panel.hidden = true;
    backdrop.hidden = true;
    document.body.style.overflow = '';
    document.body.classList.remove('drawer-open');
    state.ctx?.unreveal();
    state.ctx = null;
    state.key = null;
    state.flat = null;
    hideTip();
    hideHint();
    onChange();
    if (state.lastFocus?.isConnected) state.lastFocus.focus({ preventScroll: true });
  }

  function step(dir) {
    if (!state.ctx) return;
    const next = state.ctx.neighbour(state.key, dir);
    if (next != null) show(next);
  }

  $('pClose').addEventListener('click', close);
  backdrop.addEventListener('click', close);
  for (const [dir, button] of Object.entries(navButtons)) button.addEventListener('click', () => step(dir));
  document.addEventListener('keydown', e => {
    if (panel.hidden || carousel.isLightboxOpen() || e.defaultPrevented) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    const dir = DIRS[e.key];
    if (!dir) return;
    if ((dir === 'left' || dir === 'right') && state.ctx?.kind !== 'grid') return;
    e.preventDefault();
    step(dir);
  });

  return {
    open,
    show,
    close,
    isOpen: () => !panel.hidden,
    context: () => state.ctx,
    key: () => state.key,
    flatId: () => state.flat?.id ?? null,
  };
}
