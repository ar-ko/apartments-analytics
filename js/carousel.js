// Карусель картинок квартиры в панели и крупный просмотр.
// Слайды: планировка → план с размерами → план этажа с подсветкой → вид из окон.
// Индекс картинки один на карусель и крупный просмотр; выбранный тип слайда запоминается, пока открыта панель.
// На каждом слайде — компас секции: wr для планировок и плана этажа, wrv для генплана «Вид из окон».

import { el, imgInto, svgEl, svgText } from './dom.js';
import { mediaUrl } from './flats-data.js';
import { floorPlan } from './floor-plan.js';
import { windowView } from './window-view.js';

// Поворот компаса для слайда: угол по часовой стрелке, 0 — север вверху; null — компаса нет.
export function compassAngle(kind, section) {
  const angle = kind === 'wv' ? section?.wrv : section?.wr;
  return typeof angle === 'number' && Number.isFinite(angle) ? angle : null;
}

// Слайды квартиры из записи flats.json. Без записи или без файла — пустой список.
export function slideItems(info, json) {
  if (!info || !json) return [];
  const media = json.media || '';
  const section = json.sections?.[String(info.sec)];
  const items = [];
  if (info.plan) items.push({ kind: 'plan', label: 'Планировка', url: mediaUrl(media, info.plan) });
  if (info.dims) items.push({ kind: 'dims', label: 'План с размерами', url: mediaUrl(media, info.dims) });
  if (info.floor) items.push({ kind: 'floor', label: 'План этажа', url: mediaUrl(media, info.floor), pos: info.pos ?? null });
  const view = info.wvp != null ? json.window_views?.[String(info.wvp)] : null;
  if (view?.img) items.push({ kind: 'wv', label: 'Вид из окон', url: mediaUrl(media, view.img), view });
  return items.map(item => ({ ...item, angle: compassAngle(item.kind, section) }));
}

// Слайд запомненного типа, а если его у квартиры нет — первый. Предпочтение при этом не меняется.
export function pickSlide(items, preferredKind) {
  const i = preferredKind ? items.findIndex(item => item.kind === preferredKind) : -1;
  return i >= 0 ? i : 0;
}

// Компас в духе сайта застройщика, без подложки: тёмно-серые С, В, З и верхние дуги, вместо Ю — солнце;
// жёлтая дуга со стрелкой снизу — путь солнца с востока через юг на запад; в центре стрелка-ромб,
// север серо-синий, юг светлый с контуром. Белый ореол у линий и букв — чтобы знак читался и на светлой
// планировке, и на тёмном генплане. Знак повёрнут на угол секции по часовой стрелке, буквы и солнце
// повёрнуты обратно и стоят ровно. Координаты — в квадрате 100×100 с центром (50, 50).
const COMPASS = { ink: '#544c44', sun: '#E2B33C', north: '#767E8B', south: '#E9E9E9', southEdge: '#8A919C', halo: '#fff', ring: 41 };

function polar(bearing, r) {
  const t = bearing * Math.PI / 180;
  return [50 + r * Math.sin(t), 50 - r * Math.cos(t)];
}

