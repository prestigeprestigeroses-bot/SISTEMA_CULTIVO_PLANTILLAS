const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { defaultRecordsForFarm } = require('../src/defaults');
const { buildProjectionWorkbook } = require('../src/excel');

for (const [code, name] of [['F1', 'Finca P1'], ['F2', 'Finca P2']]) {
  test(`Excel ${name} incluye Rojo y Color por día y semana`, async () => {
    const records = defaultRecordsForFarm(code);
    const red = records.find((record) => record.production === 1 && record.variety === 'FREEDOM');
    const otherRed = records.find((record) => record.production === 2 && record.variety === 'FREEDOM');
    const color = records.find((record) => record.production === 1 && record.variety !== 'FREEDOM');
    const otherColor = records.find((record) => record.production === 2 && record.variety !== 'FREEDOM');
    red.days[0] = { projected: 10, actual: 8 };
    otherRed.days[1] = { projected: 7, actual: 6 };
    color.days[0] = { projected: 20, actual: 18 };
    otherColor.days[1] = { projected: 12, actual: 11 };

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildProjectionWorkbook({ farm: { code, name }, year: 2026, week: 44, records }));
    const sheet = workbook.getWorksheet('Semana 44');
    const findRow = (label) => sheet.getRows(1, sheet.rowCount).find((row) => row.getCell(1).value === label);
    const rojo = findRow('TOTAL ROJO · FREEDOM');
    const colorRow = findRow('TOTAL COLOR · OTRAS VARIEDADES');
    const total = findRow('TOTAL SEMANA');

    assert.ok(findRow('TOTAL PRODUCCIÓN 1'));
    assert.ok(findRow('TOTAL PRODUCCIÓN 2'));
    assert.ok(rojo);
    assert.ok(colorRow);
    assert.deepEqual([rojo.getCell(3).value, rojo.getCell(4).value, rojo.getCell(5).value, rojo.getCell(6).value], [10, 8, 7, 6]);
    assert.deepEqual([colorRow.getCell(3).value, colorRow.getCell(4).value, colorRow.getCell(5).value, colorRow.getCell(6).value], [20, 18, 12, 11]);
    assert.deepEqual([rojo.getCell(17).value, rojo.getCell(18).value, rojo.getCell(19).value], [17, 14, null]);
    assert.deepEqual([colorRow.getCell(17).value, colorRow.getCell(18).value, colorRow.getCell(19).value], [32, 29, null]);
    assert.deepEqual([total.getCell(17).value, total.getCell(18).value], [49, 43]);
    assert.ok(rojo.number < colorRow.number && colorRow.number < total.number);
  });
}
