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
  records[0].weeklyTarget = 1349;
  records[0].block = 'incorrecto';
  records[0].variety = 'OTRA';
  const saved = await db.replaceWeek({ farmId, year, week, weekStart, records });
  assert.equal(saved.length, 30);
  assert.equal(saved[0].block, '1-A');
  assert.equal(saved[0].variety, 'FREEDOM');
  assert.equal(saved[0].days[0].projected, 120);
  assert.equal(saved[0].days[0].actual, 90);
  assert.equal(saved[0].arrangements, 4);
  assert.equal(saved[0].weeklyTarget, 1349);
  await assert.rejects(
    db.replaceWeek({ farmId, year, week, weekStart, records: records.slice(1) }),
    /Plantilla Finca P1 inválida/,
  );
  const fetched = await db.getWeekWithDefaults(farmId, year, week);
  assert.equal(fetched.records[0].days[0].projected, 120);
  assert.equal(fetched.records[0].weeklyTarget, 1349);
  assert.equal(fetched.records.length, 30);
});

test('la meta manual del resumen solo se guarda para P1 y conserva las demás filas', async () => {
  const records = defaultRecordsForFarm('F1');
  records[0].weeklyTarget = null;
  records[1].weeklyTarget = 0;
  const saved = await db.replaceWeek({ farmId: 1, year: 2032, week: 8, weekStart: '2032-02-16', records });
  assert.equal(saved[0].weeklyTarget, null);
  assert.equal(saved[1].weeklyTarget, 0);
  assert.equal((await db.getWeekWithDefaults(1, 2032, 8)).records[0].weeklyTarget, 1349);
  const p2 = defaultRecordsForFarm('F2');
  p2[0].weeklyTarget = 999;
  const savedP2 = await db.replaceWeek({ farmId: 2, year: 2032, week: 8, weekStart: '2032-02-16', records: p2 });
  assert.equal(savedP2[0].weeklyTarget, null);
});
