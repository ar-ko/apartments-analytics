// Постоянные данные квартир (data/flats.json) и модель квартир для таблицы, панели и шахматки.
// Загрузка — единственная функция с сетью; остальное — чистые функции без DOM.

import { areaText, dateLong, money } from './format.js';

export const FLATS_JSON_URL = 'data/flats.json';

// Оговорка к статусу «продана»: застройщик ставит его и квартирам, которые потом возвращаются в продажу.
export const SOLD_HINT = 'Сейчас не продаётся, но может вернуться в продажу — например, если сделка сорвётся.';

// Файла может не быть (ещё не собран) или он битый — тогда сайт работает без картинок и шахматки.
export async function loadFlatsJson(url = FLATS_JSON_URL) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    return isFlatsJson(data) ? data : null;
  } catch {
    return null;
  }
}

export function isFlatsJson(data) {
  return Boolean(data && typeof data === 'object' && data.flats && typeof data.flats === 'object'
    && data.buildings && typeof data.buildings === 'object');
}

// Бронь собирается на дату list_date. Если последняя выгрузка CSV новее, бронь устарела и не показывается.
export function isBookingFresh(listDate, latestDate) {
  return Boolean(listDate && latestDate && listDate >= latestDate);
}

// Статус квартиры — единственное место, где он вычисляется.
// Последняя выгрузка собирается в день сбора из списка застройщика, поэтому «нет в последней выгрузке» —
// «сейчас не продаётся», что бы ни было в карточке; сюда же квартиры, проданные до начала выгрузок.
// inLatest — есть в последней выгрузке; bk — бронь на list_date; bookingFresh — бронь не старше выгрузки.
export function flatStatus({ inLatest, bk, bookingFresh }) {
  if (!inLatest) return 'sold';
  return bk && bookingFresh ? 'booked' : 'sale';
}

// Плашка статуса для панели и поповера: «Продаётся», «Забронирована», «Продана ДД.ММ» или
// «Продана до ДД.ММ.ГГГГ» (продана до начала выгрузок); у «Продана» — оговорка-подсказка.
export function statusBadge(flat) {
  if (flat.status === 'booked') return { kind: 'booked', text: 'Забронирована', hint: null };
  if (flat.status === 'sale') return { kind: 'sale', text: 'Продаётся', hint: null };
  const when = flat.soldBefore ? ` до ${dateLong(flat.soldBefore)}` : flat.soldDate ? ` ${dateLong(flat.soldDate)}` : '';
  return { kind: 'sold', text: `Продана${when}`, hint: SOLD_HINT };
}

export function buildingKey(project, name) {
  return `${project}\u0001${name}`;
}

// (проект, название дома) → id дома из flats.json.
export function indexBuildings(buildings = {}) {
  const index = new Map();
  for (const [id, building] of Object.entries(buildings)) {
    index.set(buildingKey(building.project, building.name), id);
  }
  return index;
}

// Пары (проект, дом) из строк выгрузки, которых нет в flats.json, с числом квартир.
export function unmatchedBuildings(index, rows) {
  const missing = new Map();
  for (const row of rows) {
    if (!row.building_name) continue;
    const key = buildingKey(row.project, row.building_name);
    if (index.has(key)) continue;
    const item = missing.get(key) ?? { project: row.project, name: row.building_name, count: 0 };
    item.count += 1;
    missing.set(key, item);
  }
  return [...missing.values()].sort((a, b) => a.project.localeCompare(b.project, 'ru') || a.name.localeCompare(b.name, 'ru', { numeric: true }));
}

// История каждой квартиры по выгрузкам: цена со скидкой (eff), полная (full), площадь (area);
// null — квартиры в этой выгрузке не было. row — строка из самой свежей выгрузки с квартирой.
export function buildHistories(snapshots, rows) {
  const indexOf = new Map(snapshots.map((s, i) => [s.date, i]));
  const n = snapshots.length;
  const histories = new Map();
  for (const row of rows) {
    const i = indexOf.get(row.date);
    if (i === undefined) continue;
    let h = histories.get(row.flat_id);
    if (!h) {
      h = { eff: new Array(n).fill(null), full: new Array(n).fill(null), area: new Array(n).fill(null), first: i, last: i, row };
      histories.set(row.flat_id, h);
    }
    h.eff[i] = row.price_with_discount;
    h.full[i] = row.price_without_discount;
    h.area[i] = row.area;
    if (i < h.first) h.first = i;
    if (i >= h.last) { h.last = i; h.row = row; }
  }
  return histories;
}

// Квартира для таблицы, панели и шахматки. info — запись из flats.json или null.
export function makeFlat(id, history, info, context) {
  const { dates, bookingFresh, building } = context;
  const n = dates.length;
  const { eff, full, area, first, last, row } = history;
  const inLatest = last === n - 1;
  let minI = first;
  let maxI = first;
  for (let i = first; i <= last; i++) {
    if (eff[i] == null) continue;
    if (eff[i] < eff[minI]) minI = i;
    if (eff[i] > eff[maxI]) maxI = i;
  }
  const price = eff[last];
  const fullNow = full[last];
  const status = flatStatus({ inLatest, bk: info?.bk, bookingFresh });
  return {
    id,
    project: row.project,
    building: row.building_name,
    section: row.section_number,
    floor: row.floor,
    floors: row.section_floors_count,
    levels: info?.lv === 2 ? 2 : 1,
    link: row.link,
    row,
    eff, full, area, first, last, minI, maxI,
    inLatest,
    status,
    booked: status === 'booked',
    price,
    fullNow,
    areaNow: area[last],
    m2: price / area[last],
    disc: fullNow ? (1 - price / fullNow) * 100 : 0,
    discRub: fullNow - price,
    fromFirst: (price / eff[first] - 1) * 100,
    // Первая выгрузка, в которой квартиры уже не было.
    soldDate: inLatest ? null : dates[last + 1],
    info: info ?? null,
    delivery: building?.delivery ?? '',
  };
}

