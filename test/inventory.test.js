const test = require('node:test');
const assert = require('node:assert/strict');
const { templates, inventoryTemplate, blankInventory, normalizeInventory, inventorySummary, inventoryMonthSummary } = require('../src/inventory');
const db = require('../src/db');

test('P1 ofrece dos inventarios, pero flor que amanece de P2 solo tiene granel', () => {
  assert.deepEqual(Object.keys(templates).filter((key) => templates[key].farmCode === 'F1'), ['p1', 'p1_p2']);
  assert.deepEqual(Object.keys(templates).filter((key) => templates[key].farmCode === 'F2'), ['p2']);
  for (const template of [templates.p1, templates.p2]) {
    assert.ok(template.processed.varieties.length > 0);
    assert.equal(template.processed.columns.length, template === templates.p1 ? 57 : 48);
    assert.ok(template.bulk.length > 0);
    assert.ok(template.guard.length > 0);
  }
  const p1P2 = inventoryTemplate('p1_p2', 'F1');
  assert.equal(p1P2.label, 'Flor que amanece de P2');
  assert.deepEqual(p1P2.sections, ['bulk']);
  assert.ok(p1P2.bulk.length > 0);
  assert.equal(p1P2.processed, undefined);
  assert.equal(p1P2.guard, undefined);
  assert.throws(() => inventoryTemplate('p2', 'F1'));
});

test('inventario ramos P1 conserva columnas previas y aplica nuevas láminas y factores', () => {
  const columns = templates.p1.processed.columns;
  assert.equal(new Set(columns.map((column) => column.key)).size, columns.length);
  for (const [key, process, grade, stems] of [
    ['B', 'LÁMINA PVC', 40, 6],
    ['C', 'LÁMINA PVC', 40, 12],
    ['D', 'LÁMINA PVC', 50, 12],
    ['AX', 'LÁMINA AZUL', 50, 10],
    ['AY', 'LÁMINA AZUL', 60, 10],
    ['AZ', 'LÁMINA MORADA', 50, 25],
    ['BA', 'LÁMINA MORADA', 60, 25],
    ['BB', 'LÁMINA MORADA', 70, 25],
    ['BC', 'LÁMINA MORADA', 40, 25],
    ['BD', 'LÁMINA ROJA', 50, 25],
    ['BE', 'LÁMINA ROJA', 40, 25],
    ['BF', 'LÁMINA ROJA', 60, 25],
  ]) assert.deepEqual(columns.find((column) => column.key === key), { key, process, grade, stems });
  assert.deepEqual(columns.filter((column) => column.process === 'LÁMINA AMARILLA').map((column) => column.stems), [25, 25, 25, 25]);
  const data = blankInventory();
  for (const key of ['B', 'C', 'D', 'AX', 'AY', 'AZ', 'BA', 'BB', 'BC', 'BD', 'BE', 'BF', 'AO', 'AP', 'AQ', 'AR']) data.processed[`21:0:${key}`] = 1;
  assert.deepEqual(normalizeInventory(templates.p1, 2026, 10, data).processed, data.processed);
  assert.equal(inventorySummary(templates.p1, data, 'processed', 21).totals.stems, 6 + 12 + 12 + 10 + 10 + 7 * 25 + 4 * 25);
  assert.equal(templates.p2.processed.columns.length, 48);
});

test('nombres corregidos de variedades conservan sus posiciones y registros', () => {
  const varieties = templates.p1.processed.varieties;
  for (const [index, name] of [[7, 'MOODY BLUE'], [15, 'PINK OHARA'], [17, 'DEEP PURPLE'], [18, 'SUMMERSAND'], [19, 'SWAN']]) {
    assert.equal(varieties[index], name);
  }
  const data = blankInventory();
  data.processed['21:19:B'] = 2;
  assert.equal(inventorySummary(templates.p1, data, 'processed', 21).details[19].name, 'SWAN');
  assert.equal(inventorySummary(templates.p1, data, 'processed', 21).details[19].stems, 12);
});

test('flor que amanece de P2 guarda solo granel sin borrar datos históricos ocultos', async () => {
  const template = inventoryTemplate('p1_p2', 'F1');
  const period = [2040, 10];
  const historical = blankInventory();
  historical.processed['21:0:B'] = 2;
  historical.guard['0:1'] = 3;
  const legacyTemplate = { ...templates.p1_p2 };
  delete legacyTemplate.sections;
  await db.saveInventory(1, 'p1_p2', legacyTemplate, ...period, historical);
  const visible = normalizeInventory(template, ...period, (await db.getInventory(1, 'p1_p2', ...period)).data);
  assert.deepEqual(visible, { bulk: {} });
  visible.bulk['0:1'] = 4;
  const saved = await db.saveInventory(1, 'p1_p2', template, ...period, visible);
  assert.deepEqual(saved.data, { bulk: { '0:1': 4 } });
  const stored = (await db.getInventory(1, 'p1_p2', ...period)).data;
  assert.equal(stored.processed['21:0:B'], 2);
  assert.equal(stored.guard['0:1'], 3);
});

