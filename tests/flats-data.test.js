import { buildDataset } from '../js/dataset.js';
import { buildFlatsModel, buildHistories, flatLink, flatStatus, floorRange, floorText, indexBuildings, isBookingFresh, linkTemplate, soldBeforeTexts, statusBadge, unmatchedBuildings } from '../js/flats-data.js';
import { flat } from './fixtures.js';
import { assert, test } from './runner.js';

const FILES = ['2026.10.17.csv', '2026.10.24.csv', '2026.10.31.csv', '2026.11.07.csv'];

test('три статуса: продаётся, забронирована, продана', () => {
  assert.equal(flatStatus({ inLatest: true, bk: 0, bookingFresh: true }), 'sale');
  assert.equal(flatStatus({ inLatest: true, bk: 1, bookingFresh: true }), 'booked');
  assert.equal(flatStatus({ inLatest: false, bk: 0, bookingFresh: true }), 'sold', 'нет в последней выгрузке — продана, что бы ни было в карточке');
  assert.equal(flatStatus({ inLatest: false, bk: 1, bookingFresh: true }), 'sold', 'бронь у квартиры не из последней выгрузки не учитывается');
  assert.equal(flatStatus({ inLatest: false }), 'sold', 'продана до начала выгрузок');
});

test('бронь показывается, только если собрана не раньше последней выгрузки', () => {
  assert.equal(isBookingFresh('2026-11-07', '2026-11-07'), true);
  assert.equal(isBookingFresh('2026-11-08', '2026-11-07'), true);
  assert.equal(isBookingFresh('2026-11-06', '2026-11-07'), false);
  assert.equal(isBookingFresh(undefined, '2026-11-07'), false);
  assert.equal(flatStatus({ inLatest: true, bk: 1, bookingFresh: false }), 'sale', 'бронь устарела — квартира продаётся');
});

test('история квартиры: пропуски — null, последняя строка — из самой свежей выгрузки', () => {
  const rows = [
    flat({ flat_id: '7', file: FILES[0], price_with_discount: 6000000, price_without_discount: 7000000 }),
    flat({ flat_id: '7', file: FILES[2], price_with_discount: 5900000, price_without_discount: 7000000, floor: 4 }),
  ];
  // Квартира 8 есть во всех выгрузках, поэтому выгрузок четыре.
  const all = buildDataset([...rows, ...FILES.map(file => flat({ flat_id: '8', file }))]);
  const h7 = buildHistories(all.snapshots, all.allRows).get('7');
  assert.deepEqual(h7.eff, [6000000, null, 5900000, null]);
  assert.deepEqual(h7.full, [7000000, null, 7000000, null]);
  assert.equal(h7.first, 0);
  assert.equal(h7.last, 2);
  assert.equal(h7.row.date, '2026-10-31');
  assert.equal(h7.row.floor, 4);
});

test('модель: статусы от последней выгрузки и свежести брони, дата ухода', () => {
  const rows = [
    flat({ flat_id: '1', file: FILES[2] }), flat({ flat_id: '1', file: FILES[3] }),
    flat({ flat_id: '2', file: FILES[2] }), flat({ flat_id: '2', file: FILES[3] }),
    flat({ flat_id: '3', file: FILES[2] }),
    flat({ flat_id: '4', file: FILES[2] }),
  ];
  const json = {
    list_date: '2026-11-08',
    flats: { 1: { st: 'free', bk: 0, b: '10' }, 2: { st: 'booked', bk: 1, b: '10' }, 3: { st: 'sold', b: '10' }, 4: { st: 'free', b: '10' } },
    buildings: { 10: { name: 'Дом 1', project: 'Зарека', delivery: 'Срок сдачи: 1 квартал 2027', sections: [] } },
  };
  const model = buildFlatsModel(buildDataset(rows), json);
  const st = id => model.flats.get(id).status;
  assert.deepEqual(['1', '2', '3', '4'].map(st), ['sale', 'booked', 'sold', 'sold'], 'ушедшая из выгрузки — продана при любом статусе карточки');
  assert.equal(model.flats.get('3').soldDate, '2026-11-07', 'первая выгрузка, в которой квартиры уже не было');
  assert.equal(model.flats.get('4').soldDate, '2026-11-07');
  assert.equal(model.flats.get('2').delivery, 'Срок сдачи: 1 квартал 2027');
  const stale = buildFlatsModel(buildDataset(rows), { ...json, list_date: '2026-11-01' });
  assert.equal(stale.flats.get('2').status, 'sale');
  assert.equal(buildFlatsModel(buildDataset(rows), null).flats.get('2').status, 'sale');
});

