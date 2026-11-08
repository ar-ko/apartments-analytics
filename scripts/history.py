#!/usr/bin/env python3
"""История выгрузок квартир: data/history.json — все выгрузки в одном компактном файле.

Постоянные поля квартиры (проект, дом, секция, этаж, этажность секции, ссылка) хранятся один раз —
последнее непустое значение. Цена, полная цена и площадь хранятся только в моменты изменения,
наличие в выгрузках — интервалами. Сайт разворачивает файл обратно в строки выгрузок.

Запуск из корня репозитория:
  python3 scripts/history.py build data/*.csv              # собрать history.json из CSV-выгрузок
  python3 scripts/history.py add выгрузка.csv               # добавить новую выгрузку (дата — из имени или сегодня)
  python3 scripts/history.py add выгрузка.csv --date 2026-11-14
  python3 scripts/history.py check data/*.csv              # сверить history.json с CSV построчно

Формат CSV — как у скрипта выгрузки: разделитель ';', колонки project, link, area, price_with_discount,
price_without_discount, flat_id, floor, building_name, section_number, section_floors_count.
Дата выгрузки в имени файла: ГГГГ.ММ.ДД или ДД.ММ.ГГГГ (разделители . - _).
"""

import argparse
import csv
import json
import os
import re
import sys
from collections import Counter
from datetime import date

DEFAULT_PATH = os.path.join('data', 'history.json')
DATE_PATTERNS = [
    (re.compile(r'(\d{4})[._-](\d{1,2})[._-](\d{1,2})'), ('y', 'm', 'd')),
    (re.compile(r'(\d{1,2})[._-](\d{1,2})[._-](\d{4})'), ('d', 'm', 'y')),
]
STATIC_TEXT = {'b': 'building_name', 's': 'section_number'}
STATIC_NUMBER = {'f': 'floor', 'fc': 'section_floors_count'}


# ------------------------------------------------------------------ разбор выгрузки

def date_from_filename(name):
    stem = os.path.splitext(os.path.basename(name))[0]
    for pattern, order in DATE_PATTERNS:
        match = pattern.search(stem)
        if match:
            parts = dict(zip(order, match.groups()))
            return f"{int(parts['y']):04d}-{int(parts['m']):02d}-{int(parts['d']):02d}"
    return None


def parse_number(value):
    """Число в русском формате: «18,2», «5 400 000». Пусто или мусор — 0, как на сайте."""
    text = re.sub(r'\s', '', str(value or '')).replace(',', '.', 1)
    text = re.sub(r'[^\d.-]', '', text)
    try:
        return float(text) if text else 0.0
    except ValueError:
        return 0.0


def clean(value):
    return str(value or '').strip().strip('"')


def normalize(row):
    """Строка выгрузки → запись или None, по тем же правилам, что раньше применял сайт."""
    project = clean(row.get('project'))
    flat_id = clean(row.get('flat_id'))
    area = parse_number(row.get('area'))
    with_discount = parse_number(row.get('price_with_discount'))
    without_discount = parse_number(row.get('price_without_discount'))
    price = with_discount or without_discount
    if not project or not flat_id or not area or not price:
        return None
    record = {
        'flat_id': flat_id,
        'project': project,
        'link': clean(row.get('link')),
        'area': area,
        'price': round(price),
        'full': round(without_discount or price),
    }
    for key, column in STATIC_TEXT.items():
        record[key] = clean(row.get(column))
    for key, column in STATIC_NUMBER.items():
        text = clean(row.get(column))
        record[key] = parse_number(text) if text else None
    return record


def read_csv(path):
    with open(path, encoding='utf-8-sig') as fh:
        rows = [normalize(row) for row in csv.DictReader(fh, delimiter=';')]
    return [r for r in rows if r]


def js_truthy(value):
    """Истинность как в JavaScript: строка «0.00» истинна, 0, None и пустая строка — нет."""
    return value not in (None, '', 0, False)


def money(value):
    if value in (None, '', '0.00', 0):
        return ''
    try:
        return str(round(float(str(value).replace(',', '.'))))
    except ValueError:
        return str(value)


def row_from_listing(item):
    """Квартира из списка /api/filter/flats/ → строка выгрузки, ровно как в браузерном скрипте выгрузки."""
    def nested(key, name):
        obj = item.get(key)
        return obj.get(name) if isinstance(obj, dict) else None

    project = (item.get('project_name') or item.get('complex_name') or item.get('complex_title')
               or nested('complex', 'name') or nested('project', 'name') or nested('house', 'project_name')
               or nested('house', 'complex_name') or item.get('residential_complex_name')
               or nested('residential_complex', 'name') or '')
    promo = item.get('active_promo_price')
    marketing = item.get('price_marketing')
    discount = promo if js_truthy(promo) else (marketing if js_truthy(marketing) else '')
    area = item.get('square') if item.get('square') is not None else item.get('area')
    flat_id = item.get('flat_id') if item.get('flat_id') is not None else item.get('id')

    def plain(key):
        value = item.get(key)
        return '' if value is None else str(value)

    return {
        'project': project,
        'link': item.get('page_url') or item.get('url') or '',
        'area': '' if area is None else str(area).replace('.', ','),
        'price_with_discount': money(discount),
        'price_without_discount': money(item.get('price') if item.get('price') is not None else ''),
        'flat_id': '' if flat_id is None else str(flat_id),
        'floor': plain('floor'),
        'building_name': plain('building_name'),
        'section_number': plain('section_number'),
        'section_floors_count': plain('section_floors_count'),
    }