test('flor procesada multiplica por los tallos de cada presentación y aparta nacional', () => {
  const template = templates.p1;
  const data = blankInventory();
  data.processed['21:0:B'] = 2; // PVC de seis tallos, Freedom
  data.processed['21:1:E'] = 3; // Verde de veinticinco tallos, Blessing
  data.processed['21:0:AW'] = 4; // Nacional, sin factor en la plantilla
  const result = inventorySummary(template, data, 'processed', 21);
  assert.equal(result.totals.red, 12);
  assert.equal(result.totals.color, 75);
  assert.equal(result.totals.stems, 87);
  assert.equal(result.totals.unweighted, 4);
  assert.equal(inventorySummary(template, data, 'processed', 22).totals.stems, 0);
});

test('granel y guarde suman los días del mes y usan su propio factor por variedad', () => {
  const template = templates.p1;
  const data = blankInventory();
  data.bulk['0:1'] = 2;
  data.bulk['0:31'] = 1;
  data.guard['2:10'] = 3;
  assert.equal(inventorySummary(template, data, 'bulk', 1).totals.red, 75);
  assert.equal(inventorySummary(template, data, 'guard', 1).totals.red, 75);
});

test('FN suma tallos directos en granel sin aumentar ramos ni afectar guarde', () => {
  for (const template of Object.values(templates)) {
    const data = blankInventory();
    data.bulk['0:1'] = 2;
    data.bulk['0:FN'] = 37;
    data.bulk['1:FN'] = 13;
    const result = inventorySummary(template, data, 'bulk', 1);
    assert.equal(result.details[0].units, 2);
    assert.equal(result.details[0].fnStems, 37);
    assert.equal(result.details[0].stems, 2 * template.bulk[0].stemsPerBunch + 37);
    assert.equal(result.totals.fnStems, 50);
    assert.equal(result.totals.stems, 2 * template.bulk[0].stemsPerBunch + 50);
    assert.deepEqual(normalizeInventory(template, 2026, 10, data).bulk, data.bulk);
    assert.equal(inventorySummary(template, data, 'guard', 1).totals.stems, 0);
  }
});

test('total mensual de tallos suma secciones y respeta inventario solo granel', () => {
  const data = blankInventory();
  data.processed['1:0:B'] = 2;
  data.processed['2:0:B'] = 1;
  data.bulk['0:1'] = 2;
  data.bulk['0:FN'] = 7;
  data.guard['0:1'] = 3;
  const full = inventoryMonthSummary(templates.p1, data, 2026, 10);
  assert.equal(full.sections.processed.stems, 18);
  assert.equal(full.sections.bulk.stems, 2 * templates.p1.bulk[0].stemsPerBunch + 7);
  assert.equal(full.sections.guard.stems, 3 * templates.p1.guard[0].stemsPerBunch);
  assert.equal(full.stems, Object.values(full.sections).reduce((sum, item) => sum + item.stems, 0));
  const bulkOnly = inventoryMonthSummary(inventoryTemplate('p1_p2', 'F1'), data, 2026, 10);
  assert.deepEqual(Object.keys(bulkOnly.sections), ['bulk']);
});

test('valida finca, mes, día, variedad y columna antes de guardar', async () => {
  const template = templates.p2;
  assert.throws(() => normalizeInventory(template, 2026, 2, { processed: { '30:0:B': 1 } }));
  assert.throws(() => normalizeInventory(template, 2026, 10, { processed: { '1:0:ZZ': 1 } }));
  assert.throws(() => normalizeInventory(template, 2026, 10, { bulk: { '999:1': 1 } }));
  assert.throws(() => normalizeInventory(template, 2026, 10, { guard: { '0:FN': 1 } }));
  assert.throws(() => normalizeInventory(template, 2026, 10, { bulk: { '0:FN': -1 } }));
  const data = blankInventory();
  data.processed['21:0:B'] = 2;
  await db.saveInventory(2, 'p2', template, 2035, 10, data);
  const saved = await db.getInventory(2, 'p2', 2035, 10);
  assert.equal(saved.saved, true);
  assert.equal(saved.data.processed['21:0:B'], 2);
  assert.equal((await db.getInventory(1, 'p1', 2035, 10)).saved, false);
});
