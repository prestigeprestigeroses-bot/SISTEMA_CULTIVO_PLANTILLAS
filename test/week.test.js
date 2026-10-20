const test = require('node:test');
const assert = require('node:assert/strict');
const { getIsoWeekParts, isoWeekStart, assertWeek } = require('../src/week');

test('calcula semana ISO al cruzar de año', () => {
  assert.deepEqual(getIsoWeekParts(new Date(2027, 0, 1)), { year: 2026, week: 53 });
});

test('obtiene el lunes de una semana ISO', () => {
  assert.equal(isoWeekStart(2026, 43), '2026-10-19');
});

test('valida el rango de semana', () => {
  assert.deepEqual(assertWeek('2026', '43'), { year: 2026, week: 43 });
  assert.throws(() => assertWeek('2026', '0'));
});
