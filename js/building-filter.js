// Связка фильтров «Проект — Дом». Названия домов повторяются в разных проектах («Дом 1»),
// поэтому дом всегда выбирается вместе с проектом. Чистые функции без DOM.

const SEPARATOR = '\u001f';

// Пары (проект, дом) из строк выгрузок, по проектам и по номеру дома.
export function buildingPairs(rows) {
  const seen = new Map();
  for (const row of rows) {
    if (!row.project || !row.building_name) continue;
    seen.set(`${row.project}${SEPARATOR}${row.building_name}`, { project: row.project, name: row.building_name });
  }
  return [...seen.values()].sort((a, b) => a.project.localeCompare(b.project, 'ru') || a.name.localeCompare(b.name, 'ru', { numeric: true }));
}

// Дома по проектам — для списка с группами, когда проект не выбран.
export function groupBuildings(pairs) {
  const groups = new Map();
  for (const { project, name } of pairs) {
    if (!groups.has(project)) groups.set(project, []);
    groups.get(project).push(name);
  }
  return [...groups].map(([project, names]) => ({ project, names }));
}

export function buildingsOfProject(pairs, project) {
  return pairs.filter(p => p.project === project).map(p => p.name);
}

// Значение опции в списке с группами однозначно задаёт пару «проект + дом».
export function buildingOptionValue(project, name) {
  return `${project}${SEPARATOR}${name}`;
}

export function parseBuildingOption(value) {
  const i = String(value).indexOf(SEPARATOR);
  return i < 0 ? null : { project: value.slice(0, i), name: value.slice(i + 1) };
}

// Согласованная пара фильтров. Проект выбран — дом должен быть в нём, иначе «Все дома».
// Проект не выбран, а дом задан (старая ссылка): дом есть ровно в одном проекте — выставляем проект,
// в нескольких или ни в одном — дом игнорируется.
export function resolveBuilding(pairs, project, building) {
  if (!building || building === 'all') return { project, building: 'all' };
  if (project && project !== 'all') {
    return pairs.some(p => p.project === project && p.name === building) ? { project, building } : { project, building: 'all' };
  }
  const owners = pairs.filter(p => p.name === building);
  return owners.length === 1 ? { project: owners[0].project, building } : { project: 'all', building: 'all' };
}
