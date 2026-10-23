const ExcelJS = require('exceljs');

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DAY_COLORS = [
  ['FFF3C34E', 'FFFFF0BA', 'FFFFFAF0'],
  ['FFACD384', 'FFE7F6D7', 'FFF8FCF3'],
  ['FF8ED3D2', 'FFDCF4F3', 'FFF3FBFA'],
  ['FFA8BFF0', 'FFE5ECFC', 'FFF6F8FD'],
  ['FFD0B6E9', 'FFF0E7F9', 'FFFBF7FE'],
  ['FFF0B993', 'FFFDE9D8', 'FFFDF8F3'],
  ['FFE9AAB1', 'FFFAE2E5', 'FFFFF6F6'],
];

function sumRecord(record, key) {
  return record.days.reduce((sum, day) => sum + Number(day[key] || 0), 0);
}

function addP1ArrangementSummary(workbook, records) {
  const sheet = workbook.addWorksheet('Resumen arreglos P1', {
    views: [{ state: 'frozen', ySplit: 2, xSplit: 2 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.columns = [{ width: 12 }, { width: 23 }, { width: 20 }, { width: 19 },
    { width: 25 }, { width: 18 }, { width: 19 }];
  sheet.mergeCells('A1:G1');
  sheet.getCell('A1').value = 'RESUMEN GENERAL · ARREGLOS P1';
  sheet.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16 };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B5946' } };
  sheet.getRow(1).height = 31;
  sheet.addRow(['BLOQUE', 'VARIEDAD', 'PROYECCIÓN SEMANAL', 'PRODUCCIÓN TOTAL',
    'ARREGLOS PRESUPUESTADOS', 'ARREGLOS REALES', 'ARREGLOS A HOY']);
  sheet.getRow(2).height = 35;
  sheet.getRow(2).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF172019' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8D34A' } };
  });
  for (const production of [1, 2]) {
    const group = records.filter((record) => record.production === production);
    sheet.addRow([`PRODUCCIÓN ${production}`]);
    sheet.mergeCells(sheet.lastRow.number, 1, sheet.lastRow.number, 7);
    const heading = sheet.lastRow.getCell(1);
    heading.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    heading.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF567327' } };
    let targetTotal = 0;
    let actualTotal = 0;
    let budgetTotal = 0;
    let realTotal = 0;
    let entered = 0;
    for (const record of group) {
      const target = record.weeklyTarget == null ? null : Number(record.weeklyTarget);
      const actual = sumRecord(record, 'actual');
      const budget = target === null ? null : target - actual;
      const real = Number(record.arrangements || 0);
      const row = sheet.addRow([record.block, record.variety, target, actual, budget, real,
        budget === null ? null : Math.round(budget / 51)]);
      row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBF5C8' } };
      row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: budget > 0 ? 'FFFDF0C2' : 'FFE8F1E9' } };
      row.getCell(7).font = { bold: true, color: { argb: budget < 0 ? 'FFB42332' : 'FF24533D' } };
      if (['FREEDOM', 'DANCING RED'].includes(record.variety)) row.getCell(2).font = { bold: true, color: { argb: 'FFBA2E35' } };
      if (target !== null) { targetTotal += target; budgetTotal += budget; entered += 1; }
      actualTotal += actual;
      realTotal += real;
    }
    const totalRow = sheet.addRow([`TOTAL PRODUCCIÓN ${production}`, null, targetTotal, actualTotal,
      entered ? budgetTotal : null, realTotal, entered ? Math.round(budgetTotal / 51) : null]);
    sheet.mergeCells(totalRow.number, 1, totalRow.number, 2);
    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: 'FF274C39' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F1E9' } };
    });
    totalRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5D36A' } };
  }
  return sheet;
}

