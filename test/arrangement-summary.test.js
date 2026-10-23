const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { defaultRecordsForFarm } = require('../src/defaults');
const { buildProjectionWorkbook } = require('../src/excel');

test('P1 precarga las metas de ambas imágenes en orden y P2 no las recibe', () => {
  const p1 = defaultRecordsForFarm('F1');
  assert.deepEqual(p1.slice(0, 10).map((row) => row.weeklyTarget),
    [1349, 8760, 8754, 7, 9183, 68, 166, 67, 2623, 2855]);
  assert.deepEqual(p1.slice(10).map((row) => row.weeklyTarget),
    [8754, 8961, 9607, 4961, 764, 1835, 2554, 3142, 3559, 981,
      4967, 4075, 887, 1923, 1902, 1875, 2226, 1611, 417, 4634]);
  assert.equal(p1.slice(0, 10).reduce((sum, row) => sum + row.weeklyTarget, 0), 33832);
  // La cifra 60.881 de la foto omite la primera fila de 8.754.
  assert.equal(p1.slice(10).reduce((sum, row) => sum + row.weeklyTarget, 0), 69635);
  assert.ok(defaultRecordsForFarm('F2').every((row) => row.weeklyTarget === null));
});

test('Excel P1 muestra proyección manual, diferencia y arreglos a hoy en ambas producciones', async () => {
  const records = defaultRecordsForFarm('F1');
  records[0].weeklyTarget = 1349;
  records[0].days[0].actual = 1480;
  records[0].arrangements = 4;
  records[10].weeklyTarget = 8754;
  records[10].days[0].actual = 7075;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildProjectionWorkbook({ farm: { code: 'F1', name: 'Finca P1' }, year: 2026, week: 43, records }));
  const summary = workbook.getWorksheet('Resumen arreglos P1');
  assert.ok(summary);
  assert.equal(summary.getCell('E4').value, -131);
  assert.equal(summary.getCell('G4').value, -3);
  assert.equal(summary.getCell('F4').value, 4);
  assert.equal(summary.getCell('A15').value, 'PRODUCCIÓN 2');
  assert.equal(summary.getCell('E16').value, 1679);
  assert.equal(summary.getCell('G16').value, 33);
  assert.equal(summary.getCell('C5').value, 8760);
});

test('Excel P2 no agrega el resumen de arreglos de P1', async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildProjectionWorkbook({ farm: { code: 'F2', name: 'Finca P2' },
    year: 2026, week: 43, records: defaultRecordsForFarm('F2') }));
  assert.equal(workbook.getWorksheet('Resumen arreglos P1'), undefined);
});
