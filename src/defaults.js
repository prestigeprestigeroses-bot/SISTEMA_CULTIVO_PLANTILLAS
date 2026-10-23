// Orden oficial de la Finca P2. Las claves permiten guardar los valores sin
// cambiar el bloque, la variedad ni la producción de cada fila.
const P2_GROUPS = [
  {
    production: 1,
    rows: [
      ['3', 'FREEDOM'], ['4', 'FREEDOM'], ['5', 'FREEDOM'],
      ['6', 'FREEDOM'], ['8', 'FREEDOM'],
      ['1', 'VENDELA'], ['1', 'PINK FLOYD'],
      ['2', 'CORAL REFF'], ['2', 'HUMMER'], ['2', 'SWAN'], ['2', 'MOMENTUM'],
      ['3', 'MOMENTUM'], ['3', 'QUICK SAND'], ['3', 'PINK FLOYD'],
      ['4', 'HILUX'],
      ['7', 'CANDLELIGHT'], ['7', 'DEEP PURPLE'],
      ['8', 'STAR PLATINUM'], ['8', 'SUMMERSAND'],
      ['8', 'MOMENTUM'], ['8', 'HIGH MAGIC'],
    ],
  },
  {
    production: 2,
    rows: [
      ['9', 'FREEDOM'], ['10', 'FREEDOM'], ['13', 'FREEDOM'],
      ['10', 'SHIMMER'],
      ['11', 'PINK MONDIAL'], ['11', 'WHITE OHARA'],
      ['11', 'PINK OHARA'], ['11', 'MONDIAL'],
      ['12', 'MONDIAL'], ['12', 'BLESSING'], ['12', 'SUMMERSAND'],
    ],
  },
];

const P1_GROUPS = [
  { production: 1, rows: [
    ['1-A', 'FREEDOM'], ['1', 'FREEDOM'], ['2', 'FREEDOM'],
    ['5', 'DANCING RED'], ['6', 'FREEDOM'],
    ['5', 'EXPLORER'], ['5', 'MONDIAL'], ['5', 'QUICK SAND'],
    ['5', 'QUEEN BERRY'], ['5', 'PINK MONDIAL'],
  ] },
  { production: 2, rows: [
    ['3', 'FREEDOM'], ['4', 'FREEDOM'], ['12', 'FREEDOM'],
    ['7', 'MONDIAL'], ['7', 'MOODY BLUE'], ['7', 'QUEEN BERRY'], ['7', 'MOMENTUM'],
    ['8', 'YELLOW BIKINI'], ['8', 'TIFFANY'], ['8', 'QUICK SAND'], ['8', 'VENDELA'],
    ['9', 'VENDELA'], ['9', 'MONDIAL'], ['9', 'CORAL REEF'], ['9', 'PINK FLOYD'],
    ['10', 'MONDIAL'], ['10', 'HUMMER'], ['10', 'HILUX'], ['10', 'BLESSING'],
    ['11', 'VENDELA'],
  ] },
];

function rowsForGroups(farmCode, groups) {
  return groups.flatMap((group) => group.rows.map(([block, variety], index) => ({
    templateKey: `${farmCode}-P${group.production}-${String(index + 1).padStart(2, '0')}`,
    production: group.production,
    block,
    variety,
  })));
}

const P1_ROWS = rowsForGroups('F1', P1_GROUPS);
// Metas semanales de las dos planillas de resumen P1, en el mismo orden fijo de P1_ROWS.
const P1_WEEKLY_TARGETS = [
  1349, 8760, 8754, 7, 9183, 68, 166, 67, 2623, 2855,
  8754, 8961, 9607, 4961, 764, 1835, 2554, 3142, 3559, 981,
  4967, 4075, 887, 1923, 1902, 1875, 2226, 1611, 417, 4634,
];
const P1_TARGET_BY_KEY = Object.fromEntries(P1_ROWS.map((row, index) => [row.templateKey, P1_WEEKLY_TARGETS[index]]));
const P2_ROWS = P2_GROUPS.flatMap((group) => group.rows.map(([block, variety], index) => ({
  templateKey: `P${group.production}-${String(index + 1).padStart(2, '0')}`,
  production: group.production,
  block,
  variety,
})));

function defaultRecordsForFarm(farmCode) {
  return templateRowsForFarm(farmCode).map((row) => ({
    ...row,
    id: `template-${row.templateKey}`,
    notes: '',
    arrangements: 0,
    weeklyTarget: farmCode === 'F1' ? P1_TARGET_BY_KEY[row.templateKey] : null,
    days: Array.from({ length: 7 }, () => ({ projected: 0, actual: 0 })),
  }));
}

function templateRowsForFarm(farmCode) {
  return farmCode === 'F1' ? P1_ROWS : farmCode === 'F2' ? P2_ROWS : [];
}

module.exports = { P1_GROUPS, P1_ROWS, P1_WEEKLY_TARGETS, P2_GROUPS, P2_ROWS, templateRowsForFarm, defaultRecordsForFarm };
