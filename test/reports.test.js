const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { blankFieldData } = require('../src/field-data');
const { blankInventory, inventoryTemplate, inventoryMonthSummary } = require('../src/inventory');
const { buildFieldWorkbook, buildInventoryWorkbook, buildFarmInventoryWorkbook } = require('../src/reports');

const p1 = { id: 1, code: 'F1', name: 'Finca P1' };

test('Excel de temperatura y riego conserva datos numéricos y totales', async () => {
  const data = blankFieldData();
  data.beds = 100;
  data.climate.minTemp[0] = 10;
  data.climate.minTemp[1] = 20;
  data.water.initial[0] = 100;
  data.water.final[0] = 104;
  const climate = new ExcelJS.Workbook();
  await climate.xlsx.load(await buildFieldWorkbook({ farm: p1, year: 2026, week: 43, data, kind: 'climate' }));
  assert.equal(climate.worksheets[0].getCell('B5').value, 10);
  assert.equal(climate.worksheets[0].getCell('I5').value, 15);
  const water = new ExcelJS.Workbook();
  await water.xlsx.load(await buildFieldWorkbook({ farm: p1, year: 2026, week: 43, data, kind: 'water' }));
  assert.equal(water.worksheets[0].getCell('B7').value, 4);
  assert.equal(water.worksheets[0].getCell('I8').value, 40);
});

test('Excel de inventario incluye FN y total de finca', async () => {
  const template = inventoryTemplate('p1_p2', 'F1');
  const data = blankInventory();
  data.bulk['0:1'] = 2;
  data.bulk['0:FN'] = 11;
  data.bulk['23:1'] = 5; // Fila Mondial retirada; se conserva en datos, no en el reporte.
  data.bulk['24:1'] = 6;
  const buffer = await buildInventoryWorkbook({ farm: p1, template, year: 2026, month: 10, data });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Resumen', 'Flor a granel']);
  assert.equal(workbook.getWorksheet('Flor a granel').getCell('A6').value, 'FN');
  assert.equal(workbook.getWorksheet('Flor a granel').getCell('C4').value, 'TABACOS');
  assert.equal(workbook.getWorksheet('Flor a granel').getCell('D4').value, 'TALLOS / TABACO');
  assert.equal(workbook.getWorksheet('Flor a granel').getCell('A7').value, 'TOTAL MES');
  assert.equal(workbook.getWorksheet('Flor a granel').getCell('E7').value, 61);
  const total = inventoryMonthSummary(template, data, 2026, 10).stems;
  assert.equal(workbook.getWorksheet('Resumen').getCell('B6').value, total);
  const farm = new ExcelJS.Workbook();
  await farm.xlsx.load(await buildFarmInventoryWorkbook({ farm: p1, year: 2026, month: 10,
    summaries: [{ label: template.label, summary: inventoryMonthSummary(template, data, 2026, 10) }] }));
  assert.equal(farm.worksheets[0].getCell('C6').value, total);
});

test('Excel P1 distingue grado y tabacos en granel y guarde', async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildInventoryWorkbook({ farm: p1, template: inventoryTemplate('p1', 'F1'),
    year: 2026, month: 10, data: blankInventory() }));
  assert.equal(workbook.getWorksheet('Inventario ramos').getCell('D4').value, 'GRADO');
  assert.equal(workbook.getWorksheet('Flor a granel').getCell('C4').value, 'TABACOS');
  assert.equal(workbook.getWorksheet('Flor de guarde').getCell('C4').value, 'TABACOS');
  assert.equal(workbook.getWorksheet('Flor de guarde').getCell('D4').value, 'TALLOS / TABACO');
});

test('Excel de guarde P2 usa la nueva lista sin exportar variedades retiradas', async () => {
  const template = inventoryTemplate('p2', 'F2');
  const data = blankInventory();
  data.guard['21:1'] = 3;
  data.guard['24:1'] = 4;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildInventoryWorkbook({ farm: { id: 2, code: 'F2', name: 'Finca P2' },
    template, year: 2026, month: 10, data }));
  const names = [];
  workbook.getWorksheet('Flor de guarde').eachRow((row) => names.push(row.getCell(2).value));
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Resumen', 'Flor a granel', 'Flor de guarde']);
  assert.ok(names.includes('HIGH MAGIC'));
  assert.ok(!names.includes('FREEDOM RP'));
  assert.equal(inventoryMonthSummary(template, data, 2026, 10).sections.guard.stems, 100);
});
