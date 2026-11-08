// Модель шахматки дома и навигация по ней. Чистые функции без DOM.
// Раскладка приходит готовой из flats.json: секции, ряды сверху вниз, клетки с позицией k и id квартиры.
// Ключ клетки — «секция|ряд|клетка» по индексам; клетка −1 — полоса «нет данных» на весь этаж.
//
// Столбцы. Двухуровневая квартира записана на этаж первого уровня и занимает этаж выше: её клетка высотой
// в два ряда (tall), а в ряду выше её столбец занят (up). Поэтому столбцы раскладываются снизу вверх: клетки
// ряда встают по порядку в свободные столбцы. Если выше этажей секции нет (второй уровень на кровле),
// клетка обычной высоты. Полоса этажа без данных сужается на занятые снизу столбцы и встаёт в первый свободный.

export function chessSections(building, flats) {
  return (building?.sections ?? []).map(sec => {
    const rows = (sec.rows ?? []).map(row => ({
      f: row.f,
      bar: row.bar || 0,
      barCol: 0,
      up: [],
      cells: (row.cells ?? []).map(c => {
        const flat = c.id ? flats.get(String(c.id)) ?? null : null;
        return { k: c.k ?? null, id: c.id ? String(c.id) : null, flat, status: flat ? flat.status : 'nodata', col: 0, tall: false };
      }),
    }));
    layoutColumns(rows);
    return { id: sec.id, n: String(sec.n), rows };
  });
}

function layoutColumns(rows) {
  const byFloor = new Map(rows.map(row => [row.f, row]));
  for (const row of [...rows].sort((a, b) => a.f - b.f)) {
    const taken = new Set(row.up);
    let col = 0;
    const nextFree = () => {
      while (taken.has(col)) col += 1;
      return col++;
    };
    const above = byFloor.get(row.f + 1);
    for (const cell of row.cells) {
      cell.col = nextFree();
      cell.tall = Boolean(above && cell.flat?.levels === 2);
      if (cell.tall) above.up.push(cell.col);
    }
    if (!row.cells.length && row.bar) {
      row.bar = Math.max(0, row.bar - row.up.length);
      row.barCol = nextFree();
    }
  }
}

// Число столбцов ряда: свои клетки, полоса и занятые снизу столбцы.
export function rowWidth(row) {
  return Math.max(0, ...row.cells.map(c => c.col + 1), ...row.up.map(c => c + 1), row.bar ? row.barCol + row.bar : 0);
}

export function slotKey(si, ri, ci) {
  return `${si}|${ri}|${ci}`;
}

export function parseSlot(key) {
  if (typeof key !== 'string') return null;
  const parts = key.split('|').map(Number);
  return parts.length === 3 && parts.every(Number.isInteger) ? { si: parts[0], ri: parts[1], ci: parts[2] } : null;
}

export function slotInfo(sections, key) {
  const p = parseSlot(key);
  const sec = p && sections[p.si];
  const row = sec?.rows[p.ri];
  if (!row) return null;
  if (p.ci < 0) return row.bar ? { ...p, sec, row, strip: true, cell: null, flat: null } : null;
  const cell = row.cells[p.ci];
  return cell ? { ...p, sec, row, strip: false, cell, flat: cell.flat } : null;
}

export function findSlot(sections, flatId) {
  for (let si = 0; si < sections.length; si++) {
    const rows = sections[si].rows;
    for (let ri = 0; ri < rows.length; ri++) {
      const ci = rows[ri].cells.findIndex(c => c.id === flatId);
      if (ci >= 0) return slotKey(si, ri, ci);
    }
  }
  return null;
}

export function maxFloor(sections) {
  return Math.max(0, ...sections.flatMap(sec => sec.rows.map(r => r.f)));
}

// Клетки по статусам для легенды; полосы «нет данных» на весь этаж не считаются.
export function statusCounts(sections) {
  const counts = { sale: 0, booked: 0, sold: 0, nodata: 0 };
  for (const sec of sections) for (const row of sec.rows) for (const cell of row.cells) counts[cell.status] += 1;
  return counts;
}

