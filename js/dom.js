// Небольшие помощники для DOM и SVG, общие для блока «Квартиры».

import { caretAfterDigits, DIGIT_SEP, digitsOnly, groupDigits } from './format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function svgEl(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (parent) parent.append(node);
  return node;
}

export function svgText(parent, x, y, text, attrs = {}) {
  const node = svgEl('text', { x, y, ...attrs }, parent);
  node.textContent = text;
  return node;
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function badge(text, kind) {
  return el('span', kind ? `badge ${kind}` : 'badge', text);
}

// Легенда: [{ kind: 'line' | 'thin' | 'dash' | 'rect' | 'dashkey', color, label, after? }]; after — узел после подписи.
export function fillLegend(host, items) {
  host.replaceChildren(...items.map(item => {
    const span = el('span');
    const key = el('span', `key-${item.kind}`);
    if (item.color) key.style.setProperty('--c', item.color);
    span.append(key, document.createTextNode(item.label));
    if (item.after) span.append(item.after);
    return span;
  }));
}

// Картинка в контейнер с подложкой «грузится»; при ошибке — подпись вместо картинки.
export function imgInto(box, url, alt, failText = 'нет данных') {
  box.classList.add('loading');
  const img = el('img');
  img.alt = alt;
  img.decoding = 'async';
  img.addEventListener('load', () => box.classList.remove('loading'));
  img.addEventListener('error', () => {
    box.classList.remove('loading');
    img.remove();
    box.append(el('span', 'empty', failText));
  });
  img.src = url;
  box.append(img);
  return img;
}

export const isPhone = () => matchMedia('(max-width: 640px)').matches;

// Поле суммы с группами разрядов: при наборе цифры группируются, курсор остаётся после той же цифры.
// Backspace сразу за пробелом стирает цифру перед ним, Delete перед пробелом — цифру после: сам пробел
// всё равно вернулся бы при группировке.
export function bindDigitGroups(input) {
  const regroup = () => {
    const caret = input.selectionStart ?? input.value.length;
    const before = digitsOnly(input.value.slice(0, caret)).length;
    const text = groupDigits(input.value);
    if (text === input.value) return;
    input.value = text;
    if (document.activeElement === input) {
      const pos = caretAfterDigits(text, before);
      input.setSelectionRange(pos, pos);
    }
  };
  input.addEventListener('beforeinput', e => {
    const { selectionStart: s, selectionEnd: end, value } = input;
    if (s == null || s !== end) return;
    let at = -1;
    if (e.inputType === 'deleteContentBackward' && value[s - 1] === DIGIT_SEP) at = s - 2;
    else if (e.inputType === 'deleteContentForward' && value[s] === DIGIT_SEP) at = s + 1;
    if (at < 0 || at >= value.length) return;
    e.preventDefault();
    input.value = value.slice(0, at) + value.slice(at + 1);
    input.setSelectionRange(Math.min(at, s), Math.min(at, s));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  input.addEventListener('input', regroup);
}
