// Блок «Изменения относительно выбранной выгрузки»: вкладки «Изменили цену», «Новые», «Исчезли».
// Дата выгрузки и дата сравнения — только у этого блока; общие фильтры (проект, дом, поиск, площадь, цена) учитываются.
// Таблицы — те же, что в блоке «Квартиры»: миниатюры, сортировка, страницы, клик открывает панель квартиры.

import { compareSnapshots } from './analytics.js';
import { el } from './dom.js';

export const CHANGE_TABS = {
  changed: { emptyText: 'Цены не менялись' },
  new: { emptyText: 'Новых квартир нет' },
  gone: { emptyText: 'Исчезнувших квартир нет' },
};

// createTable(options) — таблица квартир с общей панелью (см. flats-block.js).
export function createChangesBlock({ els, createTable }) {
  const tables = Object.fromEntries(Object.entries(CHANGE_TABS).map(([kind, tab]) => [
    kind,
    createTable({ kind, idPrefix: `changes-${kind}`, emptyText: tab.emptyText, source: 'changes' }),
  ]));
  let currentTab = null;
  // Фильтры или даты изменились — каждая вкладка при следующем показе начинается с первой страницы.
  const needsReset = new Set();

  // current / compare — выгрузки { date, label }; latest — текущая дата блока совпадает с последней выгрузкой.
  function render({ current, compare, currentRows, compareRows, filters, tab, latest, resetPage = false }) {
    if (resetPage) Object.keys(tables).forEach(kind => needsReset.add(kind));
    if (!current || !compare || current.date === compare.date) {
      els.hint.textContent = 'Выбери текущую выгрузку и более раннюю выгрузку для сравнения.';
      els.body.replaceChildren(el('p', 'muted', 'Для сравнения нужна минимум одна более ранняя выгрузка.'));
      return;
    }
    const { changed, fresh, gone } = compareSnapshots(currentRows, compareRows, filters);
    els.hint.textContent = `Сравнение ${current.label} с ${compare.label}: ${changed.length} изменили цену, ${fresh.length} новых, ${gone.length} исчезли.`;
    const rows = { changed, new: fresh, gone }[tab];
    currentTab = tab;
    tables[tab].render(els.body, { rows, latest, resetPage: needsReset.delete(tab) });
  }

  // Ссылка с from=changes: открыть квартиру из строк текущей вкладки (страница со строкой выбирается сама).
  // Квартиры среди строк нет — false, тогда панель открывается как обычно.
  function openFlat(id) {
    const table = currentTab && tables[currentTab];
    if (!table?.has(id)) return false;
    table.open(id);
    return true;
  }

  return { render, openFlat };
}
