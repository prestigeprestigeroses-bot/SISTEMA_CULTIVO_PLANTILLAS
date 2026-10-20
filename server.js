require('dotenv').config();

const path = require('path');
const express = require('express');
const db = require('./src/db');
const { buildProjectionWorkbook } = require('./src/excel');
const { assertWeek, isoWeekStart } = require('./src/week');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function validateFarmId(value) {
  const farmId = Number(value);
  if (!Number.isInteger(farmId) || farmId < 1) throw new Error('Finca inválida');
  return farmId;
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  const status = await db.health();
  res.json({ ok: true, ...status });
}));

app.get('/api/farms', asyncRoute(async (_req, res) => {
  res.json(await db.getFarms());
}));

app.get('/api/projections/:farmId/:year/:week', asyncRoute(async (req, res) => {
  const farmId = validateFarmId(req.params.farmId);
  const { year, week } = assertWeek(req.params.year, req.params.week);
  const { records, fromTemplate } = await db.getWeekWithDefaults(farmId, year, week);
  res.json({ farmId, year, week, weekStart: isoWeekStart(year, week), records, fromTemplate });
}));

app.put('/api/projections/:farmId/:year/:week', asyncRoute(async (req, res) => {
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

app.get('/api/history/:farmId', asyncRoute(async (req, res) => {
  const farmId = validateFarmId(req.params.farmId);
  res.json(await db.getHistory(farmId));
}));

app.get('/api/export/:farmId/:year/:week.xlsx', asyncRoute(async (req, res) => {
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

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((error, _req, res, _next) => {
  console.error(error);
  const isInputError = /inválid|obligatori|máximo/i.test(error.message);
  res.status(isInputError ? 400 : 500).json({ error: error.message || 'Error interno' });
});

async function start() {
  await db.migrate();
  app.listen(port, '0.0.0.0', () => {
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