async function buildProjectionWorkbook({ farm, year, week, records }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Flor Semanal';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(`Semana ${week}`, {
    views: [{ state: 'frozen', ySplit: 4, xSplit: 2 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const accent = farm.code === 'F2' ? 'FF19B7C9' : 'FFB8D34A';
  const accentDark = farm.code === 'F2' ? 'FF087B89' : 'FF567327';
  const pale = farm.code === 'F2' ? 'FFDDF6F8' : 'FFF1F6DA';
  const totalColumn = 19;

  sheet.mergeCells(1, 1, 1, totalColumn);
  const title = sheet.getCell(1, 1);
  title.value = `PROYECCIÓN SEMANAL DE FLOR · ${farm.name.toUpperCase()}`;
  title.font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accentDark } };
  title.alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(1).height = 34;

  sheet.mergeCells(2, 1, 2, totalColumn);
  sheet.getCell(2, 1).value = `Año ${year}  ·  Semana ISO ${week}`;
  sheet.getCell(2, 1).font = { bold: true, size: 12, color: { argb: 'FF263229' } };
  sheet.getCell(2, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pale } };
  sheet.getCell(2, 1).alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(2).height = 24;

  sheet.mergeCells(3, 1, 4, 1);
  sheet.mergeCells(3, 2, 4, 2);
  sheet.getCell(3, 1).value = 'BLOQUE';
  sheet.getCell(3, 2).value = 'VARIEDAD';
  DAYS.forEach((day, index) => {
    const startColumn = 3 + (index * 2);
    sheet.mergeCells(3, startColumn, 3, startColumn + 1);
    sheet.getCell(3, startColumn).value = day.toUpperCase();
    sheet.getCell(4, startColumn).value = 'PROYECCIÓN';
    sheet.getCell(4, startColumn + 1).value = 'REAL';
  });
  sheet.mergeCells(3, 17, 4, 17);
  sheet.mergeCells(3, 18, 4, 18);
  sheet.mergeCells(3, 19, 4, 19);
  sheet.getCell(3, 17).value = 'TOTAL PROYECCIÓN';
  sheet.getCell(3, 18).value = 'TOTAL REAL';
  sheet.getCell(3, 19).value = 'TOTAL ARREGLOS';

  for (let row = 3; row <= 4; row += 1) {
    for (let column = 1; column <= totalColumn; column += 1) {
      const cell = sheet.getCell(row, column);
      cell.font = { bold: true, size: 10, color: { argb: 'FF172019' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF4E5C50' } },
        left: { style: 'thin', color: { argb: 'FF4E5C50' } },
        bottom: { style: 'thin', color: { argb: 'FF4E5C50' } },
        right: { style: 'thin', color: { argb: 'FF4E5C50' } },
      };
    }
  }
  DAYS.forEach((_, index) => {
    const column = 3 + (index * 2);
    const [strong, projection, actual] = DAY_COLORS[index];
    sheet.getCell(3, column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: strong } };
    sheet.getCell(4, column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: projection } };
    sheet.getCell(4, column + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: actual } };
  });
  sheet.getCell(3, 19).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF665184' } };
  sheet.getCell(3, 19).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell(3, 17).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFb5CD' } };
  sheet.getCell(3, 18).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5D36A' } };
  sheet.getRow(3).height = 26;
  sheet.getRow(4).height = 22;

  let rowNumber = 5;
  let currentProduction = null;
  let groupStart = null;
  const addSummary = (label, groupRecords) => {
    const row = sheet.getRow(rowNumber);
    row.getCell(1).value = label;
    sheet.mergeCells(rowNumber, 1, rowNumber, 2);
    for (let day = 0; day < 7; day += 1) {
      row.getCell(3 + day * 2).value = groupRecords.reduce((sum, record) => sum + Number(record.days[day].projected || 0), 0);
      row.getCell(4 + day * 2).value = groupRecords.reduce((sum, record) => sum + Number(record.days[day].actual || 0), 0);
    }
    row.getCell(17).value = groupRecords.reduce((sum, record) => sum + sumRecord(record, 'projected'), 0);
    row.getCell(18).value = groupRecords.reduce((sum, record) => sum + sumRecord(record, 'actual'), 0);
    row.getCell(19).value = groupRecords.reduce((sum, record) => sum + Number(record.arrangements || 0), 0);
    row.height = 24;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: label === 'TOTAL SEMANA' ? 'FFFFFFFF' : 'FF274C39' } };
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: label === 'TOTAL SEMANA' ? accentDark : 'FFE8F1E9' } };
    });
    row.getCell(17).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9DBE8' } };
    row.getCell(18).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDA6' } };
    row.getCell(17).font = { bold: true, color: { argb: 'FF4A2435' } };
    row.getCell(18).font = { bold: true, color: { argb: 'FF483500' } };
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    rowNumber += 1;
  };

  records.forEach((record, recordIndex) => {
    if (['F1', 'F2'].includes(farm.code) && record.production !== currentProduction) {
      if (currentProduction !== null) addSummary(`TOTAL PRODUCCIÓN ${currentProduction}`, records.slice(groupStart, recordIndex));
      currentProduction = record.production;
      groupStart = recordIndex;
      sheet.mergeCells(rowNumber, 1, rowNumber, totalColumn);
      const heading = sheet.getCell(rowNumber, 1);
      heading.value = `PRODUCCIÓN ${currentProduction}`;
      heading.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      heading.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B5946' } };
      heading.alignment = { vertical: 'middle', horizontal: 'left' };
      sheet.getRow(rowNumber).height = 23;
      rowNumber += 1;
    }
    const row = sheet.getRow(rowNumber);
    row.values = [
      record.block,
      record.variety,
      ...record.days.flatMap((day) => [Number(day.projected || 0), Number(day.actual || 0)]),
      sumRecord(record, 'projected'),
      sumRecord(record, 'actual'),
      Number(record.arrangements || 0),
    ];
    row.height = 22;
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFB9C1BA' } },
        left: { style: 'thin', color: { argb: 'FFB9C1BA' } },
        bottom: { style: 'thin', color: { argb: 'FFB9C1BA' } },
        right: { style: 'thin', color: { argb: 'FFB9C1BA' } },
      };
      cell.alignment = { vertical: 'middle', horizontal: column <= 2 ? 'left' : 'right' };
      if (column >= 3 && column <= 16 && column % 2 === 1) {
        const day = Math.floor((column - 3) / 2);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DAY_COLORS[day][1] } };
      } else if (column >= 3 && column <= 16) {
        const day = Math.floor((column - 3) / 2);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DAY_COLORS[day][2] } };
      }
      if (column >= 17) cell.font = { bold: true };
    });
    row.getCell(17).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9DBE8' } };
    row.getCell(18).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDA6' } };
    if (['FREEDOM', 'DANCING RED'].includes(record.variety)) {
      row.getCell(2).font = { bold: true, color: { argb: 'FFBA2E35' } };
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    }
    rowNumber += 1;
  });
  if (['F1', 'F2'].includes(farm.code) && currentProduction !== null) {
    addSummary(`TOTAL PRODUCCIÓN ${currentProduction}`, records.slice(groupStart));
  }
  addSummary('TOTAL SEMANA', records);

  if (farm.code === 'F1') addP1ArrangementSummary(workbook, records);

  sheet.getColumn(1).width = 12;
  sheet.getColumn(2).width = 22;
  for (let column = 3; column <= 16; column += 1) sheet.getColumn(column).width = 12;
  sheet.getColumn(17).width = 16;
  sheet.getColumn(18).width = 14;
  sheet.getColumn(19).width = 16;

  return workbook.xlsx.writeBuffer();
}

module.exports = { buildProjectionWorkbook };