# ------------------------------------------------------------------ история

def empty_history():
    return {'version': 1, 'dates': [], 'link': None, 'projects': [], 'flats': {}}


def as_number(value):
    """1.0 → 1, 18.2 → 18.2 — чтобы в JSON не было лишних «.0»."""
    return int(value) if value is not None and float(value).is_integer() else value


def add_snapshot(history, snapshot_date, records):
    dates = history['dates']
    if dates and snapshot_date <= dates[-1]:
        raise ValueError(f'выгрузка {snapshot_date} не новее последней в истории ({dates[-1]})')
    index = len(dates)
    dates.append(snapshot_date)
    projects = history['projects']
    seen = set()
    for record in records:
        fid = record['flat_id']
        if fid in seen:  # дубль квартиры внутри выгрузки — берём первую строку
            continue
        seen.add(fid)
        if record['project'] not in projects:
            projects.append(record['project'])
        flat = history['flats'].setdefault(fid, {'r': [], 'pr': [], 'a': []})
        flat['p'] = projects.index(record['project'])
        if record['link']:
            flat['l'] = record['link']
        for key in STATIC_TEXT:
            if record[key]:
                flat[key] = record[key]
        for key in STATIC_NUMBER:
            if record[key] is not None:
                flat[key] = as_number(record[key])
        runs = flat['r']
        if runs and runs[-1][1] == index - 1:
            runs[-1][1] = index
        else:
            runs.append([index, index])
        price = [record['price'], record['full']]
        if not flat['pr'] or flat['pr'][-1][1:] != price:
            flat['pr'].append([index] + price)
        area = as_number(record['area'])
        if not flat['a'] or flat['a'][-1][1] != area:
            flat['a'].append([index, area])


def drop_last_snapshot(history):
    """Убрать последнюю выгрузку — чтобы повторный сбор в тот же день её заменил."""
    index = len(history['dates']) - 1
    if index < 0:
        return
    for fid in list(history['flats']):
        flat = history['flats'][fid]
        runs = flat['r']
        if runs and runs[-1][1] == index:
            if runs[-1][0] == index:
                runs.pop()
            else:
                runs[-1][1] = index - 1
        flat['pr'] = [p for p in flat['pr'] if p[0] != index]
        flat['a'] = [a for a in flat['a'] if a[0] != index]
        if not runs:
            del history['flats'][fid]
    history['dates'].pop()


def put_snapshot(history, snapshot_date, records):
    """Добавить выгрузку; выгрузку за ту же дату, что последняя, — заменить."""
    replaced = bool(history['dates']) and history['dates'][-1] == snapshot_date
    if replaced:
        drop_last_snapshot(history)
    add_snapshot(history, snapshot_date, records)
    return replaced


def link_template(history):
    """Самый частый вид ссылки «…{id}…»; ссылки этого вида у квартир не хранятся."""
    parts = Counter()
    for fid, flat in history['flats'].items():
        link = flat.get('l') or ''
        if fid in link:
            i = link.rfind(fid)
            parts[(link[:i], link[i + len(fid):])] += 1
    if not parts:
        return None
    (prefix, suffix), _ = parts.most_common(1)[0]
    return prefix + '{id}' + suffix


def compact_links(history):
    """Убирает из квартир ссылки, совпадающие с шаблоном (перед записью; load() их восстанавливает)."""
    template = link_template(history)
    history['link'] = template
    for fid, flat in history['flats'].items():
        if template and flat.get('l') == template.replace('{id}', fid):
            del flat['l']


def snapshot_rows(history, index):
    """Развернуть одну выгрузку обратно в записи (для сверки; сайт делает то же на JS)."""
    template = history.get('link')
    out = {}
    for fid, flat in history['flats'].items():
        if not any(start <= index <= end for start, end in flat['r']):
            continue
        price = next(p for p in reversed(flat['pr']) if p[0] <= index)
        area = next(a for a in reversed(flat['a']) if a[0] <= index)
        out[fid] = {
            'project': history['projects'][flat['p']],
            'link': flat.get('l') or (template.replace('{id}', fid) if template else ''),
            'area': area[1], 'price': price[1], 'full': price[2],
            'b': flat.get('b', ''), 's': flat.get('s', ''), 'f': flat.get('f'), 'fc': flat.get('fc'),
        }
    return out


