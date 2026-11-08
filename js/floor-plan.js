// План этажа с подсвеченной квартирой. SVG берётся с CDN застройщика (он разрешает любые источники),
// очищается от скриптов, ссылок и обработчиков и вставляется в страницу; закрашивается группа d{позиция}.
// Если позиции нет или такой группы нет — показывается план без подсветки; если SVG не загрузился — картинкой.

import { cssVar, el, imgInto } from './dom.js';

const svgCache = new Map();
let svgSeq = 0;

function loadSvg(url) {
  if (!svgCache.has(url)) {
    svgCache.set(url, fetch(url).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    }));
  }
  return svgCache.get(url);
}

function inlineSvg(text, pos) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) return null;
  root.querySelectorAll('script, foreignObject, iframe, object, embed, a').forEach(n => n.remove());
  // Классы и стили файла получают свой префикс, чтобы не пересечься со стилями страницы.
  const prefix = `fp${++svgSeq}-`;
  root.querySelectorAll('*').forEach(n => {
    [...n.attributes].forEach(a => {
      const name = a.name.toLowerCase();
      if (name.startsWith('on') || ((name === 'href' || name === 'xlink:href') && !a.value.startsWith('#'))) n.removeAttribute(a.name);
    });
    if (n.hasAttribute('class')) {
      n.setAttribute('class', n.getAttribute('class').split(/\s+/).filter(Boolean).map(c => prefix + c).join(' '));
    }
  });
  root.querySelectorAll('style').forEach(st => { st.textContent = st.textContent.replace(/\.([A-Za-z_][\w-]*)/g, `.${prefix}$1`); });
  // Слои наведения с сайта застройщика прячутся.
  root.querySelectorAll('[id]').forEach(n => { if (/^(hover|h\d+)$/.test(n.id)) n.setAttribute('display', 'none'); });
  let hit = false;
  if (pos != null) {
    const group = root.querySelector(`[id="d${pos}"]`);
    if (group) {
      const shapes = [...group.querySelectorAll('polygon, path, rect')];
      const white = shapes.filter(sh => /fill:\s*#fff(fff)?\b/i.test(sh.getAttribute('style') || '') || /^#fff(fff)?$/i.test(sh.getAttribute('fill') || ''));
      (white.length ? white : shapes).forEach(sh => {
        sh.style.fill = cssVar('--fp-hl');
        sh.style.stroke = cssVar('--accent');
        sh.style.strokeWidth = '6';
      });
      hit = true;
    }
  }
  root.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  root.removeAttribute('width');
  root.removeAttribute('height');
  root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', 'План этажа');
  return { svg: document.importNode(root, true), hit };
}

export function floorPlan(box, url, pos) {
  if (!url) { box.append(el('span', 'empty', 'нет данных')); return; }
  box.classList.add('loading');
  // Контейнер мог переключиться на другую картинку, пока SVG грузился.
  const token = String(Math.random());
  box.dataset.token = token;
  loadSvg(url).then(text => {
    if (box.dataset.token !== token) return;
    const result = inlineSvg(text, pos);
    if (!result) throw new Error('bad svg');
    box.classList.remove('loading');
    box.append(result.svg);
    box.dataset.hl = result.hit ? '1' : '0';
  }).catch(() => {
    if (box.dataset.token !== token) return;
    box.classList.remove('loading');
    imgInto(box, url, 'План этажа');
  });
}
