// График цены квартиры: цена со скидкой — основная линия, полная — тусклая.
// В неделях без квартиры обе линии продолжаются пунктиром на последних известных значениях, в подсказке — «Неизвестно».
// В панели график интерактивный: подсказка по наведению и стрелками с клавиатуры.

import { cssVar, el, fillLegend, svgEl, svgText } from './dom.js';
import { dateLong, fmt1, mlnText, money } from './format.js';
import { pointAt, presenceRuns, stepPaths } from './price-series.js';

const DAY = 86400000;
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

// ---- подсказка ----
export function showTip(cx, cy, title, rows) {
  const tip = document.getElementById('tip');
  tip.replaceChildren(el('div', 'tip-title', title));
  for (const r of rows) {
    const row = el('div', 'tip-row');
    if (r.color) {
      const key = el('span', `key-${r.kind || 'line'}`);
      key.style.setProperty('--c', r.color);
      row.append(key);
    }
    row.append(el('strong', '', r.value));
    if (r.label) row.append(el('span', 'tip-label', r.label));
    tip.append(row);
  }
  tip.hidden = false;
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  let x = cx + 14;
  let y = cy + 14;
  if (x + w > innerWidth - 8) x = cx - w - 14;
  if (y + h > innerHeight - 8) y = cy - h - 14;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}

export function hideTip() {
  const tip = document.getElementById('tip');
  if (tip) tip.hidden = true;
}

export function chartLegend(host) {
  fillLegend(host, [
    { kind: 'line', color: cssVar('--s1'), label: 'Цена со скидкой' },
    { kind: 'thin', color: cssVar('--full-pale'), label: 'Полная цена' },
    { kind: 'dash', color: cssVar('--s1'), label: 'Неизвестно' },
  ]);
}

function monthAxis(svg, xt, yBase, plotWidth, tStart, tEnd) {
  const start = new Date(tStart);
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth() + 1;
  const every = plotWidth < 260 ? 2 : 1;
  for (let k = 0; ; k++, month++) {
    if (month > 11) { month = 0; year += 1; }
    const t = Date.UTC(year, month, 1);
    if (t > tEnd) break;
    if (k % every) continue;
    svgEl('line', { x1: xt(t), x2: xt(t), y1: yBase, y2: yBase + 4, class: 'axis' }, svg);
    svgText(svg, xt(t), yBase + 15, MONTHS[month], { class: 'tick', 'text-anchor': 'middle' });
  }
}

function svgClient(svg, px, py) {
  const r = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  return { x: r.left + px * r.width / vb.width, y: r.top + py * r.height / vb.height };
}

function svgLocalX(svg, event) {
  const r = svg.getBoundingClientRect();
  return (event.clientX - r.left) * svg.viewBox.baseVal.width / r.width;
}

// opts: { width, height, interactive }
export function priceChart(host, flat, dates, opts) {
  host.replaceChildren();
  const n = dates.length;
  const W = opts.width || Math.max(260, host.clientWidth);
  const H = opts.height;
  const m = { l: 6, r: 64, t: 8, b: 18 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', role: 'img', 'aria-label': `История цены квартиры ${flat.id}` }, host);
  const ts = dates.map(d => Date.parse(`${d}T00:00:00Z`));
  const tEnd = ts[n - 1] + 3.5 * DAY;
  const xt = t => m.l + (t - ts[0]) / ((tEnd - ts[0]) || 1) * pw;
  const x = i => xt(ts[i]);
  const values = flat.eff.concat(flat.full).filter(v => v != null);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.12 || hi * 0.04;
  const y = v => m.t + ph - (v - (lo - pad)) / ((hi + pad) - (lo - pad)) * ph;
  const runs = presenceRuns(flat.eff);
  const eff = stepPaths(flat.eff, runs, x, y, m.l + pw);
  const full = stepPaths(flat.full, runs, x, y, m.l + pw);
  svgEl('line', { x1: m.l, x2: m.l + pw, y1: m.t + ph, y2: m.t + ph, class: 'axis' }, svg);
  monthAxis(svg, xt, m.t + ph, pw, ts[0], tEnd);
  svgEl('path', { d: full.dashed, class: 'ln-gap full' }, svg);
  svgEl('path', { d: eff.dashed, class: 'ln-gap eff' }, svg);
  svgEl('path', { d: full.solid, class: 'ln-full-pale' }, svg);
  svgEl('path', { d: eff.solid, class: 'ln ln-eff' }, svg);
  const lastKnown = runs.at(-1)[1];
  svgEl('circle', { cx: x(lastKnown), cy: y(flat.eff[lastKnown]), r: 4, class: 'dot-s1' }, svg);
  svgText(svg, m.l + pw + 6, y(hi) + 4, mlnText(hi), { class: 'tick' });
  if (hi !== lo) svgText(svg, m.l + pw + 6, y(lo) + 4, mlnText(lo), { class: 'tick' });
  if (!opts.interactive) return svg;

  const xs = dates.map((_, i) => x(i));
  const cross = svgEl('g', { visibility: 'hidden' }, svg);
  const line = svgEl('line', { y1: m.t, y2: m.t + ph, class: 'xh-line' }, cross);
  const dots = svgEl('g', {}, cross);
  const hit = svgEl('rect', { x: m.l - 6, y: m.t, width: pw + 12, height: ph, class: 'hit' }, svg);
  let current = null;
  const at = (i, cx, cy) => {
    current = i;
    cross.setAttribute('visibility', 'visible');
    line.setAttribute('x1', xs[i]);
    line.setAttribute('x2', xs[i]);
    dots.replaceChildren();
    const p = pointAt(flat.eff, flat.full, flat.area, i);
    if (!p.known) { showTip(cx, cy, dateLong(dates[i]), [{ value: 'Неизвестно' }]); return; }
    svgEl('circle', { cx: xs[i], cy: y(p.eff), r: 4, class: 'dot-s1' }, dots);
    showTip(cx, cy, dateLong(dates[i]), [
      { value: money(p.eff), label: 'цена со скидкой', color: cssVar('--s1') },
      { value: money(p.full), label: 'полная цена', color: cssVar('--full-pale'), kind: 'thin' },
      { value: p.disc > 0.05 ? `${fmt1.format(p.disc)}%` : 'нет', label: 'скидка' },
      ...(p.m2 ? [{ value: money(p.m2), label: 'за м²' }] : []),
    ]);
  };
  const nearest = px => xs.reduce((best, xv, i) => (Math.abs(xv - px) < Math.abs(xs[best] - px) ? i : best), 0);
  const hide = () => { cross.setAttribute('visibility', 'hidden'); hideTip(); };
  hit.addEventListener('pointermove', e => at(nearest(svgLocalX(svg, e)), e.clientX, e.clientY));
  hit.addEventListener('pointerleave', hide);
  svg.setAttribute('tabindex', '0');
  const atKey = i => { const p = svgClient(svg, xs[i], m.t); at(i, p.x, p.y); };
  svg.addEventListener('focus', () => atKey(current ?? n - 1));
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    e.stopPropagation();
    atKey(Math.min(n - 1, Math.max(0, (current ?? n - 1) + (e.key === 'ArrowRight' ? 1 : -1))));
  });
  return svg;
}
