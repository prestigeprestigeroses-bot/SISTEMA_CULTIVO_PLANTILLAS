const DAYS = 7;
const CLIMATE_FIELDS = ['minTemp', 'maxTemp', 'humidity', 'precipitation'];
const WATER_FIELDS = ['initial', 'final', 'drip', 'hose'];

function blankFieldData() {
  const climate = Object.fromEntries(CLIMATE_FIELDS.map((key) => [key, Array(DAYS).fill(null)]));
  const water = Object.fromEntries(WATER_FIELDS.map((key) => [key, Array(DAYS).fill(null)]));
  return { beds: null, climate, water };
}

function numeric(value, label, { min = 0, max = 1000000000 } = {}) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${label} inválido`);
  return parsed;
}

function normalizeFieldData(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Registro inválido');
  const result = blankFieldData();
  result.beds = numeric(input.beds, 'Número de camas', { min: 1, max: 1000000 });
  if (result.beds !== null && !Number.isInteger(result.beds)) throw new Error('Número de camas inválido');
  for (const key of CLIMATE_FIELDS) {
    const values = input.climate?.[key];
    if (values !== undefined && (!Array.isArray(values) || values.length !== DAYS)) throw new Error(`${key} inválido`);
    result.climate[key] = Array.from({ length: DAYS }, (_, day) => numeric(values?.[day], `${key} del día ${day + 1}`, {
      min: key === 'minTemp' || key === 'maxTemp' ? -100 : 0,
      max: key === 'humidity' ? 100 : key === 'precipitation' ? 10000 : 100,
    }));
  }
  for (const key of WATER_FIELDS) {
    const values = input.water?.[key];
    if (values !== undefined && (!Array.isArray(values) || values.length !== DAYS)) throw new Error(`${key} inválido`);
    result.water[key] = Array.from({ length: DAYS }, (_, day) => numeric(values?.[day], `${key} del día ${day + 1}`));
  }
  return result;
}

function average(values) {
  const entered = values.filter((value) => value !== null);
  return entered.length ? entered.reduce((sum, value) => sum + value, 0) / entered.length : null;
}

function derivedFieldData(farmCode, input) {
  const data = normalizeFieldData(input);
  if (!['F1', 'F2'].includes(farmCode)) throw new Error('Finca inválida');
  const daily = Array.from({ length: DAYS }, (_, day) => {
    if (farmCode === 'F1') {
      const initial = data.water.initial[day];
      const final = data.water.final[day];
      if (initial === null || final === null) return null;
      if (final < initial) throw new Error(`Lectura final menor que inicial el día ${day + 1}`);
      return final - initial;
    }
    const drip = data.water.drip[day];
    const hose = data.water.hose[day];
    return drip === null && hose === null ? null : (drip || 0) + (hose || 0);
  });
  const litersPerBed = daily.map((value) => value === null || !data.beds ? null : (value * 1000) / data.beds);
  const totalDaily = daily.reduce((sum, value) => sum + (value || 0), 0);
  return {
    data,
    climateAverage: Object.fromEntries(CLIMATE_FIELDS.map((key) => [key, average(data.climate[key])])),
    daily,
    litersPerBed,
    totalDaily,
    totalLitersPerBed: data.beds ? (totalDaily * 1000) / data.beds : null,
    totalDrip: data.water.drip.reduce((sum, value) => sum + (value || 0), 0),
    totalHose: data.water.hose.reduce((sum, value) => sum + (value || 0), 0),
  };
}

module.exports = { blankFieldData, normalizeFieldData, derivedFieldData };
