const test = require('node:test');
const assert = require('node:assert/strict');
const { blankFieldData, derivedFieldData } = require('../src/field-data');
const db = require('../src/db');

test('P1 calcula diferencia de lecturas y litros por cama', () => {
  const data = blankFieldData();
  data.beds = 1523;
  data.water.initial = [344707, 345016, 345227, 345544, 345848, 346144, null];
  data.water.final = [345016, 345227, 345544, 345848, 346144, 346400, null];
  data.climate.minTemp = [null, 11.3, 11.9, 13.3, 10.7, 12.7, null];
  const result = derivedFieldData('F1', data);
  assert.deepEqual(result.daily, [309, 211, 317, 304, 296, 256, null]);
  assert.equal(result.totalDaily, 1693);
  assert.equal(Math.round(result.litersPerBed[0] * 100) / 100, 202.89);
  assert.equal(Math.round(result.totalLitersPerBed * 10) / 10, 1111.6);
  assert.equal(Math.round(result.climateAverage.minTemp * 10) / 10, 12);
});

test('P2 suma goteo y cacho y calcula promedio climático', () => {
  const data = blankFieldData();
  data.beds = 1313;
  data.water.drip = [102, 215, 114, 108, 102, 107, null];
  data.water.hose = [137, 70, 36, 274, 192, 140, null];
  data.climate.precipitation = [null, 5, 5, 0, 0, 0, null];
  const result = derivedFieldData('F2', data);
  assert.deepEqual(result.daily, [239, 285, 150, 382, 294, 247, null]);
  assert.equal(result.totalDaily, 1597);
  assert.equal(Math.round(result.totalLitersPerBed * 10) / 10, 1216.3);
  assert.equal(result.climateAverage.precipitation, 2);
});

test('registros ambientales se guardan por finca y semana', async () => {
  const data = blankFieldData();
  data.beds = 1523;
  data.water.initial[0] = 100;
  data.water.final[0] = 120;
  await db.saveFieldData(1, 2032, 4, data);
  const first = await db.getFieldData(1, 2032, 4);
  const other = await db.getFieldData(2, 2032, 4);
  assert.equal(first.saved, true);
  assert.equal(first.data.water.final[0], 120);
  assert.equal(other.saved, false);
  assert.equal(other.data.beds, 1313);
  assert.throws(() => derivedFieldData('F1', { ...data, water: { ...data.water, final: [90, ...data.water.final.slice(1)] } }), /final menor/);
});