export function floorsText(row, cell) {
  return cell?.tall ? `${row.f}–${row.f + 1}` : String(row.f);
}

export function posText(sections, key) {
  const p = slotInfo(sections, key);
  if (!p) return '';
  return `секция ${p.sec.n} · ${floorsText(p.row, p.cell)} эт.` + (!p.strip && p.cell.k != null ? ` · поз. ${p.cell.k}` : '');
}

// Что видно в ряду ri: свои клетки, полоса и верхние половины двухуровневых квартир ряда ниже.
// Каждая цель — { key, col, span }.
function rowTargets(sections, si, ri) {
  const sec = sections[si];
  const row = sec.rows[ri];
  const list = row.cells.map((cell, ci) => ({ key: slotKey(si, ri, ci), col: cell.col, span: 1 }));
  if (!row.cells.length && row.bar) list.push({ key: slotKey(si, ri, -1), col: row.barCol, span: row.bar });
  const below = sec.rows[ri + 1];
  below?.cells.forEach((cell, ci) => { if (cell.tall) list.push({ key: slotKey(si, ri + 1, ci), col: cell.col, span: 1 }); });
  return list.sort((a, b) => a.col - b.col);
}

// Цель ряда в столбце col, иначе ближайшая (при равенстве — левая).
function targetAt(list, col) {
  let best = null;
  let bestGap = Infinity;
  for (const t of list) {
    const gap = col < t.col ? t.col - col : col >= t.col + t.span ? col - (t.col + t.span - 1) : 0;
    if (gap < bestGap) { best = t; bestGap = gap; }
  }
  return best?.key ?? null;
}

// Сосед в направлении dir: up / down — этаж выше или ниже в той же секции, тот же столбец, иначе ближайший;
// у двухуровневой квартиры «выше» — над её вторым уровнем.
// left / right — ближайшая по столбцу клетка ряда (с верхними половинами двухуровневых квартир ряда ниже);
// у двухуровневой квартиры — и ряда её второго уровня, при равном расстоянии свой ряд. На краю — соседняя
// секция, тот же или ближайший этаж.
// lastCol — столбец, с которого пришли на полосу, чтобы вернуться в него при уходе с неё.
export function neighbour(sections, key, dir, lastCol = 0) {
  const p = slotInfo(sections, key);
  if (!p) return null;
  const { si, ri, ci, sec } = p;
  if (dir === 'left' || dir === 'right') {
    const d = dir === 'left' ? -1 : 1;
    const from = ci >= 0 ? { col: p.cell.col, span: 1 } : { col: p.row.barCol, span: p.row.bar };
    let best = null;
    for (const r of p.cell?.tall ? [ri, ri - 1] : [ri]) {
      if (!sec.rows[r]) continue;
      for (const t of rowTargets(sections, si, r)) {
        const gap = d > 0 ? t.col - (from.col + from.span - 1) : from.col - (t.col + t.span - 1);
        if (gap > 0 && (!best || gap < best.gap)) best = { key: t.key, gap };
      }
    }
    if (best) return best.key;
    const next = sections[si + d];
    if (!next || !next.rows.length) return null;
    let nri = next.rows.findIndex(r => r.f === p.row.f);
    if (nri < 0) {
      nri = next.rows.reduce((best, r, i) => (Math.abs(r.f - p.row.f) < Math.abs(next.rows[best].f - p.row.f) ? i : best), 0);
    }
    const list = rowTargets(sections, si + d, nri);
    return list.length ? list[d > 0 ? 0 : list.length - 1].key : null;
  }
  if (dir !== 'up' && dir !== 'down') return null;
  const nri = dir === 'up' ? ri - (p.cell?.tall ? 2 : 1) : ri + 1;
  if (!sec.rows[nri]) return null;
  return targetAt(rowTargets(sections, si, nri), ci >= 0 ? p.cell.col : lastCol);
}
