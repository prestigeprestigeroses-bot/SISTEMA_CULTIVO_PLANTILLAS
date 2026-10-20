const test = require('node:test');
const assert = require('node:assert/strict');
const { P1_ROWS, P2_ROWS, defaultRecordsForFarm } = require('../src/defaults');

test('P2 conserva el orden exacto y las dos producciones', () => {
  const records = defaultRecordsForFarm('F2');
  assert.equal(records.length, 32);
  assert.deepEqual(records.map(({ production, block, variety }) => [production, block, variety]), [
    [1, '3', 'FREEDOM'], [1, '4', 'FREEDOM'], [1, '5', 'FREEDOM'],
    [1, '6', 'FREEDOM'], [1, '8', 'FREEDOM'],
    [1, '1', 'VENDELA'], [1, '1', 'PINK FLOYD'],
    [1, '2', 'CORAL REFF'], [1, '2', 'HUMMER'], [1, '2', 'SWAN'], [1, '2', 'MOMENTUM'],
    [1, '3', 'MOMENTUM'], [1, '3', 'QUICK SAND'], [1, '3', 'PINK FLOYD'],
    [1, '4', 'HILUX'], [1, '7', 'CANDLELIGHT'], [1, '7', 'DEEP PURPLE'],
    [1, '8', 'STAR PLATINUM'], [1, '8', 'SUMMERSAND'], [1, '8', 'MOMENTUM'], [1, '8', 'HIGH MAGIC'],
    [2, '9', 'FREEDOM'], [2, '10', 'FREEDOM'], [2, '13', 'FREEDOM'],
    [2, '10', 'SHIMMER'],
    [2, '11', 'PINK MONDIAL'], [2, '11', 'WHITE OHARA'], [2, '11', 'PINK OHARA'], [2, '11', 'MONDIAL'],
    [2, '12', 'MONDIAL'], [2, '12', 'BLESSING'], [2, '12', 'SUMMERSAND'],
  ]);
  assert.equal(new Set(records.map((row) => row.templateKey)).size, P2_ROWS.length);
  assert.ok(records.every((row) => row.days.length === 7));
  assert.ok(records.every((row) => row.days.every((day) => day.projected === 0 && day.actual === 0)));
});

test('P1 conserva ambas producciones y el orden de las imágenes', () => {
  const records = defaultRecordsForFarm('F1');
  assert.equal(records.length, 30);
  assert.deepEqual(records.map(({ production, block, variety }) => [production, block, variety]), [
    [1, '1-A', 'FREEDOM'], [1, '1', 'FREEDOM'], [1, '2', 'FREEDOM'],
    [1, '5', 'DANCING RED'], [1, '6', 'FREEDOM'],
    [1, '5', 'EXPLORER'], [1, '5', 'MONDIAL'], [1, '5', 'QUICK SAND'],
    [1, '5', 'QUEEN BERRY'], [1, '5', 'PINK MONDIAL'],
    [2, '3', 'FREEDOM'], [2, '4', 'FREEDOM'], [2, '12', 'FREEDOM'],
    [2, '7', 'MONDIAL'], [2, '7', 'MOODY BLUE'], [2, '7', 'QUEEN BERRY'], [2, '7', 'MOMENTUM'],
    [2, '8', 'YELLOW BIKINI'], [2, '8', 'TIFFANY'], [2, '8', 'QUICK SAND'], [2, '8', 'VENDELA'],
    [2, '9', 'VENDELA'], [2, '9', 'MONDIAL'], [2, '9', 'CORAL REEF'], [2, '9', 'PINK FLOYD'],
    [2, '10', 'MONDIAL'], [2, '10', 'HUMMER'], [2, '10', 'HILUX'], [2, '10', 'BLESSING'],
    [2, '11', 'VENDELA'],
  ]);
  assert.equal(new Set(records.map((row) => row.templateKey)).size, P1_ROWS.length);
  assert.ok(records.every((row) => row.days.length === 7));
});
