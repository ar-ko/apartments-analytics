// Значок «?» в кружке с подсказкой. Мышь — подсказка по наведению, клавиатура — по фокусу,
// тач — по тапу (повторный тап или тап в другом месте скрывает). Значок — кнопка: клик по нему
// никуда не всплывает и не открывает и не закрывает панель.
// Для экранных читалок текст подсказки привязан к значку через aria-describedby.

import { el } from './dom.js';

let tip = null;
let current = null;
let lastPointer = 'mouse';
let seq = 0;

function ensureTip() {
  if (tip) return tip;
  tip = el('div', 'hint-tip');
  tip.id = 'hintTip';
  tip.hidden = true;
  tip.setAttribute('aria-hidden', 'true');
  document.body.append(tip);
  document.addEventListener('pointerdown', e => {
    lastPointer = e.pointerType || 'mouse';
    if (current && !current.contains(e.target)) hideHint();
  }, true);
  document.addEventListener('keydown', e => {
    lastPointer = 'keyboard';
    // Esc сначала прячет подсказку, панель при этом остаётся открытой.
    if (e.key === 'Escape' && current) { hideHint(); e.preventDefault(); }
  }, true);
  document.addEventListener('scroll', () => { if (current) place(current); }, { capture: true, passive: true });
  addEventListener('resize', hideHint);
  return tip;
}

function place(anchor) {
  if (!anchor.isConnected) { hideHint(); return; }
  const r = anchor.getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const left = Math.min(Math.max(r.left + r.width / 2 - w / 2, 8), innerWidth - w - 8);
  const top = r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function showHint(anchor) {
  ensureTip();
  current = anchor;
  tip.textContent = anchor.dataset.hint;
  tip.hidden = false;
  place(anchor);
}

export function hideHint() {
  if (tip) tip.hidden = true;
  current = null;
}

// label — что поясняется (имя кнопки), text — подсказка.
export function hintIcon(text, label) {
  ensureTip();
  const wrap = el('span', 'hint');
  const button = el('button', 'hint-i', '?');
  button.type = 'button';
  button.dataset.hint = text;
  button.setAttribute('aria-label', label);
  const description = el('span', 'sr-only', text);
  description.id = `hint-${++seq}`;
  button.setAttribute('aria-describedby', description.id);
  button.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') showHint(button); });
  button.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch' && current === button) hideHint(); });
  button.addEventListener('focus', () => { if (lastPointer === 'keyboard') showHint(button); });
  button.addEventListener('blur', () => { if (current === button) hideHint(); });
  button.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    // Тап и Enter/пробел переключают подсказку; клик мышью оставляет её видимой, пока курсор над значком.
    if (lastPointer === 'mouse') { showHint(button); return; }
    if (current === button) hideHint(); else showHint(button);
  });
  wrap.append(button, description);
  return wrap;
}
