const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db');
const { defaultRecordsForFarm } = require('../src/defaults');

test('P1 conserva la plantilla al guardar y no permite quitar filas', async () => {
  const farmId = 1;
  const year = 2031;
  const week = 7;
  const weekStart = '2031-02-10';
  const records = defaultRecordsForFarm('F1');
  records[0].days[0].projected = 120;
  records[0].days[0].actual = 90;
  records[0].arrangements = 4;
  records[0].block = 'incorrecto';
  records[0].variety = 'OTRA';
  const saved = await db.replaceWeek({ farmId, year, week, weekStart, records });
  assert.equal(saved.length, 30);
  assert.equal(saved[0].block, '1-A');
  assert.equal(saved[0].variety, 'FREEDOM');
  assert.equal(saved[0].days[0].projected, 120);
  assert.equal(saved[0].days[0].actual, 90);
  assert.equal(saved[0].arrangements, 4);
  await assert.rejects(
    db.replaceWeek({ farmId, year, week, weekStart, records: records.slice(1) }),
    /Plantilla Finca P1 inválida/,
  );
  const fetched = await db.getWeekWithDefaults(farmId, year, week);
  assert.equal(fetched.records[0].days[0].projected, 120);
  assert.equal(fetched.records.length, 30);
});