function arc(from, to, r) {
  const [x1, y1] = polar(from, r);
  const [x2, y2] = polar(to, r);
  return `M${x1.toFixed(2)},${y1.toFixed(2)}A${r},${r} 0 0 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
}

function compass(angle, large) {
  const box = el('div', large ? 'compass lg' : 'compass');
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', `Компас: север повёрнут на ${angle}° по часовой стрелке`);
  const svg = svgEl('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', class: 'compass-svg' }, box);
  const dial = svgEl('g', { class: 'compass-dial', transform: `rotate(${angle} 50 50)` }, svg);
  const { ring } = COMPASS;
  const round = { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  const halo = svgEl('g', { stroke: COMPASS.halo, 'stroke-opacity': 0.9, 'stroke-width': 5.6, ...round }, dial);
  const paint = svgEl('g', { 'stroke-width': 2.6, ...round }, dial);
  const stroke = (d, color) => {
    svgEl('path', { d }, halo);
    svgEl('path', { d, stroke: color }, paint);
  };
  stroke(arc(290, 340, ring) + arc(20, 70, ring), COMPASS.ink);
  stroke(arc(110, 162, ring) + arc(198, 252, ring), COMPASS.sun);
  // Наконечник у З: по ходу движения по часовой стрелке.
  const [tx, ty] = polar(254, ring);
  const head = (deg, len) => { const t = (254 + deg) * Math.PI / 180; return [tx - len * Math.cos(t), ty - len * Math.sin(t)]; };
  const [ax, ay] = head(-40, 7);
  const [bx, by] = head(40, 7);
  stroke(`M${ax.toFixed(2)},${ay.toFixed(2)}L${tx.toFixed(2)},${ty.toFixed(2)}L${bx.toFixed(2)},${by.toFixed(2)}`, COMPASS.sun);
  // Ромб: ореол по контуру, северная половина закрашена, южная — светлая с тонким контуром.
  svgEl('path', { d: 'M50,33L55.5,50L50,67L44.5,50Z', fill: COMPASS.halo, stroke: COMPASS.halo, 'stroke-width': 3, 'stroke-linejoin': 'round' }, dial);
  svgEl('path', { d: 'M44.5,50L55.5,50L50,67Z', fill: COMPASS.south, stroke: COMPASS.southEdge, 'stroke-width': 0.9, 'stroke-linejoin': 'round' }, dial);
  svgEl('path', { d: 'M50,33L55.5,50L44.5,50Z', fill: COMPASS.north, stroke: COMPASS.north, 'stroke-width': 0.9, 'stroke-linejoin': 'round' }, dial);
  const upright = (x, y) => `rotate(${-angle} ${x.toFixed(2)} ${y.toFixed(2)})`;
  for (const [side, letter, bearing] of [['n', 'С', 0], ['e', 'В', 90], ['w', 'З', 270]]) {
    const [x, y] = polar(bearing, ring);
    svgText(dial, x.toFixed(2), y.toFixed(2), letter, {
      class: `compass-l ${side}`, fill: COMPASS.ink, stroke: COMPASS.halo, 'stroke-width': 4, 'stroke-linejoin': 'round', 'paint-order': 'stroke',
      'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 17, 'font-weight': 700, transform: upright(x, y),
    });
  }
  // Солнце на месте Ю: кружок и восемь лучей с ореолом, тоже стоит ровно. Чуть ближе к центру, чем кольцо,
  // чтобы нижние лучи не обрезались краем рисунка (viewBox 0–100).
  const [sx, sy] = polar(180, ring - 3);
  const sunParts = g => {
    svgEl('circle', { cx: sx.toFixed(2), cy: sy.toFixed(2), r: 3.4 }, g);
    for (let ray = 0; ray < 360; ray += 45) {
      const t = ray * Math.PI / 180;
      const p = r => [sx + r * Math.sin(t), sy - r * Math.cos(t)];
      const [x1, y1] = p(5.9);
      const [x2, y2] = p(9);
      svgEl('line', { x1: x1.toFixed(2), y1: y1.toFixed(2), x2: x2.toFixed(2), y2: y2.toFixed(2) }, g);
    }
  };
  const sunAttrs = { class: 'compass-sun', transform: upright(sx, sy), fill: 'none', 'stroke-linecap': 'round' };
  sunParts(svgEl('g', { ...sunAttrs, stroke: COMPASS.halo, 'stroke-opacity': 0.9, 'stroke-width': 4.4 }, dial));
  sunParts(svgEl('g', { ...sunAttrs, stroke: COMPASS.sun, 'stroke-width': 2 }, dial));
  return box;
}

function drawItem(box, item, large = false) {
  if (item.kind === 'floor') floorPlan(box, item.url, item.pos);
  else if (item.kind === 'wv') windowView(box, item.view, item.url);
  else imgInto(box, item.url, item.label);
  if (item.angle != null) box.append(compass(item.angle, large));
}

export function createCarousel() {
  const $ = id => document.getElementById(id);
  const root = $('pCar');
  const main = $('pCarMain');
  const count = $('pCarCount');
  const thumbs = $('pCarThumbs');
  const prev = $('pCarPrev');
  const next = $('pCarNext');
  const lightbox = $('lightbox');
  const lbInner = $('lbInner');
  const lbCount = $('lbCount');
  const lbPrev = $('lbPrev');
  const lbNext = $('lbNext');

  const state = { items: [], i: 0, preferred: null, keyboardFocus: false, lightboxOpen: false };
  let lastInput = 'mouse';

  function showMain() {
    const item = state.items[state.i];
    main.replaceChildren();
    main.className = 'car-main';
    delete main.dataset.hl;
    if (!item || item.empty) {
      main.classList.add('static');
      main.append(el('span', 'empty', item?.text ?? ''));
    } else {
      drawItem(main, item);
    }
    const many = state.items.length > 1;
    count.textContent = many ? `${state.i + 1} / ${state.items.length}` : '';
    prev.hidden = next.hidden = !many;
    [...thumbs.children].forEach((b, k) => {
      b.setAttribute('aria-current', String(k === state.i));
      if (k !== state.i) return;
      const left = b.offsetLeft;
      const right = left + b.offsetWidth;
      if (left < thumbs.scrollLeft) thumbs.scrollLeft = left;
      else if (right > thumbs.scrollLeft + thumbs.clientWidth) thumbs.scrollLeft = right - thumbs.clientWidth;
    });
  }

  function showLightbox() {
    lbInner.replaceChildren();
    const item = state.items[state.i];
    if (item && !item.empty) drawItem(lbInner, item, true);
    const many = state.items.length > 1;
    lbPrev.hidden = lbNext.hidden = !many;
    lbCount.textContent = many ? `${state.i + 1} / ${state.items.length}` : '';
  }

  // Выбор пользователя: стрелки карусели, миниатюры, клавиши в карусели или в крупном просмотре.
  function go(i) {
    const n = state.items.length;
    if (!n) return;
    state.i = ((i % n) + n) % n;
    const item = state.items[state.i];
    if (item?.kind) state.preferred = item.kind;
    showMain();
    if (state.lightboxOpen) showLightbox();
  }

  // Новая квартира: слайд выбирается по запомненному типу, это не считается выбором.
  function setItems(items, emptyText = '') {
    state.items = items.length ? items : [{ empty: true, label: '', text: emptyText }];
    const isEmpty = !items.length;
    root.classList.toggle('is-none', isEmpty);
    thumbs.replaceChildren(...state.items.map((item, k) => {
      const b = el('button', 'car-thumb');
      b.type = 'button';
      b.setAttribute('aria-label', item.label);
      if (item.empty) b.append(el('span', 'empty', '—'));
      else {
        const img = el('img');
        img.alt = '';
        img.loading = 'lazy';
        img.src = item.url;
        img.addEventListener('error', () => img.replaceWith(el('span', 'empty', '—')));
        b.append(img);
      }
      b.addEventListener('click', () => go(k));
      return b;
    }));
    thumbs.hidden = state.items.length < 2;
    state.i = pickSlide(state.items, state.preferred);
    showMain();
  }

  function openLightbox() {
    const item = state.items[state.i];
    if (!item || item.empty) return;
    state.lightboxOpen = true;
    lightbox.hidden = false;
    showLightbox();
  }

  function closeLightbox() {
    state.lightboxOpen = false;
    lightbox.hidden = true;
    lbInner.replaceChildren();
  }

  main.addEventListener('click', openLightbox);
  prev.addEventListener('click', () => go(state.i - 1));
  next.addEventListener('click', () => go(state.i + 1));
  lbPrev.addEventListener('click', e => { e.stopPropagation(); go(state.i - 1); });
  lbNext.addEventListener('click', e => { e.stopPropagation(); go(state.i + 1); });
  lightbox.addEventListener('click', closeLightbox);

  // Откуда пришёл фокус: ←/→ листают карусель, только если в неё перешли с клавиатуры (Tab).
  // После клика мышью по миниатюре стрелки по-прежнему переключают квартиры.
  document.addEventListener('pointerdown', () => { lastInput = 'mouse'; }, true);
  document.addEventListener('keydown', () => { lastInput = 'keyboard'; }, true);
  root.addEventListener('focusin', () => { state.keyboardFocus = lastInput === 'keyboard'; });
  root.addEventListener('keydown', e => {
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || !state.keyboardFocus) return;
    e.preventDefault();
    e.stopPropagation();
    go(state.i + (e.key === 'ArrowRight' ? 1 : -1));
  });
  // Крупный просмотр обрабатывает клавиши первым (фаза capture): фокус может стоять на карусели, кнопке,
  // графике или body, и их собственные обработчики стрелок не должны получить клавишу.
  document.addEventListener('keydown', e => {
    if (lightbox.hidden) return;
    const k = e.key;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape'].includes(k)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (k === 'Escape') closeLightbox();
    else if (k === 'ArrowLeft' || k === 'ArrowRight') go(state.i + (k === 'ArrowRight' ? 1 : -1));
  }, true);

  return {
    setItems,
    go,
    closeLightbox,
    isLightboxOpen: () => state.lightboxOpen,
    resetPreference: () => { state.preferred = null; },
    current: () => state.items[state.i] ?? null,
  };
}
