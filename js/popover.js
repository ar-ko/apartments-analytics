// Поповер квартиры по наведению на строку таблицы или клетку шахматки:
// заголовок, статус, слева планировка (в шахматке), справа график цены и пара фактов.
// С клавиатуры поповер показывается при фокусе; на телефоне его нет — сразу открывается панель.

import { badge, el, imgInto } from './dom.js';
import { floorText, soldBeforeTexts, statusBadge } from './flats-data.js';
import { areaText, dateShort, fmt1, mlnNumber, money, pctText } from './format.js';
import { priceChart } from './price-chart.js';

const SHOW_DELAY_MS = 300;
const BADGE_CLASS = { sale: 'sale', booked: 'booked', sold: 'sold' };

export function minMaxText(flat) {
  return `${mlnNumber(flat.eff[flat.minI])} / ${mlnNumber(flat.eff[flat.maxI])} млн ₽`;
}

export function flatSubline(flat) {
  return [
    flat.areaNow ? areaText(flat.areaNow) : '',
    floorText(flat),
    flat.section ? `секция ${flat.section}` : '',
    flat.building,
  ].filter(Boolean).join(' · ');
}

export function createPopover({ dates, isBlocked }) {
  const pop = document.getElementById('pop');
  const state = { timer: null, anchor: null, keyboard: false };
  let lastInput = 'mouse';

  function fill(flat, planUrl, withPlan) {
    pop.replaceChildren();
    pop.classList.toggle('wide', withPlan);
    const head = el('div', 'pop-head');
    // Статус — первой строкой слева, теми же словами, что в панели; пояснение «?» — только в панели.
    const { kind, text } = statusBadge(flat);
    const status = el('div', 'pop-status');
    status.append(badge(text, BADGE_CLASS[kind]));
    head.append(status);
    head.append(el('div', 'pop-title', `${flat.project}, кв. ${flat.id}`), el('div', 'pop-sub', flatSubline(flat)));
    const body = el('div', 'pop-body');
    if (withPlan) {
      const box = el('div', 'pop-plan');
      if (planUrl) imgInto(box, planUrl, 'Планировка');
      else box.append(el('span', 'empty', 'нет данных'));
      body.append(box);
    }
    const right = el('div', 'pop-right');
    // Продана до первой выгрузки: истории цен нет — вместо графика короткий текст.
    if (flat.soldBefore) {
      right.append(...soldBeforeTexts(flat).popover.map(line => el('p', 'pop-line', line)));
      body.append(right);
      pop.append(head, body);
      return;
    }
    const chart = el('div');
    right.append(chart);
    priceChart(chart, flat, dates, { width: withPlan ? 330 : 314, height: 96 });
    const facts = el('div', 'pop-facts');
    [[flat.inLatest ? 'Цена сейчас' : 'Последняя цена', money(flat.price)], [`С первой выгрузки ${dateShort(dates[flat.first])}`, pctText(flat.fromFirst, fmt1)]]
      .forEach(([label, value]) => { const d = el('div'); d.append(el('span', '', label), el('strong', '', value)); facts.append(d); });
    right.append(facts);
    if (!withPlan) right.append(el('div', 'pop-minmax', `мин / макс: ${minMaxText(flat)}`));
    body.append(right);
    pop.append(head, body);
  }

  function place(anchor, px) {
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const left = Math.min(Math.max((px ?? r.left + Math.min(160, r.width / 2)) - 48, 8), innerWidth - w - 8);
    let top;
    if (r.bottom + 6 + h <= innerHeight - 8) top = r.bottom + 6;
    else if (r.top - 6 - h >= 8) top = r.top - 6 - h;
    else top = Math.min(Math.max(r.bottom + 6, 8), innerHeight - h - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }

  function show(anchor, flat, planUrl, withPlan, px, keyboard) {
    if (!anchor.isConnected || isBlocked()) return;
    state.anchor = anchor;
    state.keyboard = keyboard;
    fill(flat, planUrl, withPlan);
    pop.hidden = false;
    place(anchor, px);
  }

  function hide() {
    clearTimeout(state.timer);
    state.timer = null;
    pop.hidden = true;
    state.anchor = null;
  }

  document.addEventListener('pointerdown', e => {
    lastInput = e.pointerType || 'mouse';
    if (!pop.hidden && state.anchor && !state.anchor.contains(e.target)) hide();
  }, true);
  document.addEventListener('keydown', () => { lastInput = 'keyboard'; }, true);
  document.addEventListener('scroll', () => {
    if (state.keyboard && state.anchor && !pop.hidden) place(state.anchor);
    else hide();
  }, { capture: true, passive: true });
  addEventListener('resize', hide);

  // Клетка «нет данных» — без поповера, клик сразу открывает панель.
  function bind(node, flat, { open, planUrl = '', withPlan = false }) {
    node.addEventListener('click', () => { hide(); open(); });
    if (!flat) return;
    node.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(state.timer);
      const px = e.clientX;
      state.timer = setTimeout(() => show(node, flat, planUrl, withPlan, px, false), SHOW_DELAY_MS);
    });
    node.addEventListener('pointerleave', hide);
    node.addEventListener('focus', () => {
      if (lastInput === 'keyboard' && node.matches(':focus-visible')) show(node, flat, planUrl, withPlan, null, true);
    });
    node.addEventListener('blur', hide);
  }

  return { bind, hide };
}
