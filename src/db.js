const { Pool } = require('pg');
const { defaultRecordsForFarm, templateRowsForFarm } = require('./defaults');

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
};

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
  `);

  await pool.query(`
    ALTER TABLE weekly_records ADD COLUMN IF NOT EXISTS production SMALLINT NOT NULL DEFAULT 1;
    ALTER TABLE weekly_records ADD COLUMN IF NOT EXISTS template_key VARCHAR(20);
    ALTER TABLE weekly_records ADD COLUMN IF NOT EXISTS arrangements INTEGER NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    INSERT INTO farms (code, name)
    VALUES ('F1', 'Finca P1'), ('F2', 'Finca P2')
    ON CONFLICT (code) DO NOTHING
  `);
  await pool.query("UPDATE farms SET name = 'Finca P2' WHERE code = 'F2' AND name = 'Finca 2'");
  await pool.query("UPDATE farms SET name = 'Finca P1' WHERE code = 'F1' AND name = 'Finca 1'");
}

async function getFarms() {
  if (!pool) return memory.farms;
  const { rows } = await pool.query('SELECT id, code, name FROM farms ORDER BY id');
  return rows;
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
    return { ...row, id: stored.id, days: stored.days, arrangements: stored.arrangements };
  });
  return { records: merged, fromTemplate: used.size < template.length };
}

async function getWeek(farmId, year, week) {
  if (!pool) {
    return memory.weeks.get(memoryKey(farmId, year, week)) || [];
  }

  const { rows } = await pool.query(`
    SELECT wr.id, wr.block, wr.variety, wr.notes, wr.display_order,
           wr.production, wr.template_key, wr.arrangements,
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
           production, template_key, arrangements)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, [farmId, year, week, weekStart, record.block, record.variety, record.notes,
        record.displayOrder, record.production, record.templateKey, record.arrangements]);
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

module.exports = { migrate, getFarms, getWeek, getWeekWithDefaults, replaceWeek, getHistory, health };
