const templates = require('./inventory-templates.json');

function inventoryTemplate(key, farmCode) {
  const template = templates[key];
  if (!template || template.farmCode !== farmCode) throw new Error('Inventario no disponible para esta finca');
  if (key === 'p1') return {
    ...template,
    processed: {
      ...template.processed,
      // Orden de presentación únicamente: las claves de las columnas guardadas no cambian.
      columns: [...template.processed.columns].sort((a, b) =>
        (b.stems ?? -1) - (a.stems ?? -1)),
    },
  };
  if (!template.sections) return template;
  return Object.fromEntries(Object.entries(template).filter(([field]) =>
    !['processed', 'bulk', 'guard'].includes(field) || template.sections.includes(field)));
}

function blankInventory() {
  return { processed: {}, bulk: {}, guard: {} };
}

function availableSections(template) {
  return template.sections || ['processed', 'bulk', 'guard'];
}

function normalizeInventory(template, year, month, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Inventario inválido');
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const result = Object.fromEntries(availableSections(template).map((section) => [section, {}]));
  for (const section of availableSections(template)) {
    const entries = input[section] || {};
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error(`Sección ${section} inválida`);
    if (Object.keys(entries).length > 40000) throw new Error('Demasiadas entradas en el inventario');
    for (const [key, raw] of Object.entries(entries)) {
      const parts = key.split(':');
      if (parts.length !== (section === 'processed' ? 3 : 2)) throw new Error(`Celda ${key} inválida`);
      const [dayText, rowText, column] = section === 'processed' ? parts : [parts[1], parts[0], null];
      const isFn = section === 'bulk' && dayText === 'FN';
      const day = isFn ? null : Number(dayText);
      const row = Number(rowText);
      const rows = section === 'processed' ? template.processed.varieties : template[section];
      if ((!isFn && (!Number.isInteger(day) || day < 1 || day > maxDay)) || !Number.isInteger(row) || row < 0 || row >= rows.length) {
        throw new Error(`Celda ${key} fuera de la plantilla`);
      }
      if (section === 'processed' && !template.processed.columns.some((item) => item.key === column)) {
        throw new Error(`Columna ${column} fuera de la plantilla`);
      }
      const canonicalKey = section === 'processed' ? `${day}:${row}:${column}` : `${row}:${isFn ? 'FN' : day}`;
      if (key !== canonicalKey) throw new Error(`Celda ${key} inválida`);
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0 || value > 1000000) throw new Error(`Cantidad inválida en ${key}`);
      if (value) result[section][key] = value;
    }
  }
  return result;
}

function inventorySummary(template, data, section, selectedDay) {
  const rows = section === 'processed' ? template.processed.varieties : template[section];
  const details = rows.map((item, index) => {
    // Keep retired positions so saved row keys remain valid, but exclude them from totals.
    if (item.retired) return { name: item.name, units: 0, stems: 0, unweighted: 0, fnStems: 0 };
    const factors = section === 'processed' ? template.processed.columns : null;
    let units = 0;
    let stems = 0;
    let unweighted = 0;
    let fnStems = 0;
    if (factors) {
      for (const column of factors) {
        const amount = data.processed[`${selectedDay}:${index}:${column.key}`] || 0;
        units += amount;
        if (column.stems === null) unweighted += amount;
        else stems += amount * column.stems;
      }
    } else {
      for (let day = 1; day <= 31; day += 1) units += data[section][`${index}:${day}`] || 0;
      if (item.stemsPerBunch === null) unweighted = units;
      else stems = units * item.stemsPerBunch;
      if (section === 'bulk') {
        fnStems = data.bulk[`${index}:FN`] || 0;
        stems += fnStems;
      }
    }
    return { name: section === 'processed' ? item : item.name, units, stems, unweighted, fnStems };
  });
  const totals = details.reduce((acc, row, index) => {
    acc.units += row.units;
    acc.stems += row.stems;
    acc.fnStems += row.fnStems;
    acc.unweighted += row.unweighted;
    if (section === 'processed' ? index === 0 : index < 3) acc.red += row.stems;
    else acc.color += row.stems;
    return acc;
  }, { units: 0, stems: 0, fnStems: 0, unweighted: 0, red: 0, color: 0 });
  return { details, totals };
}

function inventoryMonthSummary(template, data, year, month) {
  const normalized = normalizeInventory(template, year, month, data);
  const sections = availableSections(template);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const bySection = Object.fromEntries(sections.map((section) => {
    const summaries = section === 'processed'
      ? Array.from({ length: days }, (_, day) => inventorySummary(template, normalized, section, day + 1))
      : [inventorySummary(template, normalized, section, 1)];
    const totals = summaries.reduce((acc, item) => {
      for (const key of Object.keys(acc)) acc[key] += item.totals[key];
      return acc;
    }, { units: 0, stems: 0, fnStems: 0, unweighted: 0, red: 0, color: 0 });
    return [section, totals];
  }));
  return {
    sections: bySection,
    stems: Object.values(bySection).reduce((sum, totals) => sum + totals.stems, 0),
  };
}

module.exports = { templates, inventoryTemplate, blankInventory, availableSections, normalizeInventory, inventorySummary, inventoryMonthSummary };
