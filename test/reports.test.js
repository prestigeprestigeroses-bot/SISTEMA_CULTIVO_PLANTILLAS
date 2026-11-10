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

test('Excel P1 usa solo el inventario ramos del día consultado y conserva el histórico', async () => {
  const template = inventoryTemplate('p1', 'F1');
  const data = blankInventory();
  data.processed['9:0:B'] = 2;
  data.processed['10:0:B'] = 3;
  data.bulk['0:28'] = 1;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildInventoryWorkbook({ farm: p1, template,
    year: 2026, month: 11, data, processedDay: 10 }));
  const summary = workbook.getWorksheet('Resumen');
  assert.equal(summary.getCell('B5').value, 18);
  assert.equal(summary.getCell('B6').value, template.bulk[0].stemsPerBunch);
  assert.equal(summary.getCell('B8').value, 18 + template.bulk[0].stemsPerBunch);
  const ramos = workbook.getWorksheet('Inventario ramos');
  assert.equal(ramos.getCell('A7').value, 'TOTAL DÍA 10');
  assert.equal(ramos.getCell('G7').value, 18);
  assert.equal(ramos.getCell('A8').value, 'HISTÓRICO 31 DÍAS');
  assert.equal(ramos.getCell('G8').value, 30);
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

test('Excel total finca P1 suma cada variedad entre sus dos inventarios sin mezclar presentaciones', async () => {
  const ownTemplate = inventoryTemplate('p1', 'F1');
  const own = blankInventory();
  own.processed['1:0:B'] = 2; // FREEDOM: 2 × 6 tallos.
  own.bulk['0:1'] = 2; // FREEDOM CORTO: 2 × 25 tallos.
  own.bulk['0:FN'] = 7; // FN son tallos directos.
  own.guard['0:2'] = 3; // FREEDOM CORTO: 3 × 25 tallos.
  const fromP2Template = inventoryTemplate('p1_p2', 'F1');
  const fromP2 = blankInventory();
  fromP2.bulk['0:1'] = 4;
  fromP2.bulk['0:FN'] = 11;
  const summaries = [
    { label: ownTemplate.label, summary: inventoryMonthSummary(ownTemplate, own, 2026, 10) },
    { label: fromP2Template.label, summary: inventoryMonthSummary(fromP2Template, fromP2, 2026, 10) },
  ];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildFarmInventoryWorkbook({ farm: p1, year: 2026, month: 10, summaries }));
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Total finca', 'Por variedad']);
  const sheet = workbook.getWorksheet('Por variedad');
  const rowFor = (name) => sheet.getRows(5, sheet.rowCount - 4).find((row) => row.getCell(1).value === name);
  assert.equal(sheet.getCell('B4').value, 'Inventario P1');
  assert.equal(sheet.getCell('C4').value, 'Flor que amanece de P2');
  assert.deepEqual([rowFor('FREEDOM').getCell(2).value, rowFor('FREEDOM').getCell(3).value, rowFor('FREEDOM').getCell(4).value], [12, 0, 12]);
  assert.deepEqual([rowFor('FREEDOM CORTO').getCell(2).value, rowFor('FREEDOM CORTO').getCell(3).value, rowFor('FREEDOM CORTO').getCell(4).value], [132, 111, 243]);
  assert.deepEqual([rowFor('TOTAL FINCA').getCell(2).value, rowFor('TOTAL FINCA').getCell(3).value, rowFor('TOTAL FINCA').getCell(4).value], [144, 111, 255]);
  const main = workbook.getWorksheet('Total finca');
  const totalRow = (label) => main.getRows(5, main.rowCount - 4).find((row) => row.getCell(1).value === label);
  assert.equal(totalRow('TOTAL INVENTARIO P1').getCell(3).value, 144);
  assert.equal(totalRow('TOTAL FLOR QUE AMANECE DE P2').getCell(3).value, 111);
  assert.equal(totalRow('TOTAL FINCA').getCell(3).value, 255);
});

test('Excel total finca P2 suma granel y guarde por variedad y omite filas retiradas', async () => {
  const farm = { id: 2, code: 'F2', name: 'Finca P2' };
  const template = inventoryTemplate('p2', 'F2');
  const data = blankInventory();
  data.bulk['0:1'] = 2;
  data.guard['0:2'] = 3;
  data.guard['21:1'] = 8; // Fila retirada; no se cuenta.
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildFarmInventoryWorkbook({ farm, year: 2026, month: 10,
    summaries: [{ label: template.label, summary: inventoryMonthSummary(template, data, 2026, 10) }] }));
  const sheet = workbook.getWorksheet('Por variedad');
  assert.equal(sheet.getCell('B4').value, 'TOTAL TALLOS');
  assert.equal(sheet.getCell('A5').value, 'FREEDOM CORTO');
  assert.equal(sheet.getCell('B5').value, 125);
  assert.equal(sheet.getCell('B6').value, 125);
  const main = workbook.getWorksheet('Total finca');
  const totalRow = (label) => main.getRows(5, main.rowCount - 4).find((row) => row.getCell(1).value === label);
  assert.equal(totalRow('TOTAL INVENTARIO P2').getCell(3).value, 125);
  assert.equal(totalRow('TOTAL FINCA').getCell(3).value, 125);
});
