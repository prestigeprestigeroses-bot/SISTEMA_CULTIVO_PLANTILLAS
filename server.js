require('dotenv').config();

const path = require('path');
const express = require('express');
const db = require('./src/db');
const { buildProjectionWorkbook } = require('./src/excel');
const { assertWeek, isoWeekStart } = require('./src/week');
const { derivedFieldData } = require('./src/field-data');
const { templates, inventoryTemplate, normalizeInventory, inventoryMonthSummary } = require('./src/inventory');
const { buildFieldWorkbook, buildInventoryWorkbook, buildFarmInventoryWorkbook } = require('./src/reports');
const { createAuth } = require('./src/auth');

const app = express();
const port = Number(process.env.PORT) || 3000;
const secureDeployment = process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT);
const localTestMode = !secureDeployment && process.env.LOCAL_TEST_PASSWORD === '12345';
const auth = createAuth({
  productionPassword: localTestMode ? process.env.LOCAL_TEST_PASSWORD : process.env.AUTH_PRODUCTION_PASSWORD,
  postharvestPassword: localTestMode ? process.env.LOCAL_TEST_PASSWORD : process.env.AUTH_POSCOSECHA_PASSWORD,
  viewerPassword: localTestMode ? process.env.LOCAL_TEST_PASSWORD : process.env.AUTH_VIEWER_PASSWORD,
  sessionSecret: process.env.SESSION_SECRET,
  secure: secureDeployment,
  allowInsecureLocal: localTestMode,
});

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use('/api', auth.requireSameOrigin);

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function validateFarmId(value) {
  const farmId = Number(value);
  if (!Number.isInteger(farmId) || farmId < 1) throw new Error('Finca inválida');
  return farmId;
}

function validateInventoryPeriod(yearValue, monthValue) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Mes de inventario inválido');
  }
  return { year, month };
}

async function farmById(farmId) {
  const farm = (await db.getFarms()).find((item) => Number(item.id) === farmId);
  if (!farm) throw new Error('Finca inválida');
  return farm;
}

function sendWorkbook(res, buffer, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

async function farmInventorySummary(farm, year, month) {
  const list = [];
  for (const [key, source] of Object.entries(templates)) {
    if (source.farmCode !== farm.code) continue;
    const template = inventoryTemplate(key, farm.code);
    const { data, saved } = await db.getInventory(farm.id, key, year, month);
    list.push({ key, label: template.label, saved, summary: inventoryMonthSummary(template, data, year, month) });
  }
  return { farmId: farm.id, year, month, inventories: list, totalStems: list.reduce((sum, item) => sum + item.summary.stems, 0) };
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  const status = await db.health();
  res.json({ ok: true, ...status });
}));

app.get('/api/auth/session', (req, res) => res.json({ role: auth.session(req) }));
app.post('/api/auth/login', auth.login);
app.post('/api/auth/logout', auth.logout);
app.use('/api', auth.requireLogin);

app.get('/api/farms', asyncRoute(async (_req, res) => {
  res.json(await db.getFarms());
}));

app.get('/api/projections/:farmId/:year/:week', auth.requireRole('production', 'viewer'), asyncRoute(async (req, res) => {
  const farmId = validateFarmId(req.params.farmId);
  const { year, week } = assertWeek(req.params.year, req.params.week);
  const { records, fromTemplate } = await db.getWeekWithDefaults(farmId, year, week);
  res.json({ farmId, year, week, weekStart: isoWeekStart(year, week), records, fromTemplate });
}));

app.get('/api/field-data/:farmId/:year/:week', auth.requireRole('production', 'viewer'), asyncRoute(async (req, res) => {
  const farmId = validateFarmId(req.params.farmId);
  const { year, week } = assertWeek(req.params.year, req.params.week);
  const farm = (await db.getFarms()).find((item) => Number(item.id) === farmId);
  if (!farm) throw new Error('Finca inválida');
  const result = await db.getFieldData(farmId, year, week);
  res.json({ ...result, calculated: derivedFieldData(farm.code, result.data) });
}));

app.put('/api/field-data/:farmId/:year/:week', auth.requireRole('production'), asyncRoute(async (req, res) => {
  const farmId = validateFarmId(req.params.farmId);
  const { year, week } = assertWeek(req.params.year, req.params.week);
  const farm = (await db.getFarms()).find((item) => Number(item.id) === farmId);
  if (!farm) throw new Error('Finca inválida');
  derivedFieldData(farm.code, req.body);
  const result = await db.saveFieldData(farmId, year, week, req.body);
  res.json({ ...result, calculated: derivedFieldData(farm.code, result.data) });
}));

app.get('/api/inventory/templates/:farmId', auth.requireRole('postharvest', 'viewer'), asyncRoute(async (req, res) => {
  const farmId = validateFarmId(req.params.farmId);
  const farm = (await db.getFarms()).find((item) => Number(item.id) === farmId);
  if (!farm) throw new Error('Finca inválida');
  res.json(Object.entries(templates).filter(([, template]) => template.farmCode === farm.code)
    .map(([key, template]) => ({ key, label: template.label })));
}));

app.get('/api/inventory/summary/:farmId/:year/:month', auth.requireRole('postharvest', 'viewer'), asyncRoute(async (req, res) => {
  const farm = await farmById(validateFarmId(req.params.farmId));
  const { year, month } = validateInventoryPeriod(req.params.year, req.params.month);
  res.json(await farmInventorySummary(farm, year, month));
}));