// Этажи квартиры числом. Двухуровневая квартира записана на этаж первого уровня и занимает этаж выше — «1–2»;
// если выше этажей секции нет (второй уровень на кровле) — просто «9».
export function floorRange(flat) {
  const floor = Number(flat.floor);
  if (!floor) return '';
  const floors = Number(flat.floors);
  return flat.levels === 2 && (!floors || floors > floor) ? `${floor}–${floor + 1}` : String(floor);
}

// Этаж словами: «1–2 этаж из 9», на кровле — «9 этаж из 9, два уровня».
// «из N» (withTotal) — только если этажей в секции не меньше этажа квартиры: в карточках бывает устаревшее число.
export function floorText(flat, withTotal = false) {
  const range = floorRange(flat);
  if (!range) return '';
  const floor = Number(flat.floor);
  const floors = Number(flat.floors);
  const total = withTotal && floors >= floor ? ` из ${floors}` : '';
  const roof = flat.levels === 2 && floors && floors <= floor ? ', два уровня' : '';
  return `${range} этаж${total}${roof}`;
}

// Шаблон ссылки на квартиру по ссылкам из выгрузок: «…/flat/<id>/» → «…/flat/{id}/». Берётся самый частый.
export function linkTemplate(rows) {
  const counts = new Map();
  for (const row of rows) {
    const part = `/${row.flat_id}/`;
    if (!row.link || !row.link.includes(part)) continue;
    const template = row.link.replace(part, '/{id}/');
    counts.set(template, (counts.get(template) ?? 0) + 1);
  }
  let best = '';
  for (const [template, n] of counts) if (!best || n > counts.get(best)) best = template;
  return best;
}

export function flatLink(template, id) {
  return template ? template.replace('{id}', id) : '';
}

// Квартира, проданная до первой выгрузки: истории цен нет, цена и площадь — из карточки (p, sq).
export function makeSoldBeforeFlat(id, info, { json, firstDate, link }) {
  const building = json.buildings[info.b];
  const section = json.sections?.[info.sec];
  const price = info.p ?? null;
  const area = info.sq ?? null;
  return {
    id,
    soldBefore: firstDate,
    project: building?.project ?? '',
    building: building?.name ?? '',
    section: section?.n ?? '',
    floor: info.fl ?? '',
    floors: section?.floors ?? '',
    levels: info.lv === 2 ? 2 : 1,
    link,
    row: null,
    inLatest: false,
    status: flatStatus({ inLatest: false }),
    booked: false,
    price,
    areaNow: area,
    m2: price && area ? price / area : null,
    soldDate: null,
    info,
    delivery: building?.delivery ?? '',
  };
}

// Тексты для квартиры, проданной до первой выгрузки: поповер (статус — плашкой), карточки панели, строка вместо графика.
export function soldBeforeTexts(flat) {
  const date = dateLong(flat.soldBefore);
  const has = v => v != null && v !== 0;
  return {
    popover: [
      has(flat.price) ? `последняя цена ${money(flat.price)}` : 'последняя цена неизвестна',
      ...(has(flat.areaNow) ? [`площадь ${areaText(flat.areaNow)}`] : []),
    ],
    // Те же шесть карточек, что у остальных квартир, чтобы панель не меняла высоту; чего нет — «—».
    // Цена из карточки застройщика — полная (без скидки), поэтому она в «Полной цене».
    facts: [
      ['Цена со скидкой', '—'],
      ['Полная цена', has(flat.price) ? money(flat.price) : '—'],
      ['Скидка', '—'],
      ['За м²', flat.m2 ? money(flat.m2) : '—'],
      ['С первой выгрузки', '—'],
      ['Мин / макс', '—'],
    ],
    chartNote: `Истории цен нет: квартира продана до первой выгрузки (${date})`,
  };
}

// Модель всех квартир: история цен из CSV плюс постоянные данные из flats.json, если он есть.
// Квартиры, которых нет ни в одной выгрузке, есть только во flats.json: они проданы до начала выгрузок
// и попадают в модель для шахматки и панели.
export function buildFlatsModel(dataset, flatsJson) {
  const dates = dataset.snapshots.map(s => s.date);
  const latestDate = dates.at(-1) ?? null;
  const json = isFlatsJson(flatsJson) ? flatsJson : null;
  const bookingFresh = json ? isBookingFresh(json.list_date, latestDate) : false;
  const histories = buildHistories(dataset.snapshots, dataset.allRows);
  const flats = new Map();
  for (const [id, history] of histories) {
    const info = json?.flats[id] ?? null;
    const building = info && json.buildings[info.b];
    flats.set(id, makeFlat(id, history, info, { dates, bookingFresh, building }));
  }
  if (json && dates.length) {
    const template = linkTemplate(dataset.allRows);
    for (const [id, info] of Object.entries(json.flats)) {
      if (flats.has(id)) continue;
      flats.set(id, makeSoldBeforeFlat(id, info, { json, firstDate: dates[0], link: flatLink(template, id) }));
    }
  }
  const buildingIndex = indexBuildings(json?.buildings);
  const latestRows = latestDate ? dataset.rowsByDate.get(latestDate) ?? [] : [];
  return {
    dates,
    latestDate,
    flats,
    json,
    media: json?.media ?? '',
    bookingFresh,
    listDate: json?.list_date ?? null,
    buildingIndex,
    unmatched: json ? unmatchedBuildings(buildingIndex, latestRows) : [],
  };
}

export function mediaUrl(media, path) {
  if (!path) return '';
  return /^https?:/.test(path) ? path : media + path;
}
