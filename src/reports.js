const ExcelJS = require('exceljs');
const { derivedFieldData } = require('./field-data');
const { availableSections, inventoryMonthSummary, inventorySummary, normalizeInventory } = require('./inventory');

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const SECTION_NAMES = { processed: 'Inventario ramos', bulk: 'Flor a granel', guard: 'Flor de guarde' };

function newWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Flor Semanal';
  return workbook;
}

function setupSheet(workbook, name, title, farm, period, headers) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 4, xSplit: 1 }] });
  const accent = farm.code === 'F2' ? 'FF087B89' : 'FF567327';
  sheet.mergeCells(1, 1, 1, headers.length);
  sheet.getCell(1, 1).value = title;
  sheet.getCell(1, 1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  sheet.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent } };
  sheet.getRow(1).height = 31;
  sheet.mergeCells(2, 1, 2, headers.length);
  sheet.getCell(2, 1).value = `${farm.name} · ${period}`;
  sheet.getCell(2, 1).font = { bold: true, color: { argb: accent } };
  sheet.getRow(4).values = headers;
  sheet.getRow(4).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent } };
    cell.alignment = { wrapText: true, vertical: 'middle' };
  });
  sheet.getRow(4).height = 28;
  sheet.getColumn(1).width = 27;
  for (let column = 2; column <= headers.length; column += 1) sheet.getColumn(column).width = 17;
  return sheet;
}

function appendTotals(sheet, label, values) {
  const row = sheet.addRow([label, ...values]);
  row.font = { bold: true };
  row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDA6' } }; });
  return row;
}

async function buildFieldWorkbook({ farm, year, week, data, kind }) {
  if (!['climate', 'water'].includes(kind)) throw new Error('Proceso inválido');
  const derived = derivedFieldData(farm.code, data);
  const workbook = newWorkbook();
  const climate = kind === 'climate';
  const title = climate ? 'TEMPERATURA Y PRECIPITACIÓN' : 'REGISTRO HÍDRICO';
  const sheet = setupSheet(workbook, climate ? 'Temperatura' : 'Registro hídrico', title, farm,
    `Año ${year} · Semana ${week}`, ['REGISTRO', ...DAYS, climate ? 'PROMEDIO' : 'ACUMULADO']);
  const rows = climate
    ? [
      ['Temperatura mínima (°C)', 'minTemp'],
      ['Temperatura máxima (°C)', 'maxTemp'],
      ['Humedad (%)', 'humidity'],
      ['Precipitación (ml)', 'precipitation'],
    ].map(([label, key]) => [label, ...derived.data.climate[key], derived.climateAverage[key]])
    : [
      ...(farm.code === 'F1' ? [
        ['Lectura inicial (m³)', ...derived.data.water.initial, null],
        ['Lectura final (m³)', ...derived.data.water.final, null],
      ] : [
        ['Goteo (m³)', ...derived.data.water.drip, derived.totalDrip],
        ['Cacho (m³)', ...derived.data.water.hose, derived.totalHose],
      ]),
      ['Consumo diario (m³)', ...derived.daily, derived.totalDaily],
      ['Consumo por cama (L)', ...derived.litersPerBed, derived.totalLitersPerBed],
    ];
  rows.forEach((row) => sheet.addRow(row));
  if (!climate) sheet.addRow(['Número de camas', derived.data.beds]);
  for (let row = 5; row <= 4 + rows.length; row += 1) {
    for (let col = 2; col <= 9; col += 1) sheet.getCell(row, col).numFmt = '#,##0.00';
    sheet.getCell(row, 9).font = { bold: true };
    sheet.getCell(row, 9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDA6' } };
  }
  return workbook.xlsx.writeBuffer();
}

function addInventorySection(workbook, farm, period, template, data, section, year, month) {
  const sheet = setupSheet(workbook, SECTION_NAMES[section], `${SECTION_NAMES[section].toUpperCase()} · ${template.label.toUpperCase()}`,
    farm, period, section === 'processed'
      ? ['DÍA', 'VARIEDAD', 'LÁMINA', 'CALIBRE', 'UNIDADES', 'TALLOS / UNIDAD', 'TALLOS']
      : ['DÍA', 'VARIEDAD', 'RAMOS', 'TALLOS / RAMO', 'TALLOS']);
  sheet.getColumn(2).width = 27;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (section === 'processed') {
    sheet.getColumn(3).width = 23;
    for (const [key, value] of Object.entries(data.processed || {})) {
      const [day, index, columnKey] = key.split(':');
      const column = template.processed.columns.find((item) => item.key === columnKey);
      sheet.addRow([Number(day), template.processed.varieties[Number(index)], column.process,
        column.grade, value, column.stems, column.stems === null ? null : value * column.stems]);
    }
  } else {
    for (const [key, value] of Object.entries(data[section] || {})) {
      const [index, day] = key.split(':');
      const item = template[section][Number(index)];
      sheet.addRow([day === 'FN' ? 'FN' : Number(day), item.name, day === 'FN' ? null : value,
        day === 'FN' ? null : item.stemsPerBunch, day === 'FN' ? value : item.stemsPerBunch === null ? null : value * item.stemsPerBunch]);
    }
  }
  const monthSummary = inventoryMonthSummary(template, data, year, month).sections[section];
  const totals = section === 'processed'
    ? [null, null, null, monthSummary.units, null, monthSummary.stems]
    : [null, monthSummary.units, null, monthSummary.stems];
  appendTotals(sheet, 'TOTAL MES', totals);
  sheet.addRow(['FN se registra en tallos directos. Las cantidades sin factor no se suman como tallos.']);
  return sheet;
}

async function buildInventoryWorkbook({ farm, template, year, month, data }) {
  const normalized = normalizeInventory(template, year, month, data);
  const workbook = newWorkbook();
  const period = `${year}-${String(month).padStart(2, '0')}`;
  const summary = inventoryMonthSummary(template, normalized, year, month);
  const sheet = setupSheet(workbook, 'Resumen', `INVENTARIO · ${template.label.toUpperCase()}`, farm, period,
    ['SECCIÓN', 'TALLOS', 'RAMOS / UNIDADES', 'FN TALLOS', 'SIN CONVERSIÓN']);
  for (const section of availableSections(template)) {
    const item = summary.sections[section];
    sheet.addRow([SECTION_NAMES[section], item.stems, item.units, item.fnStems, item.unweighted]);
  }
  appendTotals(sheet, 'TOTAL INVENTARIO', [summary.stems]);
  for (const section of availableSections(template)) addInventorySection(workbook, farm, period, template, normalized, section, year, month);
  return workbook.xlsx.writeBuffer();
}

async function buildFarmInventoryWorkbook({ farm, year, month, summaries }) {
  const workbook = newWorkbook();
  const period = `${year}-${String(month).padStart(2, '0')}`;
  const sheet = setupSheet(workbook, 'Total finca', 'TALLOS DE TODOS LOS INVENTARIOS', farm, period,
    ['INVENTARIO', 'SECCIÓN', 'TALLOS']);
  let total = 0;
  for (const item of summaries) {
    for (const [section, values] of Object.entries(item.summary.sections)) {
      sheet.addRow([item.label, SECTION_NAMES[section], values.stems]);
      total += values.stems;
    }
  }
  appendTotals(sheet, 'TOTAL FINCA', [null, total]);
  sheet.getColumn(2).width = 25;
  return workbook.xlsx.writeBuffer();
}

module.exports = { buildFieldWorkbook, buildInventoryWorkbook, buildFarmInventoryWorkbook };