test('дома из выгрузки сопоставляются с flats.json по паре (проект, название)', () => {
  const index = indexBuildings({ 10: { project: 'Зарека', name: 'Дом 1' }, 11: { project: 'Речной порт', name: 'Дом 1' } });
  const rows = [
    flat({ flat_id: '1', project: 'Зарека', building_name: 'Дом 1' }),
    flat({ flat_id: '2', project: 'Зарека', building_name: 'Дом 2' }),
    flat({ flat_id: '3', project: 'Зарека', building_name: 'Дом 2' }),
    flat({ flat_id: '4', project: 'Речной порт', building_name: 'Дом 1' }),
  ];
  assert.deepEqual(unmatchedBuildings(index, rows), [{ project: 'Зарека', name: 'Дом 2', count: 2 }]);
});

const plain = s => s.replace(/[\u00a0\u202f]/g, ' ');

test('квартира, проданная до первой выгрузки: статус «продана», цена и площадь из карточки, ссылка по шаблону', () => {
  const rows = [
    flat({ flat_id: '46565', file: '2026.10.31.csv', link: 'https://example.com/flat/46565/' }),
    flat({ flat_id: '46565', file: '2026.11.07.csv', link: 'https://example.com/flat/46565/' }),
  ];
  const json = {
    list_date: '2026-11-08',
    flats: {
      46565: { st: 'free', b: '10', sec: '5' },
      23220: { st: 'sold', b: '10', sec: '5', fl: 4, pos: 2, sq: 50, p: 6000000, plan: 'p.svg' },
      23221: { st: 'free', b: '10', sec: '5', fl: 4, pos: 3, sq: 40, p: 5000000 },
    },
    sections: { 5: { n: '2', floors: 9, wr: 337, wrv: null } },
    buildings: { 10: { name: 'Дом 1', project: 'Зарека', delivery: 'Дом сдан', sections: [] } },
  };
  const model = buildFlatsModel(buildDataset(rows), json);
  const f = model.flats.get('23220');
  assert.equal(f.status, 'sold');
  assert.equal(f.soldBefore, '2026-10-31', 'дата первой выгрузки — из данных');
  assert.deepEqual([f.project, f.building, f.section, f.floor, f.floors], ['Зарека', 'Дом 1', '2', 4, 9]);
  assert.deepEqual([f.price, f.areaNow, f.m2, f.inLatest, f.booked], [6000000, 50, 120000, false, false]);
  assert.equal(f.link, 'https://example.com/flat/23220/');
  assert.equal(model.flats.get('23221').status, 'sold', 'не было ни в одной выгрузке — продана до их начала, что бы ни было в карточке');
  assert.equal(model.flats.get('23221').soldBefore, '2026-10-31');
});