def load(path):
    if not os.path.exists(path):
        return empty_history()
    with open(path, encoding='utf-8') as fh:
        history = json.load(fh)
    template = history.get('link')
    if template:
        for fid, flat in history['flats'].items():
            flat.setdefault('l', template.replace('{id}', fid))
    return history


def save(history, path):
    """Отдельная строка на квартиру — чтобы добавление выгрузки было читаемо в git diff."""
    compact_links(history)
    head = json.dumps({k: history[k] for k in ('version', 'dates', 'link', 'projects')},
                      ensure_ascii=False, separators=(',', ':'))[:-1]
    flats = sorted(history['flats'].items(), key=lambda kv: (len(kv[0]), kv[0]))
    lines = [f'{json.dumps(fid)}:{json.dumps(flat, ensure_ascii=False, separators=(",", ":"))}' for fid, flat in flats]
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        fh.write(head + ',\n"flats":{\n' + ',\n'.join(lines) + '\n}}\n')
    os.replace(tmp, path)


# ------------------------------------------------------------------ команды

def snapshot_date_of(path, explicit):
    found = explicit or date_from_filename(path)
    if not found:
        found = date.today().isoformat()
        print(f'{path}: даты в имени нет, беру сегодняшнюю {found}', file=sys.stderr)
    return found


def cmd_build(args):
    history = empty_history()
    files = sorted(((snapshot_date_of(p, None), p) for p in args.csv), key=lambda t: t[0])
    for snapshot_date, path in files:
        add_snapshot(history, snapshot_date, read_csv(path))
    save(history, args.out)
    print(f'{args.out}: выгрузок {len(history["dates"])}, квартир {len(history["flats"])}')


def cmd_add(args):
    history = load(args.out)
    snapshot_date = snapshot_date_of(args.csv, args.date)
    records = read_csv(args.csv)
    try:
        add_snapshot(history, snapshot_date, records)
    except ValueError as error:
        sys.exit(f'Не добавлено: {error}')
    save(history, args.out)
    print(f'{args.out}: добавлена выгрузка {snapshot_date} ({len(records)} квартир), всего выгрузок {len(history["dates"])}')


def cmd_check(args):
    """Каждая строка каждого CSV должна совпасть с развёрнутой историей.

    Постоянные поля сравниваются с последним непустым значением по всем выгрузкам — так их хранит история.
    """
    history = load(args.out)
    files = sorted(((snapshot_date_of(p, None), p) for p in args.csv), key=lambda t: t[0])
    latest_static = {}
    for _, path in files:
        for r in read_csv(path):
            current = latest_static.setdefault(r['flat_id'], {})
            current['project'] = r['project']
            for key in ('link', *STATIC_TEXT):
                if r[key]:
                    current[key] = r[key]
            for key in STATIC_NUMBER:
                if r[key] is not None:
                    current[key] = as_number(r[key])
    problems = 0
    for snapshot_date, path in files:
        index = history['dates'].index(snapshot_date)
        expanded = snapshot_rows(history, index)
        records = {}
        for r in read_csv(path):
            records.setdefault(r['flat_id'], r)
        if set(records) != set(expanded):
            problems += 1
            print(f'{snapshot_date}: состав квартир не совпал ({len(records)} в CSV, {len(expanded)} в истории)')
        for fid, r in records.items():
            got = expanded.get(fid)
            if not got:
                continue
            want = {'project': r['project'], 'area': as_number(r['area']), 'price': r['price'], 'full': r['full'],
                    'link': latest_static[fid].get('link', ''), 'b': latest_static[fid].get('b', ''),
                    's': latest_static[fid].get('s', ''), 'f': latest_static[fid].get('f'),
                    'fc': latest_static[fid].get('fc')}
            diff = {k: (want[k], got[k]) for k in want if want[k] != got[k]}
            if diff:
                problems += 1
                if problems <= 10:
                    print(f'{snapshot_date} {fid}: {diff}')
    rows = sum(len(read_csv(p)) for _, p in files)
    print(f'Сверено выгрузок {len(files)}, строк {rows}: ' + ('расхождений нет' if not problems else f'расхождений {problems}'))
    return 1 if problems else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', default=DEFAULT_PATH, help='файл истории (по умолчанию data/history.json)')
    sub = parser.add_subparsers(dest='command', required=True)
    p_build = sub.add_parser('build', help='собрать историю из CSV-выгрузок')
    p_build.add_argument('csv', nargs='+')
    p_add = sub.add_parser('add', help='добавить новую выгрузку')
    p_add.add_argument('csv')
    p_add.add_argument('--date', help='дата выгрузки ГГГГ-ММ-ДД, если её нет в имени файла')
    p_check = sub.add_parser('check', help='сверить историю с CSV')
    p_check.add_argument('csv', nargs='+')
    args = parser.parse_args()
    if args.command == 'build':
        cmd_build(args)
    elif args.command == 'add':
        cmd_add(args)
    else:
        sys.exit(cmd_check(args))


if __name__ == '__main__':
    main()
