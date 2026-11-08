// Ряды цен для графика квартиры. Чистые функции без DOM.
// Недели, когда квартиры не было в выгрузке, рисуются пунктиром на последних известных значениях,
// а при возвращении линия ступенькой переходит к новым значениям.

// Отрезки подряд идущих известных значений: [[начало, конец], …] по индексам выгрузок.
export function presenceRuns(values) {
  const runs = [];
  let start = null;
  values.forEach((v, i) => {
    if (v != null && start === null) start = i;
    if (v == null && start !== null) { runs.push([start, i - 1]); start = null; }
  });
  if (start !== null) runs.push([start, values.length - 1]);
  return runs;
}

// Пропуски между отрезками: { from — последняя известная неделя, to — неделя возвращения }.
export function gapsBetween(runs) {
  const gaps = [];
  for (let j = 0; j + 1 < runs.length; j++) gaps.push({ from: runs[j][1], to: runs[j + 1][0] });
  return gaps;
}

// Значение для подсказки на неделе i: известно или «Неизвестно».
export function pointAt(eff, full, area, i) {
  if (eff[i] == null) return { known: false };
  const disc = full[i] ? (1 - eff[i] / full[i]) * 100 : 0;
  return { known: true, eff: eff[i], full: full[i], disc, m2: area[i] ? eff[i] / area[i] : null };
}

// Ступенчатые линии в координатах графика.
// x(i) — координата недели i, y(v) — координата цены, endX — правый край для отрезка, который доходит до последней выгрузки.
export function stepPaths(values, runs, x, y, endX) {
  const r = n => n.toFixed(1);
  const last = runs.length - 1;
  const n = values.length;
  const solid = runs.map(([a, b], j) => {
    let d = `M${r(x(a))},${r(y(values[a]))}`;
    for (let i = a + 1; i <= b; i++) d += `H${r(x(i))}V${r(y(values[i]))}`;
    return d + `H${r(j === last && b === n - 1 ? endX : x(b))}`;
  }).join('');
  const dashed = gapsBetween(runs)
    .map(({ from, to }) => `M${r(x(from))},${r(y(values[from]))}H${r(x(to))}V${r(y(values[to]))}`)
    .join('');
  return { solid, dashed };
}
