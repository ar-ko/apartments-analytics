// События квартиры для панели: появление, пропуски, возвращение, изменения площади и цен.
// Чистая функция без DOM; цвет точки задаётся тоном: s1 — цена со скидкой, s2 — обе цены,
// new — вернулась, missing — пропала из выгрузки.

import { areaText, fmt1, fmtNumber, money, pctText, signedText } from './format.js';

export function flatEvents(flat, dates) {
  const { eff, full, area, first } = flat;
  const events = [];
  const push = (i, text, tone = null, muted = false) => events.push({ i, date: dates[i], text, tone, muted, order: events.length });

  push(first, `${first === 0 ? 'в первой выгрузке' : 'появилась в выгрузке'}, ${money(eff[first])}`);
  let lastSeen = first;
  for (let i = first + 1; i < dates.length; i++) {
    const a = eff[i - 1];
    const b = eff[i];
    if (b == null && a != null) { push(i, 'Неизвестно', 'missing'); continue; }
    if (b != null && a == null) {
      const diff = b - eff[lastSeen];
      push(i, diff ? `вернулась, цена ${signedText(diff)} ₽ (${pctText(diff / eff[lastSeen] * 100)})` : 'вернулась, цена та же', 'new');
      lastSeen = i;
      continue;
    }
    if (b == null) continue;
    lastSeen = i;
    if (area[i] !== area[i - 1]) push(i, `площадь ${fmtNumber.format(area[i - 1])} → ${areaText(area[i])}`);
    const dFull = full[i] - full[i - 1];
    const dEff = b - a;
    if (dFull && !dEff) push(i, `полная цена ${signedText(dFull)} ₽, фактическая — нет`, null, true);
    else if (dFull && dEff === dFull) push(i, `цена ${signedText(dEff)} ₽ (${pctText(dEff / a * 100, fmt1)}), полная так же`, 's2');
    else if (dFull && dEff) push(i, `полная ${signedText(dFull)} ₽, со скидкой ${signedText(dEff)} ₽ (${pctText(dEff / a * 100)})`, 's2');
    else if (dEff) push(i, `цена со скидкой ${signedText(dEff)} ₽ (${pctText(dEff / a * 100)}), полная не изменилась`, 's1');
  }
  // Сначала новые; события одной недели — в порядке появления.
  return events.sort((x, y) => y.i - x.i || x.order - y.order);
}