app.get('/api/inventory/:farmId/:templateKey/:year/:month', auth.requireRole('postharvest', 'viewer'), asyncRoute(async (req, res) => {
  const farmId = validateFarmId(req.params.farmId);
  const { year, month } = validateInventoryPeriod(req.params.year, req.params.month);
  const farm = (await db.getFarms()).find((item) => Number(item.id) === farmId);
  if (!farm) throw new Error('Finca inválida');
  const template = inventoryTemplate(req.params.templateKey, farm.code);
  const result = await db.getInventory(farmId, req.params.templateKey, year, month);
  res.json({ ...result, template, data: normalizeInventory(template, year, month, result.data) });
}));

app.put('/api/inventory/:farmId/:templateKey/:year/:month', auth.requireRole('postharvest'), asyncRoute(async (req, res) => {
  const farmId = validateFarmId(req.params.farmId);
  const { year, month } = validateInventoryPeriod(req.params.year, req.params.month);
  const farm = (await db.getFarms()).find((item) => Number(item.id) === farmId);
  if (!farm) throw new Error('Finca inválida');
  const template = inventoryTemplate(req.params.templateKey, farm.code);
  const result = await db.saveInventory(farmId, req.params.templateKey, template, year, month, req.body);
  res.json(result);
}));

app.put('/api/projections/:farmId/:year/:week', auth.requireRole('production'), asyncRoute(async (req, res) => {
  const farmId = validateFarmId(req.params.farmId);
  const { year, week } = assertWeek(req.params.year, req.params.week);
  if (!Array.isArray(req.body.records)) throw new Error('La lista de registros es obligatoria');
  if (req.body.records.length > 500) throw new Error('Máximo 500 filas por semana');
  const records = await db.replaceWeek({
    farmId,
    year,
    week,
    weekStart: isoWeekStart(year, week),
    records: req.body.records,
  });
  res.json({ ok: true, records });
}));

app.get('/api/history/:farmId', auth.requireRole('production', 'viewer'), asyncRoute(async (req, res) => {
  const farmId = validateFarmId(req.params.farmId);
  res.json(await db.getHistory(farmId));
}));

app.get('/api/export/:farmId/:year/:week.xlsx', auth.requireRole('production', 'viewer'), asyncRoute(async (req, res) => {
  const farmId = validateFarmId(req.params.farmId);
  const { year, week } = assertWeek(req.params.year, req.params.week);
  const farms = await db.getFarms();
  const farm = farms.find((item) => Number(item.id) === farmId);
  if (!farm) return res.status(404).json({ error: 'Finca no encontrada' });
  const { records } = await db.getWeekWithDefaults(farmId, year, week);
  const buffer = await buildProjectionWorkbook({ farm, year, week, records });
  const safeFarm = farm.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Proyeccion_${safeFarm}_${year}_S${week}.xlsx"`);
  res.send(buffer);
}));

app.get('/api/reports/field/:farmId/:year/:week/:kind.xlsx', auth.requireRole('production', 'viewer'), asyncRoute(async (req, res) => {
  const farm = await farmById(validateFarmId(req.params.farmId));
  const { year, week } = assertWeek(req.params.year, req.params.week);
  const kind = req.params.kind;
  if (!['climate', 'water'].includes(kind)) throw new Error('Proceso inválido');
  const { data } = await db.getFieldData(farm.id, year, week);
  const buffer = await buildFieldWorkbook({ farm, year, week, data, kind });
  sendWorkbook(res, buffer, `${kind === 'climate' ? 'Temperatura' : 'Registro_hidrico'}_${farm.code}_${year}_S${week}.xlsx`);
}));

app.get('/api/reports/inventory/:farmId/:templateKey/:year/:month.xlsx', auth.requireRole('postharvest', 'viewer'), asyncRoute(async (req, res) => {
  const farm = await farmById(validateFarmId(req.params.farmId));
  const { year, month } = validateInventoryPeriod(req.params.year, req.params.month);
  const template = inventoryTemplate(req.params.templateKey, farm.code);
  const { data } = await db.getInventory(farm.id, req.params.templateKey, year, month);
  const buffer = await buildInventoryWorkbook({ farm, template, year, month, data });
  sendWorkbook(res, buffer, `Inventario_${farm.code}_${req.params.templateKey}_${year}_${String(month).padStart(2, '0')}.xlsx`);
}));

app.get('/api/reports/inventory-summary/:farmId/:year/:month.xlsx', auth.requireRole('postharvest', 'viewer'), asyncRoute(async (req, res) => {
  const farm = await farmById(validateFarmId(req.params.farmId));
  const { year, month } = validateInventoryPeriod(req.params.year, req.params.month);
  const result = await farmInventorySummary(farm, year, month);
  const buffer = await buildFarmInventoryWorkbook({ farm, year, month, summaries: result.inventories });
  sendWorkbook(res, buffer, `Total_inventarios_${farm.code}_${year}_${String(month).padStart(2, '0')}.xlsx`);
}));

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((error, _req, res, _next) => {
  console.error(error);
  const isInputError = /inválid|obligatori|máximo/i.test(error.message);
  res.status(isInputError ? 400 : 500).json({ error: error.message || 'Error interno' });
});

async function start() {
  await db.migrate();
  app.listen(port, localTestMode ? '127.0.0.1' : '0.0.0.0', () => {
    console.log(`Flor Semanal listo en http://localhost:${port}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error('No se pudo iniciar la aplicación', error);
    process.exit(1);
  });
}

module.exports = { app, start };
