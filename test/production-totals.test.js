const test = require('node:test');
const assert = require('node:assert/strict');
const calculateProductionTotals = require('../public/production-totals');

test('totales diarios y semanales separan solo FREEDOM del resto en ambas producciones', () => {
  const days = (monday, tuesday) => [monday, tuesday, ...Array.from({ length: 5 }, () => ({ projected: 0, actual: 0 }))];
  const totals = calculateProductionTotals([
    { production: 1, variety: 'FREEDOM', days: days({ projected: 10, actual: 8 }, { projected: 7, actual: 6 }) },
    { production: 2, variety: ' freedom ', days: days({ projected: 5, actual: 4 }, { projected: 3, actual: 2 }) },
    { production: 1, variety: 'MONDIAL', days: days({ projected: 20, actual: 18 }, { projected: 12, actual: 11 }) },
    { production: 2, variety: 'DANCING RED', days: days({ projected: 2, actual: 1 }, { projected: 4, actual: 3 }) },
  ]);
  assert.deepEqual(totals.red.days[0], { projected: 15, actual: 12 });
  assert.deepEqual(totals.color.days[0], { projected: 22, actual: 19 });
  assert.deepEqual(totals.total.days[1], { projected: 26, actual: 22 });
  assert.deepEqual([totals.red.projected, totals.red.actual], [25, 20]);
  assert.deepEqual([totals.color.projected, totals.color.actual], [38, 33]);
  assert.deepEqual([totals.total.projected, totals.total.actual], [63, 53]);
});

test('sin registros, los totales y los siete días son cero', () => {
  const totals = calculateProductionTotals([]);
  for (const category of Object.values(totals)) {
    assert.equal(category.projected, 0);
    assert.equal(category.actual, 0);
    assert.equal(category.days.length, 7);
    assert.ok(category.days.every((day) => day.projected === 0 && day.actual === 0));
  }
});
