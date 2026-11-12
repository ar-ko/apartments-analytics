#!/usr/bin/env python3
"""Сбор данных для сайта: выгрузка дня в data/history.json и постоянные данные квартир в data/flats.json.

Что собирается (всё с сайта застройщика, без ручных правок):
  * список квартир в продаже /api/filter/flats/ — выгрузка дня (те же поля, что у браузерного скрипта
    выгрузки) и бронь на момент сбора;
  * карточка квартиры /api/flats/<id>/ — статус, позиция на этаже, секция, дом, картинки, последняя цена,
    двухуровневость (lv: 2 — квартира занимает свой этаж и этаж выше);
  * вид из окон /api/window_view/<id>/ — один запрос на группу квартир с одинаковым window_view_point;
  * SVG плана этажа — номера контуров квартир d1…dN, из них складывается шахматка.

Файлы обновляются постепенно: запрашивается только то, чего ещё нет, плюс карточки квартир, у которых
мог смениться статус. Запросы идут строго последовательно с паузой; после 5 неудачных запросов подряд
скрипт перестаёт обращаться к серверу, сохраняет собранное и завершается с ошибкой (код 1).

Запуск из корня репозитория:
  python3 scripts/collect_flats.py                  # выгрузка дня + обновить flats.json
  python3 scripts/collect_flats.py --no-snapshot    # без записи выгрузки дня
  python3 scripts/collect_flats.py --discover       # поискать квартиры, проданные до начала выгрузок
  python3 scripts/collect_flats.py --discover --discover-edge 20 --discover-building 382   # шире, один дом
  python3 scripts/collect_flats.py --discover --discover-sweep --discover-limit 6000 --delay 1.5 --cache-dir .cache
                                    # полный перебор ID всех домов по частям: каждый запуск продолжает предыдущий
  python3 scripts/collect_flats.py --cache-dir .cache   # сохранять сырые ответы; карточки квартир из выгрузки
                                                        # всё равно запрашиваются заново
  python3 scripts/collect_flats.py --offline --cache-dir .cache   # пересобрать без сети

Правила шахматки:
  1. Позиция квартиры — number_on_floor из карточки, контуры — группы d1…dN в SVG плана этажа.
  2. Позиция, которой нет среди контуров, всё равно получает клетку — в конце ряда.
  3. Если у этажа несколько файлов плана: больше контуров → на файл ссылаются квартиры в продаже →
     больше ссылок → по имени файла.
  4. Этаж без данных — одна полоса шириной в ряд ближайшего этажа той же секции с данными
     (при равном расстоянии — нижнего).
  5. Этажи выше заявленной этажности секции не показываются: квартиры там — записи из прежней версии
     проекта (все «Продана», ни разу не были в выгрузках).
  6. Если позицию занимают две квартиры (старая запись и та же квартира под новым ID), в клетку идёт
     квартира в продаже, затем бывавшая в выгрузках, затем с бо́льшим ID.
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import history as history_file  # noqa: E402  соседний модуль: формат data/history.json

SITE = 'https://tyumen.brusnika.ru'
LIST_URL = (SITE + '/api/filter/flats/?offset=0&ordering=price_order&limit=2000'
            '&active_banner=true&active_big_card=true&is_group=0&is_booked=true')
MEDIA = 'https://cdn.brusnika.ru/media/'
CONTOUR_ID = re.compile(r'\bid="d(\d+)"')
# Метки карточки, при которых квартира занимает и этаж выше: «Двухуровневая» и «Второй свет».
# Застройщик пишет такую квартиру на этаж её первого уровня.
TWO_LEVEL_TAGS = {9, 30}
MAX_DISCOVERY_PASSES = 30  # предохранитель: обычно поиск сходится за несколько проходов


# ------------------------------------------------------------------ сеть

class Client:
    """Последовательные запросы с паузой и необязательным кэшем сырых ответов на диске."""

    # Столько неудачных запросов подряд — и сервер считаем недоступным: дальше работаем только с кэшем,
    # чтобы не долбить его повторами. Собранное к этому моменту всё равно сохраняется.
    MAX_FAILURES_IN_ROW = 5

    def __init__(self, delay, cache_dir=None, offline=False):
        self.delay = delay
        self.cache_dir = cache_dir
        self.offline = offline
        self.failures_in_row = 0
        self.last_status = None  # 'ok' | 'cached' | 'not_found' | 'failed' | 'offline'
        self.requests = 0
        self._last = 0.0

    def get(self, url, cache_name=None, as_json=True, fresh=False):
        """fresh — ответ, который мог измениться (карточка квартиры из выгрузки): запросить заново и обновить кэш.
        Без сети (--offline или сервер не отвечает) и такой ответ берётся из кэша."""
        cached = self._cache_path(cache_name)
        if cached and os.path.exists(cached) and (not fresh or self.offline):
            self.last_status = 'cached'
            with open(cached, encoding='utf-8') as fh:
                return json.load(fh) if as_json else fh.read()
        body = self._fetch(url)
        if body is None:
            # «Такой квартиры нет» — тоже ответ: без него прогон из кэша (--offline) не знал бы, что ID проверен.
            if cached and as_json and self.last_status == 'not_found':
                os.makedirs(os.path.dirname(cached), exist_ok=True)
                with open(cached, 'w', encoding='utf-8') as fh:
                    fh.write('null')
            return None
        if cached:
            os.makedirs(os.path.dirname(cached), exist_ok=True)
            with open(cached, 'w', encoding='utf-8') as fh:
                fh.write(body)
        return json.loads(body) if as_json else body

    def cached(self, name):
        path = self._cache_path(name)
        return bool(path and os.path.exists(path))

    def read_cached(self, name, as_json=True):
        """Сохранённый ответ без обращения к сети; None, если его нет."""
        path = self._cache_path(name)
        if not path or not os.path.exists(path):
            return None
        with open(path, encoding='utf-8') as fh:
            return json.load(fh) if as_json else fh.read()

    def _cache_path(self, name):
        return os.path.join(self.cache_dir, name) if self.cache_dir and name else None

    def _fetch(self, url, attempts=3):
        if self.offline:
            self.last_status = 'offline'
            return None
        for attempt in range(attempts):
            wait = self.delay - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            self.requests += 1
            try:
                req = urllib.request.Request(url, headers={'Accept': 'application/json'})
                with urllib.request.urlopen(req, timeout=30) as resp:
                    body = resp.read().decode('utf-8')
                self.failures_in_row = 0
                self.last_status = 'ok'
                return body
            except urllib.error.HTTPError as error:
                if error.code == 404:
                    self.failures_in_row = 0
                    self.last_status = 'not_found'
                    return None
                log(f'  HTTP {error.code} {url}, попытка {attempt + 1}')
            except (urllib.error.URLError, TimeoutError, OSError) as error:
                log(f'  {error} {url}, попытка {attempt + 1}')
            time.sleep(2 ** attempt)
        self.last_status = 'failed'
        self.failures_in_row += 1
        if self.failures_in_row >= self.MAX_FAILURES_IN_ROW:
            log(f'Сервер не отвечает {self.failures_in_row} запросов подряд — дальше только кэш, собранное сохраню')
            self.offline = True
        return None


def log(message):
    print(message, file=sys.stderr, flush=True)


# ------------------------------------------------------------------ входные данные

def read_history_flat_ids(data_dir):
    """ID квартир из истории выгрузок (data/history.json) и дата самой свежей выгрузки."""
    path = os.path.join(data_dir, 'history.json')
    if not os.path.exists(path):
        sys.exit(f'Нет {path}: сначала соберите историю (scripts/history.py)')
    with open(path, encoding='utf-8') as fh:
        history = json.load(fh)
    return set(history['flats']), (history['dates'][-1] if history['dates'] else None)


def short_url(url):
    return url[len(MEDIA):] if url and url.startswith(MEDIA) else (url or None)


# ------------------------------------------------------------------ разбор ответов

def flat_from_card(card):
    section = card.get('section') or {}
    building = section.get('building') or {}
    position = str(card.get('number_on_floor') or '')
    has_window_view = bool(card.get('window_view_point') and building.get('building_plan'))
    # ID секции и дома — строки: ключи JSON-объектов после загрузки тоже строки.
    flat = {
        'st': card.get('status_type') or '',
        'pos': int(position) if position.isdigit() else None,
        'fl': card.get('floor'),
        'sec': str(section['id']) if section.get('id') is not None else None,
        'b': str(building['id']) if building.get('id') is not None else None,
        'plan': short_url(card.get('main_flat_image')),
        'dims': short_url(card.get('flat7_image_file')),
        'floor': short_url(card.get('floor_image_file')),
        'wvp': card.get('window_view_point') if has_window_view else None,
        # Площадь и цена из карточки нужны квартирам, которых не было в выгрузках (найдены поиском):
        # у проданной квартиры застройщик отдаёт последнюю цену.
        'sq': card.get('square'),
        'p': round(card['price']) if isinstance(card.get('price'), (int, float)) and card['price'] > 0 else None,
    }
    if any(tag.get('id') in TWO_LEVEL_TAGS for tag in card.get('tags') or [] if isinstance(tag, dict)):
        flat['lv'] = 2
    return flat


def section_from_card(card):
    section = card.get('section') or {}
    building_id = (section.get('building') or {}).get('id')
    # Стороны света, как у компаса на сайте застройщика: угол поворота по часовой стрелке, 0 — север вверху.
    # wr — для планировки и плана этажа, wrv — для генплана «Вид из окон».
    return {'n': str(section.get('number') or ''), 'floors': section.get('floors_num'),
            'b': str(building_id) if building_id is not None else None,
            'wr': section.get('windrose_degree'), 'wrv': section.get('windrose_degree_window_view')}


def building_from_card(card):
    building = (card.get('section') or {}).get('building') or {}
    return {'name': building.get('name') or '', 'project': (building.get('complex') or {}).get('name') or '',
            'delivery': building.get('delivery_title_display') or ''}


def window_view_from_response(data):
    plan = (data or {}).get('building_plan') or {}
    angles = []
    for item in data.get('angle_set') or []:
        if item.get('ppoi') and item.get('angle') is not None:
            x, y = (round(float(v), 2) for v in str(item['ppoi']).split(';'))
            angles.append([item['angle'], x, y])
    if not plan.get('image') or not angles:
        return None
    return {'img': short_url(plan['image']), 'w': plan.get('image_width'), 'h': plan.get('image_height'), 'a': angles}


# ------------------------------------------------------------------ поиск квартир вне выгрузок

def discovery_candidates(flats, probed, gap, edge=0, building=None):
    """ID-пропуски внутри «пачек» ID каждого дома и (если edge > 0) по краям пачек.

    Застройщик заводит квартиры дома пачками с близкими ID, поэтому квартиры, проданные до начала
    выгрузок, чаще всего прячутся в пропусках между известными ID того же дома, а также сразу за
    краями пачки. Пачка — соседние известные ID дома с разрывом не больше gap. Уже проверенные пустые
    ID пропускаются. building — искать только для одного дома (id).
    """
    known = {int(fid) for fid in flats if fid.isdigit()}
    by_building = defaultdict(list)
    for fid, flat in flats.items():
        if fid.isdigit() and flat.get('b') and (building is None or flat['b'] == str(building)):
            by_building[flat['b']].append(int(fid))
    candidates = set()
    for ids in by_building.values():
        ids.sort()
        start = prev = ids[0]
        for current in ids[1:] + [None]:
            if current is None or current - prev > gap:
                candidates.update(range(max(1, start - edge), prev + edge + 1))
                start = current
            prev = current if current is not None else prev
    return sorted(candidates - known - set(probed))


def mentioned_flats(data):
    """ID квартир, которые упоминает ответ застройщика.

    Карточка: floors_prices — та же планировка на других этажах, flats_on_floor — квартиры этажа.
    Вид из окон: flat_set — квартиры с тем же видом. Так находятся квартиры, далёкие по ID от пачек дома.
    """
    data = data if isinstance(data, dict) else {}
    floors_prices = data.get('floors_prices')
    items = ((floors_prices.get('items') or []) if isinstance(floors_prices, dict) else []) \
        + (data.get('flats_on_floor') or []) + (data.get('flat_set') or [])
    ids = set()
    for item in items:
        value = item.get('id') if isinstance(item, dict) else item
        if value is not None and str(value).isdigit():
            ids.add(int(value))
    return ids


def reference_candidates(client, flats, probed, building=None):
    """Непроверенные ID, которые упоминают сохранённые ответы о квартирах известных домов (нужен --cache-dir)."""
    mentioned = set()
    for fid, flat in flats.items():
        if building is None or flat.get('b') == str(building):
            mentioned |= mentioned_flats(client.read_cached(f'cards/{fid}.json'))
            mentioned |= mentioned_flats(client.read_cached(f'wv/{fid}.json'))
    known = {int(fid) for fid in flats if fid.isdigit()}
    return sorted(mentioned - known - set(probed))


def sweep_ids(flats, building=None):
    """Все ID от наименьшего до наибольшего ID квартир каждого дома (building — только одного дома)."""
    spans = defaultdict(list)
    for fid, flat in flats.items():
        if fid.isdigit() and flat.get('b') and (building is None or flat['b'] == str(building)):
            spans[flat['b']].append(int(fid))
    return {i for ids in spans.values() for i in range(min(ids), max(ids) + 1)}


def id_ranges(ids):
    """ID → серии [[от, до], ...]: проверенные поиском ID идут подряд, серии в разы короче списка."""
    ranges = []
    for i in sorted(ids):
        if ranges and i == ranges[-1][1] + 1:
            ranges[-1][1] = i
        else:
            ranges.append([i, i])
    return ranges


def read_probed(state):
    """ID, проверенные поиском, где квартиры нет или она чужая. В flats.json — серии checked вместе с ID квартир
    (так серии длиннее); прежний формат — список probed."""
    known = {int(fid) for fid in state['flats'] if fid.isdigit()}
    if 'checked' in state:
        return {i for start, end in state['checked'] for i in range(start, end + 1)} - known
    return set(state.get('probed', [])) - known


def discover(candidates, client, flats, sections, buildings, probed, found):
    """Проверить ID-кандидаты; квартиры уже известных домов сохранить, пустые и чужие ID запомнить."""
    for i, fid in enumerate(candidates, 1):
        if client.offline and not client.cached(f'cards/{fid}.json'):
            continue  # без сети непроверенный ID остаётся непроверенным
        card = client.get(f'{SITE}/api/flats/{fid}/', f'cards/{fid}.json')
        bid = (((card or {}).get('section') or {}).get('building') or {}).get('id')
        if card and card.get('id') and bid is not None and str(bid) in buildings:
            flats[str(fid)] = flat_from_card(card)
            sections[str(card['section']['id'])] = section_from_card(card)
            found += 1
        elif client.last_status in ('ok', 'cached', 'not_found'):
            probed.add(fid)  # ответ получен: квартиры нет или она чужая; сбой сети ID не «сжигает»
        if i % 100 == 0:
            log(f'  поиск: {i}/{len(candidates)}, найдено {found}, запросов {client.requests}')
    return found


def fetch_window_views(state, client):
    """Вид из окон: один запрос на группу квартир с одинаковым window_view_point; уже собранные группы пропускаются."""
    groups = defaultdict(list)
    for fid, flat in state['flats'].items():
        if flat.get('wvp'):
            groups[str(flat['wvp'])].append(fid)
    missing = [key for key in groups if key not in state['window_views']]
    log(f'Групп вида из окон: {len(groups)}, запросить: {len(missing)}')
    for i, key in enumerate(missing, 1):
        # Если ответ по какой-то квартире группы уже лежит в кэше, берём его.
        fid = next((f for f in groups[key] if client.cached(f'wv/{f}.json')), groups[key][0])
        data = client.get(f'{SITE}/api/window_view/{fid}/', f'wv/{fid}.json')
        view = window_view_from_response(data) if data else None
        if view:
            state['window_views'][key] = view
        if i % 50 == 0:
            log(f'  вид из окон: {i}/{len(missing)}, запросов {client.requests}')


# ------------------------------------------------------------------ шахматка

def compose_buildings(flats, sections, buildings, floor_plans, ever_seen=frozenset()):
    """Раскладка шахматки каждого дома по правилам 1–6 из описания модуля."""
    by_floor = defaultdict(list)
    for fid, flat in flats.items():
        if flat.get('sec') is None or flat.get('fl') is None:
            continue
        declared = (sections.get(flat['sec']) or {}).get('floors')
        if declared and flat['fl'] > declared:
            continue  # правило 5
        by_floor[(flat['sec'], flat['fl'])].append((fid, flat))

    chosen_plan = {}
    for key, items in by_floor.items():
        refs = defaultdict(lambda: {'refs': 0, 'active': 0})
        for _, flat in items:
            if flat.get('floor'):
                refs[flat['floor']]['refs'] += 1
                refs[flat['floor']]['active'] += 1 if flat.get('st') != 'sold' else 0
        ranked = sorted(refs.items(), key=lambda kv: (-len(floor_plans.get(kv[0]) or []),
                                                      -(1 if kv[1]['active'] else 0), -kv[1]['refs'], kv[0]))
        if ranked:
            chosen_plan[key] = ranked[0][0]

    # Квартире для подсветки на плане этажа нужен тот же файл, что выбран для её этажа (правило 3).
    for key, items in by_floor.items():
        for _, flat in items:
            if key in chosen_plan:
                flat['floor'] = chosen_plan[key]

    result = {}
    sections_by_building = defaultdict(list)
    for sid, section in sections.items():
        sections_by_building[section['b']].append((sid, section))
    for bid, building in buildings.items():
        out_sections = []
        for sid, section in sorted(sections_by_building.get(bid, []),
                                   key=lambda s: (int(s[1]['n']) if s[1]['n'].isdigit() else 0, s[1]['n'])):
            known_floors = [fl for (s, fl) in by_floor if s == sid]
            floors = section.get('floors') or (max(known_floors) if known_floors else 0)
            rows = []
            for floor in range(floors, 0, -1):
                rows.append(compose_row(floor, by_floor.get((sid, floor), []),
                                        chosen_plan.get((sid, floor)), floor_plans, ever_seen))
            fill_empty_floors(rows)
            out_sections.append({'id': sid, 'n': section['n'], 'rows': rows})
        result[bid] = {**building, 'sections': out_sections}
    return result


def compose_row(floor, items, plan, floor_plans, ever_seen=frozenset()):
    contours = floor_plans.get(plan) or []
    known = {}
    without_position = []

    flat_of = dict(items)

    def priority(fid):  # правило 6
        return (flat_of[fid].get('st') != 'sold', fid in ever_seen, int(fid) if fid.isdigit() else 0)

    for fid, flat in items:
        if flat.get('pos') is None:
            without_position.append(fid)
        elif flat['pos'] not in known or priority(fid) > priority(known[flat['pos']]):
            known[flat['pos']] = fid
    cells = []
    for k in contours:
        cell = {'k': k}
        if k in known:
            cell['id'] = known.pop(k)
        cells.append(cell)
    for k, fid in sorted(known.items()):
        cells.append({'k': k, 'id': fid})
    cells += [{'id': fid} for fid in sorted(without_position)]
    return {'f': floor, 'cells': cells}


def fill_empty_floors(rows):
    with_data = [row for row in rows if row['cells']]
    for row in rows:
        if not row['cells'] and with_data:
            nearest = min(with_data, key=lambda r: (abs(r['f'] - row['f']), r['f']))
            row['bar'] = len(nearest['cells'])


# ------------------------------------------------------------------ запись

def dump(state, path):
    """JSON с отдельной строкой на квартиру — чтобы ежедневные изменения были читаемы в git diff."""
    def block(name, mapping, last=False):
        items = sorted(mapping.items(), key=lambda kv: (len(str(kv[0])), str(kv[0])))
        lines = [f'{json.dumps(str(k))}:{json.dumps(v, ensure_ascii=False, separators=(",", ":"))}' for k, v in items]
        return f'"{name}":{{\n' + ',\n'.join(lines) + '\n}' + ('' if last else ',')

    header = {k: state[k] for k in ('version', 'generated', 'list_date', 'media')}
    head = json.dumps(header, ensure_ascii=False, separators=(',', ':'))[:-1]
    text = '\n'.join([head + ',',
                      block('flats', state['flats']),
                      block('window_views', state['window_views']),
                      block('floor_plans', state['floor_plans']),
                      f'"checked":{json.dumps(state.get("checked", []), separators=(",", ":"))},',
                      block('sections', state['sections']),
                      block('buildings', state['buildings'], last=True)]) + '\n}\n'
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        fh.write(text)
    os.replace(tmp, path)


# ------------------------------------------------------------------ main

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--data-dir', default='data')
    parser.add_argument('--delay', type=float, default=0.35, help='пауза между запросами, секунды')
    parser.add_argument('--cache-dir', help='папка для сырых ответов; уже сохранённые ответы не запрашиваются')
    parser.add_argument('--refresh', action='store_true', help='перезапросить карточки всех квартир')
    parser.add_argument('--limit', type=int, help='не больше стольких карточек за запуск (для пробы)')
    parser.add_argument('--discover', action='store_true',
                        help='поискать квартиры, которых не было в выгрузках: в пропусках ID каждого дома '
                             'и по ссылкам из сохранённых ответов (нужен --cache-dir)')
    parser.add_argument('--discover-gap', type=int, default=40, help='наибольший разрыв ID внутри пачки дома')
    parser.add_argument('--discover-edge', type=int, default=0, help='сколько ID проверять за краями каждой пачки')
    parser.add_argument('--discover-building', help='искать только для одного дома (id дома в API)')
    parser.add_argument('--discover-sweep', action='store_true',
                        help='проверить и все ID подряд от наименьшего до наибольшего ID каждого дома '
                             '(с --discover-building — одного дома); десятки тысяч запросов, дробить --discover-limit')
    parser.add_argument('--discover-limit', type=int, metavar='N',
                        help='не больше N ID за запуск поиска; проверенные запоминаются, следующий запуск продолжит')
    parser.add_argument('--offline', action='store_true',
                        help='без сети: только ответы из --cache-dir; бронь и дата списка остаются прежними')
    parser.add_argument('--no-snapshot', action='store_true',
                        help='не записывать список квартир в продаже в историю как выгрузку дня')
    args = parser.parse_args()

    out_path = os.path.join(args.data_dir, 'flats.json')
    state = {'version': 1, 'flats': {}, 'window_views': {}, 'floor_plans': {}, 'sections': {}, 'buildings': {}}
    if os.path.exists(out_path):
        with open(out_path, encoding='utf-8') as fh:
            state.update(json.load(fh))
    flats, sections, buildings = state['flats'], state['sections'], state['buildings']
    probed = read_probed(state)
    previous_booking = {fid: flat.get('bk', 0) for fid, flat in flats.items()}
    client = Client(args.delay, args.cache_dir, offline=args.offline)

    ever_seen, latest_csv = read_history_flat_ids(args.data_dir)
    log(f'История: квартир за всё время {len(ever_seen)}, последняя выгрузка {latest_csv}')

    on_sale = {}
    if args.offline:
        # Без сети состав продаж неизвестен: «ушедшие» не перезапрашиваем, бронь не трогаем.
        on_sale = {fid: {} for fid, flat in flats.items() if flat.get('st') != 'sold'}
    else:
        listing = client._fetch(LIST_URL)
        if listing is None:
            sys.exit('Не удалось получить список квартир')
        items = json.loads(listing).get('results', [])
        for item in items:
            on_sale.setdefault(str(item.get('flat_id')), item)
        log(f'Сейчас в продаже: {len(on_sale)}')
        if not args.no_snapshot:
            # Список квартир в продаже — это и есть выгрузка дня (те же поля, что у браузерного скрипта).
            history_path = os.path.join(args.data_dir, 'history.json')
            history = history_file.load(history_path)
            records = [r for r in (history_file.normalize(history_file.row_from_listing(i)) for i in items) if r]
            now = datetime.now()
            today, clock = now.date().isoformat(), now.strftime('%H:%M')
            replaced = history_file.put_snapshot(history, today, records, clock)
            history_file.save(history, history_path)
            ever_seen, latest_csv = read_history_flat_ids(args.data_dir)
            unique = len({r['flat_id'] for r in records})
            log(f'Выгрузка {today} {clock} {"обновлена" if replaced else "добавлена"} в историю: квартир {unique}')

    # Карточки: новые квартиры и ушедшие из продажи, пока они не отмечены проданными.
    wanted = sorted(ever_seen | set(on_sale) | (set(flats) if args.refresh else set()), key=lambda s: (len(s), s))
    # Квартиры возвращаются в продажу (сорвалась сделка): «проданную», которая снова в списке, тоже перезапрашиваем.
    to_fetch = [fid for fid in wanted if args.refresh or fid not in flats
                or (fid not in on_sale and flats[fid].get('st') != 'sold')
                or (not args.offline and fid in on_sale and flats[fid].get('st') == 'sold')]
    if args.limit:
        to_fetch = to_fetch[:args.limit]
    log(f'Карточек запросить: {len(to_fetch)}')
    for i, fid in enumerate(to_fetch, 1):
        card = client.get(f'{SITE}/api/flats/{fid}/', f'cards/{fid}.json', fresh=True)
        if card and card.get('id'):
            flats[fid] = flat_from_card(card)
            if card.get('section', {}).get('id') is not None:
                sections[str(card['section']['id'])] = section_from_card(card)
            bid = ((card.get('section') or {}).get('building') or {}).get('id')
            if bid is not None:
                buildings[str(bid)] = building_from_card(card)
        if i % 50 == 0:
            log(f'  карточки: {i}/{len(to_fetch)}, запросов {client.requests}')

    # Поиск квартир, проданных до начала выгрузок. Сохраняем только квартиры уже известных домов,
    # чтобы на сайте не появлялись чужие проекты; пустые и чужие ID запоминаем, чтобы не спрашивать снова.
    if args.discover:
        found = 0
        sweep = sweep_ids(flats, args.discover_building) if args.discover_sweep else set()
        if not args.cache_dir:
            log('Без --cache-dir поиск идёт только по пачкам ID: ссылки читаются из сохранённых ответов')
        budget = args.discover_limit
        unchecked = lambda: sweep - {int(fid) for fid in flats if fid.isdigit()} - probed  # noqa: E731
        # Найденные квартиры расширяют пачки и приносят новые ссылки, поэтому проходы повторяются,
        # пока находится новое. Перебор диапазона целиком попадает в первый проход.
        for attempt in range(1, MAX_DISCOVERY_PASSES + 1):
            by_range = discovery_candidates(flats, probed, args.discover_gap, args.discover_edge,
                                            args.discover_building)
            by_reference = reference_candidates(client, flats, probed, args.discover_building)
            candidates = sorted(set(by_range) | set(by_reference) | unchecked())
            if budget is not None:
                candidates = candidates[:budget]
            if not candidates or client.offline and attempt > 1:
                break
            before = found
            log(f'Поиск, проход {attempt}: проверить ID {len(candidates)}, из них по ссылкам {len(by_reference)}')
            found = discover(candidates, client, flats, sections, buildings, probed, found)
            if budget is not None:
                budget -= len(candidates)
                if budget <= 0:
                    break
            if found == before:
                break
            if args.cache_dir and not client.offline:
                fetch_window_views(state, client)  # у новых квартир свои группы вида — свои ссылки
        log(f'Поиск: найдено квартир {found}')
        if sweep:
            log(f'Перебор: осталось проверить ID {len(unchecked())}')

    # Бронь — только у квартир в продаже, на дату сбора.
    if not args.offline:
        for fid, flat in flats.items():
            flat['bk'] = 1 if (on_sale.get(fid) or {}).get('is_booked') else 0
    else:
        for fid, flat in flats.items():
            flat['bk'] = previous_booking.get(fid, 0)

    fetch_window_views(state, client)

    # Планы этажей: номера контуров квартир.
    plans = sorted({flat['floor'] for flat in flats.values() if flat.get('floor')} - set(state['floor_plans']))
    log(f'Планов этажей запросить: {len(plans)}')
    for i, plan in enumerate(plans, 1):
        svg = client.get(MEDIA + plan if not plan.startswith('http') else plan,
                         f'svg/{os.path.basename(plan)}', as_json=False)
        if svg:
            state['floor_plans'][plan] = sorted({int(n) for n in CONTOUR_ID.findall(svg)})
        if i % 50 == 0:
            log(f'  планы этажей: {i}/{len(plans)}, запросов {client.requests}')

    state['buildings'] = compose_buildings(flats, sections,
                                           {k: {kk: v[kk] for kk in ('name', 'project', 'delivery')}
                                            for k, v in buildings.items()},
                                           state['floor_plans'], ever_seen)
    state.pop('probed', None)
    state['checked'] = id_ranges(probed | {int(fid) for fid in flats if fid.isdigit()})
    state['generated'] = date.today().isoformat()
    if not args.offline:
        state['list_date'] = date.today().isoformat()
    state['media'] = MEDIA
    dump(state, out_path)
    log(f'Готово: квартир {len(flats)}, домов {len(state["buildings"])}, групп вида из окон '
        f'{len(state["window_views"])}, планов этажей {len(state["floor_plans"])}, сетевых запросов {client.requests}')
    if client.offline and not args.offline:
        sys.exit('Сервер перестал отвечать: собранное сохранено, остальное доберёт следующий запуск')


if __name__ == '__main__':
    main()