test('тексты для проданной до первой выгрузки: пилюля, поповер, карточки, строка вместо графика', () => {
  const texts = soldBeforeTexts({ soldBefore: '2026-05-30', price: 6000000, areaNow: 50, m2: 120000 });
  assert.deepEqual(texts.popover.map(plain), ['последняя цена 6 000 000 ₽', 'площадь 50 м²'], 'статус «Продана до …» — плашкой');
  assert.deepEqual(texts.facts.map(([l, v]) => [l, plain(v)]), [
    ['Цена со скидкой', '—'], ['Полная цена', '6 000 000 ₽'], ['Скидка', '—'],
    ['За м²', '120 000 ₽'], ['С первой выгрузки', '—'], ['Мин / макс', '—'],
  ], 'те же шесть карточек, что у остальных квартир');
  assert.equal(texts.chartNote, 'Истории цен нет: квартира продана до первой выгрузки (30.05.2026)');
  const unknown = soldBeforeTexts({ soldBefore: '2026-05-30', price: null, areaNow: null, m2: null });
  assert.deepEqual(unknown.popover, ['последняя цена неизвестна']);
  assert.deepEqual(unknown.facts.map(([, v]) => v), ['—', '—', '—', '—', '—', '—']);
});

test('шаблон ссылки на квартиру — самый частый среди ссылок выгрузок', () => {
  const template = linkTemplate([
    flat({ flat_id: '1', link: 'https://example.com/flat/1/' }),
    flat({ flat_id: '2', link: 'https://example.com/flat/2/' }),
    flat({ flat_id: '3', link: 'https://other.example/x/3/' }),
    flat({ flat_id: '4', link: '' }),
  ]);
  assert.equal(template, 'https://example.com/flat/{id}/');
  assert.equal(flatLink(template, '777'), 'https://example.com/flat/777/');
  assert.equal(flatLink('', '777'), '');
});

test('плашка статуса: названия, дата продажи, «до начала выгрузок», оговорка только у «Продана»', () => {
  assert.deepEqual(statusBadge({ status: 'sale' }), { kind: 'sale', text: 'Продаётся', hint: null });
  assert.deepEqual(statusBadge({ status: 'booked' }), { kind: 'booked', text: 'Забронирована', hint: null });
  const sold = statusBadge({ status: 'sold', soldDate: '2026-06-20' });
  assert.equal(sold.text, 'Продана 20.06.2026');
  assert.ok(/вернуться в продажу/.test(sold.hint));
  assert.equal(statusBadge({ status: 'sold', soldBefore: '2026-05-30' }).text, 'Продана до 30.05.2026');
});

test('этаж словами: двухуровневая занимает и этаж выше, на верхнем этаже — «два уровня»', () => {
  assert.equal(floorText({ floor: '3', floors: 9, levels: 1 }, true), '3 этаж из 9');
  assert.equal(floorText({ floor: '3', floors: 2, levels: 1 }, true), '3 этаж', 'устаревшее число этажей не показываем');
  assert.equal(floorText({ floor: 1, floors: 9, levels: 2 }, true), '1–2 этаж из 9');
  assert.equal(floorText({ floor: 1, floors: 9, levels: 2 }), '1–2 этаж');
  assert.equal(floorText({ floor: 9, floors: 9, levels: 2 }, true), '9 этаж из 9, два уровня');
  assert.equal(floorText({ floor: '', floors: 9, levels: 1 }), '');
  assert.deepEqual([
    floorRange({ floor: 1, floors: 9, levels: 2 }), floorRange({ floor: 9, floors: 9, levels: 2 }),
    floorRange({ floor: '4', floors: 9, levels: 1 }), floorRange({ floor: '', floors: 9 }),
  ], ['1–2', '9', '4', ''], 'для колонки «Этаж» в таблице');
});

test('двухуровневость берётся из flats.json (lv: 2)', () => {
  const rows = [flat({ flat_id: '1', file: FILES[3] }), flat({ flat_id: '2', file: FILES[3] })];
  const json = {
    list_date: '2026-11-08',
    flats: { 1: { st: 'free', b: '10', lv: 2 }, 2: { st: 'free', b: '10' }, 3: { st: 'sold', b: '10', sec: '5', fl: 2, lv: 2 } },
    sections: { 5: { n: '1', floors: 9 } },
    buildings: { 10: { name: 'Дом 1', project: 'Зарека', delivery: '', sections: [] } },
  };
  const model = buildFlatsModel(buildDataset(rows), json);
  assert.deepEqual(['1', '2', '3'].map(id => model.flats.get(id).levels), [2, 1, 2]);
});
