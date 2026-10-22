function getIsoWeekParts(date = new Date()) {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return { year: utc.getUTCFullYear(), week };//$%
}

function isoWeekStart(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + ((week - 1) * 7));
  return monday.toISOString().slice(0, 10);
}

function assertWeek(year, week) {
  const safeYear = Number(year);
  const safeWeek = Number(week);
  if (!Number.isInteger(safeYear) || safeYear < 2020 || safeYear > 2100) {
    throw new Error('Año de semana inválido');
  }
  if (!Number.isInteger(safeWeek) || safeWeek < 1 || safeWeek > 53) {
    throw new Error('Número de semana inválido');
  }
  return { year: safeYear, week: safeWeek };
}

module.exports = { getIsoWeekParts, isoWeekStart, assertWeek };
