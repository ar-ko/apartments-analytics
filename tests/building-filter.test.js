import { buildingOptionValue, buildingPairs, buildingsOfProject, groupBuildings, parseBuildingOption, resolveBuilding } from '../js/building-filter.js';
import { flat } from './fixtures.js';
import { assert, test } from './runner.js';

const PAIRS = buildingPairs([
  flat({ flat_id: '1', project: 'Зарека', building_name: 'Дом 1' }),
  flat({ flat_id: '2', project: 'Зарека', building_name: 'Дом 10' }),
  flat({ flat_id: '3', project: 'Зарека', building_name: 'Дом 2' }),
  flat({ flat_id: '4', project: 'Речной порт', building_name: 'Дом 1' }),
  flat({ flat_id: '5', project: 'Республики 205', building_name: 'Дом 3-1' }),
  flat({ flat_id: '6', project: 'Республики 205', building_name: 'Дом 3-1' }),
  flat({ flat_id: '7', project: 'Республики 205', building_name: '' }),
]);

test('пары «проект — дом» без повторов, по проектам и номерам; группы для списка без проекта', () => {
  assert.deepEqual(PAIRS.map(p => `${p.project}/${p.name}`), ['Зарека/Дом 1', 'Зарека/Дом 2', 'Зарека/Дом 10', 'Республики 205/Дом 3-1', 'Речной порт/Дом 1']);
  assert.deepEqual(groupBuildings(PAIRS), [
    { project: 'Зарека', names: ['Дом 1', 'Дом 2', 'Дом 10'] },
    { project: 'Республики 205', names: ['Дом 3-1'] },
    { project: 'Речной порт', names: ['Дом 1'] },
  ]);
  assert.deepEqual(buildingsOfProject(PAIRS, 'Речной порт'), ['Дом 1']);
});

test('значение опции однозначно задаёт пару «проект + дом»', () => {
  const value = buildingOptionValue('Речной порт', 'Дом 1');
  assert.deepEqual(parseBuildingOption(value), { project: 'Речной порт', name: 'Дом 1' });
  assert.ok(value !== buildingOptionValue('Зарека', 'Дом 1'));
  assert.equal(parseBuildingOption('Дом 1'), null, 'обычное значение — не пара');
  assert.equal(parseBuildingOption('all'), null);
});

test('дом → проект: старая ссылка с одним домом, неоднозначный дом, дом не из выбранного проекта', () => {
  assert.deepEqual(resolveBuilding(PAIRS, 'all', 'Дом 3-1'), { project: 'Республики 205', building: 'Дом 3-1' }, 'дом есть ровно в одном проекте');
  assert.deepEqual(resolveBuilding(PAIRS, 'all', 'Дом 1'), { project: 'all', building: 'all' }, 'дом есть в нескольких проектах — игнорируется');
  assert.deepEqual(resolveBuilding(PAIRS, 'all', 'Дом 99'), { project: 'all', building: 'all' });
  assert.deepEqual(resolveBuilding(PAIRS, 'Речной порт', 'Дом 1'), { project: 'Речной порт', building: 'Дом 1' });
  assert.deepEqual(resolveBuilding(PAIRS, 'Речной порт', 'Дом 2'), { project: 'Речной порт', building: 'all' }, 'дома нет в проекте — «Все дома»');
  assert.deepEqual(resolveBuilding(PAIRS, 'Зарека', 'all'), { project: 'Зарека', building: 'all' });
  assert.deepEqual(resolveBuilding(PAIRS, 'all', undefined), { project: 'all', building: 'all' });
});
