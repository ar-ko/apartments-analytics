// «Вид из окон»: генплан с домом, красная точка на каждое направление окон и белый градиентный конус к нему.
// Угол — в градусах по часовой от «вверх» по картинке (0 — вверх, 90 — вправо, 180 — вниз, 270 — влево),
// координаты точки — проценты ширины и высоты картинки.

import { svgEl } from './dom.js';

let gradientSeq = 0;

export function windowView(box, view, imageUrl) {
  box.classList.add('loading');
  const W = view.w || 2880;
  const H = view.h || 1630;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': 'Вид из окон: дом на генплане и направления окон' }, box);
  const img = svgEl('image', { href: imageUrl, x: 0, y: 0, width: W, height: H, preserveAspectRatio: 'xMidYMid meet' }, svg);
  img.addEventListener('load', () => box.classList.remove('loading'));
  img.addEventListener('error', () => box.classList.remove('loading'));
  const length = Math.min(W, H) * 0.22;
  const spread = 30 * Math.PI / 180;
  const radius = Math.min(W, H) * 0.011;
  const defs = svgEl('defs', {}, svg);
  const points = (view.a ?? []).map(([angle, px, py]) => ({ t: (angle || 0) * Math.PI / 180, cx: px / 100 * W, cy: py / 100 * H }));
  points.forEach(({ t, cx, cy }) => {
    const id = `wvg${++gradientSeq}`;
    const g = svgEl('radialGradient', { id, gradientUnits: 'userSpaceOnUse', cx, cy, r: length }, defs);
    svgEl('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '0.9' }, g);
    svgEl('stop', { offset: '0.55', 'stop-color': '#fff', 'stop-opacity': '0.45' }, g);
    svgEl('stop', { offset: '1', 'stop-color': '#fff', 'stop-opacity': '0' }, g);
    const p1 = [cx + length * Math.sin(t - spread), cy - length * Math.cos(t - spread)];
    const p2 = [cx + length * Math.sin(t + spread), cy - length * Math.cos(t + spread)];
    const cone = svgEl('path', { d: `M${cx},${cy}L${p1[0]},${p1[1]}A${length},${length} 0 0 1 ${p2[0]},${p2[1]}Z`, class: 'wv-cone' }, svg);
    cone.style.fill = `url(#${id})`;
  });
  points.forEach(({ cx, cy }) => {
    svgEl('circle', { cx, cy, r: radius * 1.75, class: 'wv-ring' }, svg);
    svgEl('circle', { cx, cy, r: radius, class: 'wv-dot' }, svg);
  });
  return svg;
}
