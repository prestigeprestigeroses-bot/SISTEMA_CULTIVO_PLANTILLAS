const { Pool } = require('pg');
const { defaultRecordsForFarm, templateRowsForFarm, P1_ROWS, P1_WEEKLY_TARGETS } = require('./defaults');
const { blankFieldData, normalizeFieldData } = require('./field-data');
const { templates, inventoryTemplate, inventoryCarriesOver, blankInventory, normalizeInventory, inventoryMonthSummary } = require('./inventory');

const connectionString = process.env.DATABASE_URL;
const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    })
  : null;

const memory = {
  farms: [
    { id: 1, code: 'F1', name: 'Finca P1' },
    { id: 2, code: 'F2', name: 'Finca P2' },
  ],
  weeks: new Map(),
  fieldWeeks: new Map(),
  inventoryMonths: new Map(),
  inventorySnapshots: new Map(),
};

const inventoryTimeZone = process.env.INVENTORY_TIME_ZONE || 'America/Bogota';
function inventoryEntryDate(instant = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: inventoryTimeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function memoryKey(farmId, year, week) {
  return `${farmId}:${year}:${week}`;
}

async function migrate() {
  if (!pool) {
    console.warn('DATABASE_URL no está configurada. Se usará memoria temporal para la vista local.');
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS farms (
      id SERIAL PRIMARY KEY,
      code VARCHAR(20) UNIQUE NOT NULL,
      name VARCHAR(120) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS weekly_records (
      id BIGSERIAL PRIMARY KEY,
      farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
      week_year INTEGER NOT NULL,
      week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 53),
      week_start DATE NOT NULL,
      block VARCHAR(60) NOT NULL,
      variety VARCHAR(120) NOT NULL,
      production SMALLINT NOT NULL DEFAULT 1,
      template_key VARCHAR(20),
      arrangements INTEGER NOT NULL DEFAULT 0,
      weekly_target INTEGER CHECK (weekly_target >= 0),
      notes TEXT NOT NULL DEFAULT '',
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_weekly_records_lookup
      ON weekly_records (farm_id, week_year, week_number);

    CREATE TABLE IF NOT EXISTS daily_values (
      id BIGSERIAL PRIMARY KEY,
      record_id BIGINT NOT NULL REFERENCES weekly_records(id) ON DELETE CASCADE,
      day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
      projected INTEGER NOT NULL DEFAULT 0 CHECK (projected >= 0),
      actual INTEGER NOT NULL DEFAULT 0 CHECK (actual >= 0),
      UNIQUE (record_id, day_of_week)
    );

    CREATE TABLE IF NOT EXISTS weekly_field_data (
      farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
      week_year INTEGER NOT NULL,
      week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 53),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (farm_id, week_year, week_number)
    );

    CREATE TABLE IF NOT EXISTS monthly_inventories (
      farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
      template_key VARCHAR(30) NOT NULL,
      inventory_year INTEGER NOT NULL,
      inventory_month SMALLINT NOT NULL CHECK (inventory_month BETWEEN 1 AND 12),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (farm_id, template_key, inventory_year, inventory_month)
    );

    CREATE TABLE IF NOT EXISTS inventory_daily_snapshots (
      farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
      inventory_year INTEGER NOT NULL,
      inventory_month SMALLINT NOT NULL CHECK (inventory_month BETWEEN 1 AND 12),
      snapshot_date DATE NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (farm_id, inventory_year, inventory_month, snapshot_date)
    );
  `);

  await pool.query(`
    ALTER TABLE weekly_records ADD COLUMN IF NOT EXISTS production SMALLINT NOT NULL DEFAULT 1;
    ALTER TABLE weekly_records ADD COLUMN IF NOT EXISTS template_key VARCHAR(20);
    ALTER TABLE weekly_records ADD COLUMN IF NOT EXISTS arrangements INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE weekly_records ADD COLUMN IF NOT EXISTS weekly_target INTEGER;
  `);

  await pool.query(`
    INSERT INTO farms (code, name)
    VALUES ('F1', 'Finca P1'), ('F2', 'Finca P2')
    ON CONFLICT (code) DO NOTHING
  `);
  await pool.query("UPDATE farms SET name = 'Finca P2' WHERE code = 'F2' AND name = 'Finca 2'");
  await pool.query("UPDATE farms SET name = 'Finca P1' WHERE code = 'F1' AND name = 'Finca 1'");
  // Completa semanas P1 ya guardadas sin reemplazar metas modificadas por el usuario.
  const targetValues = P1_ROWS.flatMap((row, index) => [row.templateKey, P1_WEEKLY_TARGETS[index]]);
  const placeholders = P1_ROWS.map((_, index) => `($${index * 2 + 1}::varchar, $${index * 2 + 2}::integer)`).join(', ');
  await pool.query(`
    UPDATE weekly_records AS wr SET weekly_target = targets.weekly_target
    FROM (VALUES ${placeholders}) AS targets(template_key, weekly_target), farms AS f
    WHERE wr.farm_id = f.id AND f.code = 'F1' AND wr.template_key = targets.template_key
      AND wr.weekly_target IS NULL
  `, targetValues);
}

async function getFarms() {
  if (!pool) return memory.farms;
  const { rows } = await pool.query('SELECT id, code, name FROM farms ORDER BY id');
  return rows;
}

async function getFieldData(farmId, year, week) {
  const farms = await getFarms();
  const farm = farms.find((item) => Number(item.id) === Number(farmId));
  if (!farm) throw new Error('Finca inválida');
  const defaults = blankFieldData();
  if (farm.code === 'F2') defaults.beds = 1313;
  if (farm.code === 'F1') defaults.beds = 1523;
  if (!pool) {
    const saved = memory.fieldWeeks.get(memoryKey(farmId, year, week));
    return { data: saved || defaults, saved: Boolean(saved) };
  }
  const { rows } = await pool.query(
    'SELECT payload FROM weekly_field_data WHERE farm_id = $1 AND week_year = $2 AND week_number = $3',
    [farmId, year, week],
  );
  return { data: rows.length ? normalizeFieldData(rows[0].payload) : defaults, saved: rows.length > 0 };
}

async function saveFieldData(farmId, year, week, input) {
  const farms = await getFarms();
  if (!farms.some((farm) => Number(farm.id) === Number(farmId))) throw new Error('Finca inválida');
  const data = normalizeFieldData(input);
  if (!pool) {
    memory.fieldWeeks.set(memoryKey(farmId, year, week), data);
  } else {
    await pool.query(`
      INSERT INTO weekly_field_data (farm_id, week_year, week_number, payload)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (farm_id, week_year, week_number)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    `, [farmId, year, week, JSON.stringify(data)]);
  }
  return { data, saved: true };
}

async function getInventory(farmId, templateKey, year, month) {
  const key = `${farmId}:${templateKey}:${year}:${month}`;
  const canCarry = templates[templateKey] && inventoryCarriesOver(templates[templateKey], year, month);
  if (!pool) {
    const data = memory.inventoryMonths.get(key);
    if (data) return { data, saved: true };
    if (canCarry) {
      const prefix = `${farmId}:${templateKey}:`;
      const previous = [...memory.inventoryMonths.entries()]
        .filter(([savedKey]) => savedKey.startsWith(prefix))
        .map(([savedKey, payload]) => {
          const [savedYear, savedMonth] = savedKey.slice(prefix.length).split(':').map(Number);
          return { savedYear, savedMonth, payload };
        })
        .filter((item) => item.savedYear * 12 + item.savedMonth < year * 12 + month)
        .sort((left, right) => right.savedYear * 12 + right.savedMonth - left.savedYear * 12 - left.savedMonth)[0];
      if (previous) return { data: previous.payload, saved: false, carriedFrom: `${previous.savedYear}-${String(previous.savedMonth).padStart(2, '0')}` };
    }
    return { data: blankInventory(), saved: false };
  }
  const { rows } = await pool.query(
    'SELECT payload FROM monthly_inventories WHERE farm_id = $1 AND template_key = $2 AND inventory_year = $3 AND inventory_month = $4',
    [farmId, templateKey, year, month],
  );
  if (rows.length) return { data: rows[0].payload, saved: true };
  if (canCarry) {
    const previous = await pool.query(`
      SELECT payload, inventory_year, inventory_month FROM monthly_inventories
      WHERE farm_id = $1 AND template_key = $2
        AND (inventory_year < $3 OR (inventory_year = $3 AND inventory_month < $4))
      ORDER BY inventory_year DESC, inventory_month DESC LIMIT 1
    `, [farmId, templateKey, year, month]);
    if (previous.rows.length) {
      const item = previous.rows[0];
      return { data: item.payload, saved: false,
        carriedFrom: `${item.inventory_year}-${String(item.inventory_month).padStart(2, '0')}` };
    }
  }
  return { data: blankInventory(), saved: false };
}

async function completeInventorySnapshot(farmId, farmCode, year, month, saved) {
  for (const [key, source] of Object.entries(templates)) {
    if (source.farmCode !== farmCode || saved.has(key)) continue;
    saved.set(key, (await getInventory(farmId, key, year, month)).data);
  }
  return inventorySnapshot(farmId, farmCode, year, month, saved);
}

function inventorySnapshot(farmId, farmCode, year, month, savedInventories) {
  const inventories = Object.entries(templates)
    .filter(([, source]) => source.farmCode === farmCode)
    .map(([key]) => {
      const template = inventoryTemplate(key, farmCode);
      const data = savedInventories.get(key) || blankInventory();
      return { key, stems: inventoryMonthSummary(template, data, year, month).stems };
    });
  return { farmId: Number(farmId), year, month, inventories,
    totalStems: inventories.reduce((sum, item) => sum + item.stems, 0) };
}

async function saveInventory(farmId, templateKey, template, year, month, input, recordedAt = new Date()) {
  const data = normalizeInventory(template, year, month, input);
  const key = `${farmId}:${templateKey}:${year}:${month}`;
  const snapshotDate = inventoryEntryDate(recordedAt);
  const farmCode = template.farmCode;
  if (!pool) {
    const existing = memory.inventoryMonths.get(key) || blankInventory();
    memory.inventoryMonths.set(key, template.sections ? { ...existing, ...data } : data);
    const saved = new Map();
    for (const [inventoryKey] of Object.entries(templates)) {
      const value = memory.inventoryMonths.get(`${farmId}:${inventoryKey}:${year}:${month}`);
      if (value) saved.set(inventoryKey, value);
    }
    memory.inventorySnapshots.set(`${farmId}:${year}:${month}:${snapshotDate}`,
      await completeInventorySnapshot(farmId, farmCode, year, month, saved));
  } else {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${farmId}:${year}:${month}`]);
      const { rows } = await client.query(
        'SELECT payload FROM monthly_inventories WHERE farm_id = $1 AND template_key = $2 AND inventory_year = $3 AND inventory_month = $4',
        [farmId, templateKey, year, month],
      );
      const existing = rows[0]?.payload || blankInventory();
      const stored = template.sections ? { ...existing, ...data } : data;
      await client.query(`
        INSERT INTO monthly_inventories (farm_id, template_key, inventory_year, inventory_month, payload)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (farm_id, template_key, inventory_year, inventory_month)
        DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      `, [farmId, templateKey, year, month, JSON.stringify(stored)]);
      const all = await client.query(
        'SELECT template_key, payload FROM monthly_inventories WHERE farm_id = $1 AND inventory_year = $2 AND inventory_month = $3',
        [farmId, year, month],
      );
      const saved = new Map(all.rows.map((row) => [row.template_key, row.payload]));
      const snapshot = await completeInventorySnapshot(farmId, farmCode, year, month, saved);
      await client.query(`
        INSERT INTO inventory_daily_snapshots (farm_id, inventory_year, inventory_month, snapshot_date, payload)
        VALUES ($1, $2, $3, $4::date, $5::jsonb)
        ON CONFLICT (farm_id, inventory_year, inventory_month, snapshot_date)
        DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      `, [farmId, year, month, snapshotDate, JSON.stringify(snapshot)]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  return { data, saved: true };
}

async function getInventorySnapshot(farmId, year, month, snapshotDate) {
  let snapshot;
  if (!pool) {
    const prefix = `${farmId}:${year}:${month}:`;
    const dates = [...memory.inventorySnapshots.keys()]
      .filter((key) => key.startsWith(prefix) && key.slice(prefix.length) <= snapshotDate).sort();
    snapshot = dates.length ? memory.inventorySnapshots.get(dates.at(-1)) : null;
  } else {
    const { rows } = await pool.query(`
      SELECT payload FROM inventory_daily_snapshots
      WHERE farm_id = $1 AND inventory_year = $2 AND inventory_month = $3 AND snapshot_date <= $4::date
      ORDER BY snapshot_date DESC LIMIT 1
    `, [farmId, year, month, snapshotDate]);
    snapshot = rows[0]?.payload || null;
  }
  return { farmId: Number(farmId), year, month, snapshotDate, saved: Boolean(snapshot),
    inventories: snapshot?.inventories || [], totalStems: snapshot?.totalStems ?? null };
}

async function initializeInventoryMonth(farmId, farmCode, year, month) {
  const copied = [];
  for (const [key, source] of Object.entries(templates)) {
    if (source.farmCode !== farmCode) continue;
    const previous = await getInventory(farmId, key, year, month);
    if (!previous.carriedFrom) continue;
    await saveInventory(farmId, key, inventoryTemplate(key, farmCode), year, month, previous.data);
    copied.push({ key, from: previous.carriedFrom });
  }
  return copied;
}

async function getWeekWithDefaults(farmId, year, week) {
  const records = await getWeek(farmId, year, week);
  const farms = await getFarms();
  const farm = farms.find((item) => Number(item.id) === Number(farmId));
  const template = defaultRecordsForFarm(farm?.code);
  if (!template.length) return { records, fromTemplate: false };
  const used = new Set();
  const merged = template.map((row) => {
    let matchIndex = records.findIndex((stored, index) => !used.has(index) && stored.templateKey === row.templateKey);
    if (matchIndex === -1) {
      matchIndex = records.findIndex((stored, index) => !used.has(index)
        && stored.block === row.block && stored.variety === row.variety);
    }
    if (matchIndex === -1) return row;
    used.add(matchIndex);
    const stored = records[matchIndex];
    return { ...row, id: stored.id, days: stored.days, arrangements: stored.arrangements, weeklyTarget: stored.weeklyTarget ?? row.weeklyTarget };
  });
  return { records: merged, fromTemplate: used.size < template.length };
}

async function getWeek(farmId, year, week) {
  if (!pool) {
    return memory.weeks.get(memoryKey(farmId, year, week)) || [];
  }

  const { rows } = await pool.query(`
    SELECT wr.id, wr.block, wr.variety, wr.notes, wr.display_order,
           wr.production, wr.template_key, wr.arrangements, wr.weekly_target,
           dv.day_of_week, dv.projected, dv.actual
    FROM weekly_records wr
    LEFT JOIN daily_values dv ON dv.record_id = wr.id
    WHERE wr.farm_id = $1 AND wr.week_year = $2 AND wr.week_number = $3
    ORDER BY wr.display_order, wr.id, dv.day_of_week
  `, [farmId, year, week]);

  const records = new Map();
  for (const row of rows) {
    if (!records.has(row.id)) {
      records.set(row.id, {
        id: String(row.id),
        block: row.block,
        variety: row.variety,
        notes: row.notes,
        production: Number(row.production),
        templateKey: row.template_key,
        arrangements: Number(row.arrangements),
        weeklyTarget: row.weekly_target === null ? null : Number(row.weekly_target),
        days: Array.from({ length: 7 }, () => ({ projected: 0, actual: 0 })),
      });
    }
    if (row.day_of_week) {
      records.get(row.id).days[row.day_of_week - 1] = {
        projected: Number(row.projected),
        actual: Number(row.actual),
      };
    }
  }
  return [...records.values()];
}

async function replaceWeek({ farmId, year, week, weekStart, records }) {
  const farms = await getFarms();
  const farm = farms.find((item) => Number(item.id) === Number(farmId));
  if (!farm) throw new Error('Finca inválida');
  let submitted = records;
  const templateRows = templateRowsForFarm(farm.code);
  if (templateRows.length) {
    const byKey = new Map(records.map((record) => [record.templateKey, record]));
    if (records.length !== templateRows.length || byKey.size !== templateRows.length
      || templateRows.some((row) => !byKey.has(row.templateKey))) {
      throw new Error(`Plantilla ${farm.name} inválida: deben conservarse todos los bloques y variedades`);
    }
    submitted = templateRows.map((row) => ({ ...byKey.get(row.templateKey), ...row }));
  }
  const normalized = submitted.map((record, index) => ({
    block: String(record.block || '').trim(),
    variety: String(record.variety || '').trim().toUpperCase(),
    notes: String(record.notes || '').trim(),
    production: Number(record.production) || 1,
    templateKey: record.templateKey || null,
    arrangements: Math.max(0, Number.parseInt(record.arrangements, 10) || 0),
    weeklyTarget: farm.code === 'F1' && record.weeklyTarget !== null && record.weeklyTarget !== undefined && record.weeklyTarget !== ''
      ? Math.max(0, Number.parseInt(record.weeklyTarget, 10) || 0) : null,
    displayOrder: index,
    days: Array.from({ length: 7 }, (_, dayIndex) => ({
      projected: Math.max(0, Number.parseInt(record.days?.[dayIndex]?.projected, 10) || 0),
      actual: Math.max(0, Number.parseInt(record.days?.[dayIndex]?.actual, 10) || 0),
    })),
  })).filter((record) => record.block && record.variety);

  if (!pool) {
    memory.weeks.set(memoryKey(farmId, year, week), normalized.map((record, index) => ({
      id: `mem-${Date.now()}-${index}`,
      ...record,
    })));
    return getWeek(farmId, year, week);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM weekly_records WHERE farm_id = $1 AND week_year = $2 AND week_number = $3',
      [farmId, year, week],
    );

    for (const record of normalized) {
      const inserted = await client.query(`
        INSERT INTO weekly_records
          (farm_id, week_year, week_number, week_start, block, variety, notes, display_order,
           production, template_key, arrangements, weekly_target)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `, [farmId, year, week, weekStart, record.block, record.variety, record.notes,
        record.displayOrder, record.production, record.templateKey, record.arrangements, record.weeklyTarget]);
      const recordId = inserted.rows[0].id;
      for (let day = 0; day < 7; day += 1) {
        await client.query(`
          INSERT INTO daily_values (record_id, day_of_week, projected, actual)
          VALUES ($1, $2, $3, $4)
        `, [recordId, day + 1, record.days[day].projected, record.days[day].actual]);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getWeek(farmId, year, week);
}

async function getHistory(farmId) {
  if (!pool) {
    return [...memory.weeks.entries()]
      .filter(([key]) => key.startsWith(`${farmId}:`))
      .map(([key, records]) => {
        const [, year, week] = key.split(':').map(Number);
        const projected = records.reduce((sum, record) => sum + record.days.reduce((s, d) => s + d.projected, 0), 0);
        const actual = records.reduce((sum, record) => sum + record.days.reduce((s, d) => s + d.actual, 0), 0);
        return { year, week, rows: records.length, projected, actual };
      })
      .sort((a, b) => b.year - a.year || b.week - a.week);
  }

  const { rows } = await pool.query(`
    SELECT wr.week_year AS year, wr.week_number AS week,
           COUNT(DISTINCT wr.id)::int AS rows,
           COALESCE(SUM(dv.projected), 0)::bigint AS projected,
           COALESCE(SUM(dv.actual), 0)::bigint AS actual
    FROM weekly_records wr
    LEFT JOIN daily_values dv ON dv.record_id = wr.id
    WHERE wr.farm_id = $1
    GROUP BY wr.week_year, wr.week_number
    ORDER BY wr.week_year DESC, wr.week_number DESC
    LIMIT 104
  `, [farmId]);
  return rows.map((row) => ({ ...row, projected: Number(row.projected), actual: Number(row.actual) }));
}

async function health() {
  if (!pool) return { database: 'memory', persistent: false };
  await pool.query('SELECT 1');
  return { database: 'postgresql', persistent: true };
}

module.exports = { migrate, getFarms, getWeek, getWeekWithDefaults, replaceWeek, getHistory, getFieldData, saveFieldData, getInventory, saveInventory, initializeInventoryMonth, getInventorySnapshot, health };
