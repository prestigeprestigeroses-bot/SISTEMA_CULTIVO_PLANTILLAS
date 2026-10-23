const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const state = {
  farms: [],
  farmId: null,
  year: null,
  week: null,
  records: [],
  history: [],
  dirty: false,
  fromTemplate: false,
  loading: false,
  selectedDay: todayIndex(),
  fieldData: null,
  fieldDirty: false,
  fieldDay: todayIndex(),
  activeView: 'projection',
};

function todayIndex() { return (new Date().getDay() + 6) % 7; }

function createAutosave(persist, delay = 1000) {
  let timer;
  let revision = 0;
  let savedRevision = 0;
  let pending = null;
  async function flush() {
    clearTimeout(timer);
    timer = null;
    if (pending) {
      if (!(await pending)) return false;
      return flush();
    }
    if (revision === savedRevision) return true;
    const savingRevision = revision;
    pending = Promise.resolve().then(() => persist(() => revision === savingRevision));
    let success;
    try { success = await pending; }
    catch (error) { showToast(error.message || 'No se pudo autoguardar', 'error'); success = false; }
    finally { pending = null; renderSaveState(); }
    if (!success) return false;
    savedRevision = savingRevision;
    return flush();
  }
  return {
    mark() {
      revision += 1;
      clearTimeout(timer);
      timer = setTimeout(() => { void flush(); }, delay);
    },
    flush,
    reset() { clearTimeout(timer); timer = null; revision = 0; savedRevision = 0; },
    get saving() { return Boolean(pending); },
    get revision() { return revision; },
  };
}
window.createAutosave = createAutosave;

const elements = {
  farmSelect: document.querySelector('#farmSelect'),
  weekNumber: document.querySelector('#weekNumber'),
  periodTitle: document.querySelector('#periodTitle'),
  periodSubtitle: document.querySelector('#periodSubtitle'),
  projectedTotal: document.querySelector('#projectedTotal'),
  actualTotal: document.querySelector('#actualTotal'),
  projectedDetail: document.querySelector('#projectedDetail'),
  performanceTotal: document.querySelector('#performanceTotal'),
  performanceSuffix: document.querySelector('#performanceSuffix'),
  performanceBar: document.querySelector('#performanceBar'),
  projectionHead: document.querySelector('#projectionHead'),
  projectionBody: document.querySelector('#projectionBody'),
  projectionFoot: document.querySelector('#projectionFoot'),
  mobileCapture: document.querySelector('#mobileCapture'),
  captureInputContext: document.querySelector('#captureInputContext'),
  captureInputLabel: document.querySelector('#captureInputLabel'),
  captureInputValue: document.querySelector('#captureInputValue'),
  sheetCard: document.querySelector('#sheetCard'),
  expandSheet: document.querySelector('#expandSheet'),
  saveSheetButton: document.querySelector('#saveSheetButton'),
  emptyState: document.querySelector('#emptyState'),
  quickAddForm: document.querySelector('#quickAddForm'),
  entryCard: document.querySelector('#entryCard'),
  blockInput: document.querySelector('#blockInput'),
  varietyInput: document.querySelector('#varietyInput'),
  saveButton: document.querySelector('#saveButton'),
  exportButton: document.querySelector('#exportButton'),
  saveState: document.querySelector('#saveState'),
  projectionView: document.querySelector('#projectionView'),
  historyView: document.querySelector('#historyView'),
  temperatureView: document.querySelector('#temperatureView'),
  waterView: document.querySelector('#waterView'),
  temperatureEditor: document.querySelector('#temperatureEditor'),
  waterEditor: document.querySelector('#waterEditor'),
  historyGrid: document.querySelector('#historyGrid'),
  historyCount: document.querySelector('#historyCount'),
  historySearch: document.querySelector('#historySearch'),
  toast: document.querySelector('#toast'),
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatNumber(value) {
  return new Intl.NumberFormat('es-EC').format(Number(value) || 0);
}

function isoWeekParts(date = new Date()) {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return { year: utc.getUTCFullYear(), week: Math.ceil((((utc - yearStart) / 86400000) + 1) / 7) };
}

function weekMonday(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  jan4.setUTCDate(jan4.getUTCDate() - day + 1 + ((week - 1) * 7));
  return jan4;
}

function weekRange(year, week) {
  const monday = weekMonday(year, week);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const dayMonth = new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const fullDate = new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return {
    title: `${dayMonth.format(monday)} — ${dayMonth.format(sunday)}`,
    subtitle: `${fullDate.format(monday)} al ${fullDate.format(sunday)}`,
  };
}

function blankDays() {
  return Array.from({ length: 7 }, () => ({ projected: 0, actual: 0 }));
}

function isFixedFarm() {
  return ['F1', 'F2'].includes(state.farms.find((farm) => Number(farm.id) === state.farmId)?.code);
}

function totals() {
  return state.records.reduce((summary, record) => {
    record.days.forEach((day, index) => {
      const projected = Number(day.projected) || 0;
      const actual = Number(day.actual) || 0;
      summary.projected += projected;
      summary.actual += actual;
      summary.days[index].projected += projected;
      summary.days[index].actual += actual;
    });
    return summary;
  }, { projected: 0, actual: 0, days: blankDays() });
}

function setDirty(value) {
  state.dirty = value;
  if (value && window.authApp?.canEdit('production')) projectionAutosave.mark();
  renderSaveState();
}

function renderSaveState() {
  if (window.authApp?.role === 'viewer') {
    elements.saveState.className = 'save-state saved';
    elements.saveState.innerHTML = '<span></span> Solo lectura';
    elements.saveState.title = 'Solo lectura';
    return;
  }
  const changed = state.dirty || state.fieldDirty || window.inventoryApp?.dirty;
  const needsSave = changed || state.fromTemplate;
  elements.saveState.className = `save-state ${needsSave ? 'dirty' : 'saved'}`;
  const saving = projectionAutosave.saving || fieldAutosave.saving || window.inventoryApp?.saving;
  const label = saving ? 'Autoguardando…' : changed ? 'Pendiente de autoguardado' : state.fromTemplate ? 'Plantilla sin guardar' : 'Todo guardado';
  elements.saveState.innerHTML = `<span></span> ${label}`;
  elements.saveState.title = label;
}

function showToast(message, type = 'success') {
  elements.toast.textContent = message;
  elements.toast.className = `toast visible ${type === 'error' ? 'error' : ''}`;
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => { elements.toast.className = 'toast'; }, 3200);
}

async function api(url, options) {
  const response = await fetch(url, options);
  let payload;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) throw new Error(payload?.error || 'No fue posible completar la operación');
  return payload;
}

function renderPeriod() {
  const range = weekRange(state.year, state.week);
  elements.weekNumber.textContent = state.week;
  elements.periodTitle.textContent = range.title;
  elements.periodSubtitle.textContent = range.subtitle;
  document.querySelector('#tableTitle').textContent = elements.sheetCard.classList.contains('sheet-expanded')
    ? `Semana ${state.week}` : `Proyección por día · Semana ${state.week}`;
  document.querySelectorAll('[data-week-label]').forEach((label) => { label.textContent = `Semana ${state.week} · ${state.year} · ${range.title}`; });
}

function renderMetrics() {
  const summary = totals();
  const varieties = new Set(state.records.map((record) => record.variety.trim().toUpperCase()).filter(Boolean));
  const performance = summary.projected > 0 ? Math.round((summary.actual / summary.projected) * 100) : null;
  elements.projectedTotal.textContent = formatNumber(summary.projected);
  elements.actualTotal.textContent = formatNumber(summary.actual);
  elements.projectedDetail.textContent = `${varieties.size} ${varieties.size === 1 ? 'variedad activa' : 'variedades activas'}`;
  elements.performanceTotal.textContent = performance === null ? '—' : performance;
  elements.performanceSuffix.textContent = performance === null ? '' : '%';
  elements.performanceBar.style.width = `${Math.min(performance || 0, 100)}%`;
}

function renderHead() {
  elements.projectionHead.innerHTML = `
    <tr>
      <th class="identity" rowspan="2">Bloque</th>
      <th class="variety" rowspan="2">Variedad</th>
      ${DAYS.map((day, index) => `<th class="day day-${index}" colspan="2">${day}</th>`).join('')}
      <th class="total-head total-projected" rowspan="2">Total<br>proy.</th>
      <th class="total-head total-real" rowspan="2">Total<br>real</th>
      <th class="total-head arrangements-head" rowspan="2">Total<br>arreglos</th>
      ${isFixedFarm() ? '' : '<th rowspan="2" aria-label="Acciones"></th>'}
    </tr>
    <tr>
      ${DAYS.map((_, index) => `<th class="projection-sub day-${index}">Proy.</th><th class="actual-sub day-${index}">Real</th>`).join('')}
    </tr>`;
}

function rowTotals(record) {
  return record.days.reduce((result, day) => ({
    projected: result.projected + (Number(day.projected) || 0),
    actual: result.actual + (Number(day.actual) || 0),
  }), { projected: 0, actual: 0 });
}

function renderRows() {
  const locked = isFixedFarm();
  renderHead();
  elements.entryCard.hidden = locked;
  elements.emptyState.classList.toggle('visible', state.records.length === 0 && !state.loading);
  const html = [];
  state.records.forEach((record, rowIndex) => {
    if (locked && (rowIndex === 0 || state.records[rowIndex - 1].production !== record.production)) {
      html.push(`<tr class="production-heading"><td colspan="19">PRODUCCIÓN ${record.production}</td></tr>`);
    }
    const sum = rowTotals(record);
    html.push(`
      <tr data-row="${rowIndex}">
        <td class="identity-cell">
          ${locked ? `<span class="fixed-identity">${escapeHtml(record.block)}</span>` : `<input class="identity-input" aria-label="Bloque fila ${rowIndex + 1}" data-field="block" value="${escapeHtml(record.block)}" />`}
        </td>
        <td class="variety-cell ${['FREEDOM', 'DANCING RED'].includes(record.variety) ? 'freedom-cell' : ''}">
          ${locked ? `<span class="fixed-variety">${escapeHtml(record.variety)}</span>` : `<input class="variety-input" aria-label="Variedad fila ${rowIndex + 1}" data-field="variety" value="${escapeHtml(record.variety)}" />`}
        </td>
        ${record.days.map((day, dayIndex) => `
          <td class="value-cell projected-cell day-${dayIndex}"><input type="number" min="0" step="1" inputmode="numeric" aria-label="Proyección ${DAYS[dayIndex]} fila ${rowIndex + 1}" data-day="${dayIndex}" data-kind="projected" value="${Number(day.projected) || ''}" placeholder="0" /></td>
          <td class="value-cell actual-cell day-${dayIndex}"><input type="number" min="0" step="1" inputmode="numeric" aria-label="Real ${DAYS[dayIndex]} fila ${rowIndex + 1}" data-day="${dayIndex}" data-kind="actual" value="${Number(day.actual) || ''}" placeholder="0" /></td>
        `).join('')}
        <td class="total-cell total-projected row-projected">${formatNumber(sum.projected)}</td>
        <td class="total-cell total-real row-actual">${formatNumber(sum.actual)}</td>
        <td class="arrangements-cell"><input type="number" min="0" step="1" inputmode="numeric" aria-label="Total arreglos ${record.variety} bloque ${record.block}" data-field="arrangements" value="${Number(record.arrangements) || ''}" placeholder="0" /></td>
        ${locked ? '' : `<td><button class="delete-row" data-action="delete" title="Eliminar fila" aria-label="Eliminar fila ${rowIndex + 1}">×</button></td>`}
      </tr>`);
    if (locked && (rowIndex === state.records.length - 1 || state.records[rowIndex + 1].production !== record.production)) {
      html.push(`<tr class="production-total" data-production="${record.production}"><td colspan="2">TOTAL PRODUCCIÓN ${record.production}</td>${Array.from({ length: 17 }, (_, index) => `<td class="${index === 14 ? 'total-projected' : index === 15 ? 'total-real' : index === 16 ? 'arrangements-total' : ''}">0</td>`).join('')}</tr>`);
    }
  });
  elements.projectionBody.innerHTML = html.join('');
  renderGroupTotals();
  renderFoot();
  renderMetrics();
  renderMobile();
}

function renderGroupTotals() {
  if (!isFixedFarm()) return;
  for (const production of [1, 2]) {
    const records = state.records.filter((record) => record.production === production);
    const dayValues = blankDays();
    let projected = 0;
    let actual = 0;
    let arrangements = 0;
    for (const record of records) {
      record.days.forEach((day, index) => {
        dayValues[index].projected += Number(day.projected) || 0;
        dayValues[index].actual += Number(day.actual) || 0;
      });
      projected += rowTotals(record).projected;
      actual += rowTotals(record).actual;
      arrangements += Number(record.arrangements) || 0;
    }
    const row = elements.projectionBody.querySelector(`[data-production="${production}"]`);
    if (!row) continue;
    const cells = row.querySelectorAll('td');
    const values = [...dayValues.flatMap((day) => [day.projected, day.actual]), projected, actual, arrangements];
    values.forEach((value, index) => { cells[index + 1].textContent = formatNumber(value); });
  }
}

function renderFoot() {
  const summary = totals();
  const arrangements = state.records.reduce((sum, record) => sum + (Number(record.arrangements) || 0), 0);
  elements.projectionFoot.innerHTML = `
    <tr>
      <td colspan="2">TOTAL SEMANA</td>
      ${summary.days.map((day) => `<td>${formatNumber(day.projected)}</td><td>${formatNumber(day.actual)}</td>`).join('')}
      <td class="total-projected">${formatNumber(summary.projected)}</td>
      <td class="total-real">${formatNumber(summary.actual)}</td>
      <td class="arrangements-total">${formatNumber(arrangements)}</td>
      ${isFixedFarm() ? '' : '<td></td>'}
    </tr>`;
}

function updateRowDisplay(rowIndex) {
  const row = elements.projectionBody.querySelector(`tr[data-row="${rowIndex}"]`);
  if (!row) return;
  const sum = rowTotals(state.records[rowIndex]);
  row.querySelector('.row-projected').textContent = formatNumber(sum.projected);
  row.querySelector('.row-actual').textContent = formatNumber(sum.actual);
  renderGroupTotals();
  renderFoot();
  renderMetrics();
  updateMobileCard(rowIndex);
}

function renderMobile() {
  const fixed = isFixedFarm();
  const day = state.selectedDay;
  const today = todayIndex();
  const rows = [];
  state.records.forEach((record, index) => {
    if (fixed && (index === 0 || state.records[index - 1].production !== record.production)) {
      rows.push(`<div class="mobile-production">PRODUCCIÓN ${record.production}</div>`);
    }
    const sum = rowTotals(record);
    rows.push(`<div class="mobile-record" role="row" data-mobile-row="${index}">
      <span class="mobile-block" role="cell">${escapeHtml(record.block)}</span>
      <strong class="mobile-variety ${['FREEDOM', 'DANCING RED'].includes(record.variety) ? 'red-variety' : ''}" role="cell">${escapeHtml(record.variety)}</strong>
      <label class="mobile-projected" role="cell"><span class="sr-only">Proyección ${DAYS[day]}</span><input type="number" min="0" step="1" inputmode="numeric" data-day="${day}" data-kind="projected" aria-label="Proyección ${DAYS[day]} ${record.variety} bloque ${record.block}" value="${Number(record.days[day].projected) || ''}" placeholder="0"></label>
      <label class="mobile-actual" role="cell"><span class="sr-only">Real ${DAYS[day]}</span><input type="number" min="0" step="1" inputmode="numeric" data-day="${day}" data-kind="actual" aria-label="Real ${DAYS[day]} ${record.variety} bloque ${record.block}" value="${Number(record.days[day].actual) || ''}" placeholder="0"></label>
      <span class="mobile-total-projected" role="cell">${formatNumber(sum.projected)}</span>
      <span class="mobile-total-real" role="cell">${formatNumber(sum.actual)}</span>
      <label class="mobile-arrangements" role="cell"><span class="sr-only">Total arreglos</span><input type="number" min="0" step="1" inputmode="numeric" data-field="arrangements" aria-label="Total arreglos ${record.variety} bloque ${record.block}" value="${Number(record.arrangements) || ''}" placeholder="0"></label>
    </div>`);
    if (fixed && (index === state.records.length - 1 || state.records[index + 1].production !== record.production)) {
      rows.push(`<div class="mobile-summary" data-mobile-production="${record.production}"><span class="mobile-summary-label">TOTAL P${record.production}</span><span class="mobile-summary-projected">0</span><span class="mobile-summary-actual">0</span><span class="mobile-summary-arrangements">0</span></div>`);
    }
  });
  elements.mobileCapture.innerHTML = `<div class="mobile-days" role="group" aria-label="Día para capturar">${DAYS.map((name, index) => `<button type="button" class="${day === index ? 'active' : ''} ${today === index ? 'today' : ''}" data-select-day="${index}" aria-pressed="${day === index}" ${today === index ? 'aria-current="date"' : ''}>${name.slice(0, 3)}</button>`).join('')}</div><div class="mobile-sheet-scroll"><div class="mobile-sheet day-${day}" role="table" aria-label="Planilla de ${DAYS[day]}"><div class="mobile-grid-head" role="row"><span role="columnheader">BLQ</span><span role="columnheader">VARIEDAD</span><span role="columnheader">PROY.</span><span role="columnheader">REAL</span><span role="columnheader">T.PROY.</span><span role="columnheader">T.REAL</span><span role="columnheader">ARREG.</span></div>${rows.join('') || '<p class="mobile-day-note">Aún no hay filas en esta semana.</p>'}<div class="mobile-summary mobile-week-summary"><span class="mobile-summary-label">TOTAL SEMANA</span><span class="mobile-summary-projected">0</span><span class="mobile-summary-actual">0</span><span class="mobile-summary-arrangements">0</span></div></div></div>`;
  renderMobileSummaries();
}

function updateMobileCard(rowIndex) {
  const card = elements.mobileCapture.querySelector(`[data-mobile-row="${rowIndex}"]`);
  if (!card) return;
  const record = state.records[rowIndex];
  const sum = rowTotals(record);
  card.querySelector('.mobile-total-projected').textContent = formatNumber(sum.projected);
  card.querySelector('.mobile-total-real').textContent = formatNumber(sum.actual);
  for (const kind of ['projected', 'actual']) {
    const input = card.querySelector(`[data-kind="${kind}"]`);
    if (document.activeElement !== input) input.value = record.days[state.selectedDay][kind] || '';
  }
  const arrangements = card.querySelector('[data-field="arrangements"]');
  if (document.activeElement !== arrangements) arrangements.value = record.arrangements || '';
  renderMobileSummaries();
}

function renderMobileSummaries() {
  const update = (element, records) => {
    if (!element) return;
    element.querySelector('.mobile-summary-projected').textContent = formatNumber(records.reduce((sum, record) => sum + rowTotals(record).projected, 0));
    element.querySelector('.mobile-summary-actual').textContent = formatNumber(records.reduce((sum, record) => sum + rowTotals(record).actual, 0));
    element.querySelector('.mobile-summary-arrangements').textContent = formatNumber(records.reduce((sum, record) => sum + (Number(record.arrangements) || 0), 0));
  };
  for (const production of [1, 2]) update(elements.mobileCapture.querySelector(`[data-mobile-production="${production}"]`), state.records.filter((record) => record.production === production));
  update(elements.mobileCapture.querySelector('.mobile-week-summary'), state.records);
}

const CLIMATE_ROWS = {
  F1: [
    { key: 'minTemp', label: 'TEMPERATURA MÍN.', unit: '°C' },
    { key: 'maxTemp', label: 'TEMPERATURA MÁX.', unit: '°C' },
    { key: 'humidity', label: 'HUMEDAD RELATIVA', unit: '%' },
    { key: 'precipitation', label: 'PRECIPITACIÓN', unit: 'mm' },
  ],
  F2: [
    { key: 'maxTemp', label: 'TEMPERATURA MÁX.', unit: '°C' },
    { key: 'minTemp', label: 'TEMPERATURA MÍN.', unit: '°C' },
    { key: 'precipitation', label: 'PRECIPITACIÓN', unit: 'mm' },
    { key: 'humidity', label: 'HUMEDAD RELATIVA', unit: '%' },
  ],
};

function farmCode() {
  return state.farms.find((farm) => Number(farm.id) === state.farmId)?.code || 'F1';
}

function applyFarmTheme() {
  document.body.dataset.farm = farmCode();
}

function waterRows() {
  return farmCode() === 'F1' ? [
    { key: 'initial', label: 'LECTURA INICIAL', unit: 'm³', section: 'water' },
    { key: 'final', label: 'LECTURA FINAL', unit: 'm³', section: 'water' },
    { key: 'daily', label: 'CONSUMO DIARIO', unit: 'm³', section: 'water', computed: true },
    { key: 'liters', label: 'CONSUMO ACUMULADO', unit: 'L/cama', section: 'water', computed: true },
  ] : [
    { key: 'drip', label: 'GOTEO', unit: 'm³', section: 'water' },
    { key: 'hose', label: 'CACHO', unit: 'm³', section: 'water' },
    { key: 'daily', label: 'CONSUMO DIARIO', unit: 'm³', section: 'water', computed: true },
    { key: 'liters', label: 'CONSUMO ACUMULADO', unit: 'L/cama', section: 'water', computed: true },
  ];
}

function fieldNumber(value, digits = 1) {
  return value === null || value === undefined ? '—'
    : new Intl.NumberFormat('es-CO', { maximumFractionDigits: digits }).format(value);
}

function fieldInputValue(value) {
  return value === null || value === undefined ? ''
    : new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3, useGrouping: true }).format(value);
}

function parseFieldNumber(text, reading = false) {
  const raw = text.trim().replace(/\s/g, '');
  if (!raw) return null;
  const normalized = reading && /^\d{1,3}(\.\d{3})+$/.test(raw)
    ? raw.replaceAll('.', '') : raw.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return NaN;
  return Number(normalized);
}

function fieldCalculations() {
  const data = state.fieldData;
  if (!data) return null;
  const daily = Array.from({ length: 7 }, (_, day) => {
    if (farmCode() === 'F1') {
      const initial = data.water.initial[day];
      const final = data.water.final[day];
      return initial === null || final === null || final < initial ? null : final - initial;
    }
    const drip = data.water.drip[day];
    const hose = data.water.hose[day];
    return drip === null && hose === null ? null : (drip || 0) + (hose || 0);
  });
  const liters = daily.map((amount) => amount === null || !data.beds ? null : amount * 1000 / data.beds);
  const averages = Object.fromEntries(Object.entries(data.climate).map(([key, values]) => {
    const entered = values.filter((value) => value !== null);
    return [key, entered.length ? entered.reduce((sum, value) => sum + value, 0) / entered.length : null];
  }));
  const totalDaily = daily.reduce((sum, value) => sum + (value || 0), 0);
  return { daily, liters, averages, totalDaily, totalLiters: data.beds ? totalDaily * 1000 / data.beds : null };
}

function fieldValue(row, day, calculations) {
  if (row.key === 'daily') return calculations.daily[day];
  if (row.key === 'liters') return calculations.liters[day];
  return state.fieldData[row.section][row.key][day];
}

function fieldTotal(row, calculations) {
  if (row.section === 'climate') return calculations.averages[row.key];
  if (row.key === 'daily') return calculations.totalDaily;
  if (row.key === 'liters') return calculations.totalLiters;
  if (row.key === 'drip' || row.key === 'hose') return state.fieldData.water[row.key].reduce((sum, value) => sum + (value || 0), 0);
  return null;
}

function isTemperatureRow(row) {
  return row.section === 'climate' && (row.key === 'minTemp' || row.key === 'maxTemp');
}

function fieldTotalText(row, calculations) {
  const value = fieldTotal(row, calculations);
  const suffix = value === null ? '' : isTemperatureRow(row) ? ' °C' : row.section === 'climate' && row.key === 'humidity' ? '%' : '';
  return `${fieldNumber(value, 2)}${suffix}`;
}

function fieldCell(row, day, calculations) {
  const value = fieldValue(row, day, calculations);
  if (row.computed) return `<span class="field-computed" data-result="${row.key}" data-day="${day}">${fieldNumber(value, row.key === 'liters' ? 2 : 3)}</span>`;
  const input = `<input class="field-input" type="text" inputmode="decimal" autocomplete="off" data-section="${row.section}" data-field="${row.key}" data-day="${day}" aria-label="${row.label} ${DAYS[day]}${isTemperatureRow(row) ? ' en grados centígrados' : ''}" value="${escapeHtml(fieldInputValue(value))}" placeholder="—">`;
  return isTemperatureRow(row) ? `<span class="field-temperature-input">${input}<span aria-hidden="true">°C</span></span>` : input;
}

function renderFieldEditor(kind) {
  if (!state.fieldData) return;
  const isClimate = kind === 'climate';
  const rows = isClimate ? CLIMATE_ROWS[farmCode()].map((row) => ({ ...row, section: 'climate' })) : waterRows();
  const calculations = fieldCalculations();
  const title = isClimate ? `TEMPERATURA Y PRECIPITACIÓN · ${farmCode().replace('F', 'P')}` : `LECTURA VÁLVULA VOLUMÉTRICA · ${farmCode().replace('F', 'P')}`;
  const editor = isClimate ? elements.temperatureEditor : elements.waterEditor;
  const beds = isClimate ? '' : `<div class="beds-line"><label for="bedsInput">NÚMERO DE CAMAS</label><input id="bedsInput" class="field-input" type="text" inputmode="numeric" data-beds="true" value="${escapeHtml(fieldInputValue(state.fieldData.beds))}" placeholder="Ingresar camas"><span>El consumo por cama se calcula con este valor.</span></div>`;
  const desktopRows = rows.map((row) => `<tr class="${row.computed ? 'calculated-row' : ''}"><th scope="row">${row.label} <small>${row.unit}</small></th>${DAYS.map((_, day) => `<td>${fieldCell(row, day, calculations)}</td>`).join('')}<td class="field-total" data-total="${row.key}">${fieldTotalText(row, calculations)}</td></tr>`).join('');
  const day = state.fieldDay;
  const mobileRows = rows.map((row) => `<div class="field-mobile-row ${row.computed ? 'calculated-row' : ''}"><div><strong>${row.label}</strong><small>${row.unit}</small></div><div>${fieldCell(row, day, calculations)}</div><div class="field-total" data-total="${row.key}">${fieldTotalText(row, calculations)}</div></div>`).join('');
  editor.innerHTML = `<section class="field-card"><div class="field-card-title">${title}</div>${beds}<div class="field-table-scroll"><table class="field-table"><thead><tr><th scope="col">REGISTRO</th>${DAYS.map((name) => `<th scope="col">${name.toUpperCase()}</th>`).join('')}<th scope="col">${isClimate ? 'PROMEDIO' : 'ACUMULADO'}</th></tr></thead><tbody>${desktopRows}</tbody></table></div><div class="field-mobile"><div class="field-day-tabs" role="group" aria-label="Día del registro">${DAYS.map((name, index) => `<button type="button" data-field-day="${index}" class="${day === index ? 'active' : ''} ${todayIndex() === index ? 'today' : ''}" aria-pressed="${day === index}" ${todayIndex() === index ? 'aria-current="date"' : ''}>${name.slice(0, 3)}</button>`).join('')}</div><div class="field-mobile-head"><span>REGISTRO</span><span>${DAYS[day].toUpperCase()}</span><span>${isClimate ? 'PROM.' : 'ACUM.'}</span></div>${mobileRows}</div></section>`;
}

function renderFieldEditors() {
  renderFieldEditor('climate');
  renderFieldEditor('water');
}

function updateFieldCalculations() {
  const calculations = fieldCalculations();
  if (!calculations) return;
  for (const editor of [elements.temperatureEditor, elements.waterEditor]) {
    editor.querySelectorAll('[data-result]').forEach((node) => {
      const value = node.dataset.result === 'daily' ? calculations.daily[Number(node.dataset.day)] : calculations.liters[Number(node.dataset.day)];
      node.textContent = fieldNumber(value, node.dataset.result === 'liters' ? 2 : 3);
    });
    editor.querySelectorAll('[data-total]').forEach((node) => {
      const rows = [...CLIMATE_ROWS.F1, ...waterRows()].map((row) => ({ ...row, section: row.section || 'climate' }));
      const row = rows.find((item) => item.key === node.dataset.total);
      node.textContent = fieldTotalText(row, calculations);
    });
  }
}

async function loadFieldData() {
  if (!state.farmId) return;
  fieldAutosave.reset();
  try {
    const result = await api(`/api/field-data/${state.farmId}/${state.year}/${state.week}`);
    state.fieldData = result.data;
    state.fieldDirty = false;
    state.fieldDay = todayIndex();
    renderFieldEditors();
    renderSaveState();
  } catch (error) {
    state.fieldData = null;
    elements.temperatureEditor.innerHTML = `<p class="field-error">${escapeHtml(error.message)}</p>`;
    elements.waterEditor.innerHTML = `<p class="field-error">${escapeHtml(error.message)}</p>`;
    showToast(error.message, 'error');
  }
}

function fieldInputFocused() {
  const active = document.activeElement;
  return active instanceof HTMLInputElement &&
    (elements.temperatureEditor.contains(active) || elements.waterEditor.contains(active));
}

async function refreshFieldData() {
  if (!state.farmId || !state.fieldData || state.fieldDirty || fieldAutosave.saving || fieldInputFocused()) return;
  const { farmId, year, week } = state;
  const revision = fieldAutosave.revision;
  const result = await api(`/api/field-data/${farmId}/${year}/${week}`, { cache: 'no-store' });
  if (farmId !== state.farmId || year !== state.year || week !== state.week ||
    revision !== fieldAutosave.revision || state.fieldDirty || fieldAutosave.saving || fieldInputFocused()) return;
  if (JSON.stringify(state.fieldData) === JSON.stringify(result.data)) return;
  state.fieldData = result.data;
  renderFieldEditors();
}

const fieldAutosave = createAutosave(async (isCurrent) => {
  if (!window.authApp?.canEdit('production')) return false;
  if (!state.fieldData) return false;
  const invalid = document.querySelector('.field-editor .field-input:invalid');
  if (invalid) { invalid.reportValidity(); return false; }
  const farmId = state.farmId;
  const year = state.year;
  const week = state.week;
  const payload = JSON.stringify(state.fieldData);
  document.querySelectorAll('.field-save').forEach((button) => { button.disabled = true; button.textContent = 'Guardando…'; });
  renderSaveState();
  try {
    const result = await api(`/api/field-data/${farmId}/${year}/${week}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: payload,
    });
    if (isCurrent()) {
      state.fieldData = result.data;
      state.fieldDirty = false;
    }
    renderSaveState();
    return true;
  } catch (error) { showToast(error.message, 'error'); return false; }
  finally { document.querySelectorAll('.field-save').forEach((button) => { button.disabled = false; button.textContent = '✓ Guardar registro'; }); }
});

async function saveFieldData() {
  if (!window.authApp?.canEdit('production') || !state.fieldData) return false;
  if (!state.fieldDirty) return true;
  const saved = await fieldAutosave.flush();
  if (saved) showToast(`Registro de ${farmCode().replace('F', 'P')} · semana ${state.week} guardado.`);
  return saved;
}

async function loadWeek() {
  if (!state.farmId) return;
  projectionAutosave.reset();
  state.loading = true;
  elements.emptyState.classList.remove('visible');
  elements.projectionBody.innerHTML = '<tr><td colspan="20" style="padding:35px;text-align:center;color:#6d776f">Cargando semana…</td></tr>';
  renderPeriod();
  try {
    const data = await api(`/api/projections/${state.farmId}/${state.year}/${state.week}`);
    state.records = data.records.map((record) => ({
      ...record,
      days: Array.from({ length: 7 }, (_, index) => ({
        projected: Number(record.days?.[index]?.projected) || 0,
        actual: Number(record.days?.[index]?.actual) || 0,
      })),
      arrangements: Number(record.arrangements) || 0,
    }));
    state.fromTemplate = Boolean(data.fromTemplate);
    state.selectedDay = todayIndex();
    setDirty(false);
  } catch (error) {
    state.records = [];
    state.fromTemplate = false;
    showToast(error.message, 'error');
  } finally {
    state.loading = false;
    renderRows();
  }
}

function projectionInputFocused() {
  const active = document.activeElement;
  return active instanceof HTMLInputElement && elements.projectionView.contains(active);
}

async function refreshWeek() {
  if (!state.farmId || state.loading || state.dirty || projectionAutosave.saving || projectionInputFocused()) return;
  const { farmId, year, week } = state;
  const revision = projectionAutosave.revision;
  const data = await api(`/api/projections/${farmId}/${year}/${week}`, { cache: 'no-store' });
  if (farmId !== state.farmId || year !== state.year || week !== state.week || state.loading ||
    revision !== projectionAutosave.revision || state.dirty || projectionAutosave.saving || projectionInputFocused()) return;
  const records = data.records.map((record) => ({
    ...record,
    days: Array.from({ length: 7 }, (_, index) => ({
      projected: Number(record.days?.[index]?.projected) || 0,
      actual: Number(record.days?.[index]?.actual) || 0,
    })),
    arrangements: Number(record.arrangements) || 0,
  }));
  if (JSON.stringify(state.records) === JSON.stringify(records) && state.fromTemplate === Boolean(data.fromTemplate)) return;
  const desktopScroll = elements.sheetCard.querySelector('.table-scroll');
  const mobileScroll = elements.mobileCapture.querySelector('.mobile-sheet-scroll');
  const desktopPosition = { top: desktopScroll.scrollTop, left: desktopScroll.scrollLeft };
  const mobilePosition = mobileScroll && { top: mobileScroll.scrollTop, left: mobileScroll.scrollLeft };
  state.records = records;
  state.fromTemplate = Boolean(data.fromTemplate);
  renderRows();
  desktopScroll.scrollTo(desktopPosition.left, desktopPosition.top);
  const nextMobileScroll = elements.mobileCapture.querySelector('.mobile-sheet-scroll');
  if (mobilePosition && nextMobileScroll) nextMobileScroll.scrollTo(mobilePosition.left, mobilePosition.top);
  renderSaveState();
}

const projectionAutosave = createAutosave(async (isCurrent) => {
  if (!window.authApp?.canEdit('production')) return false;
  const invalid = state.records.find((record) => !record.block.trim() || !record.variety.trim());
  if (invalid) {
    showToast('Completa bloque y variedad antes de guardar.', 'error');
    return false;
  }
  const farmId = state.farmId;
  const year = state.year;
  const week = state.week;
  const payload = JSON.stringify({ records: state.records });
  elements.saveButton.disabled = true;
  elements.saveButton.textContent = 'Guardando…';
  elements.saveSheetButton.disabled = true;
  elements.saveSheetButton.textContent = 'Guardando…';
  renderSaveState();
  try {
    const data = await api(`/api/projections/${farmId}/${year}/${week}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    if (isCurrent()) {
      state.records = data.records;
      state.fromTemplate = false;
      setDirty(false);
    }
    return true;
  } catch (error) {
    showToast(error.message, 'error');
    return false;
  } finally {
    elements.saveButton.disabled = false;
    elements.saveButton.innerHTML = '<span aria-hidden="true">✓</span> Guardar semana';
    elements.saveSheetButton.disabled = false;
    elements.saveSheetButton.textContent = '✓ Guardar';
  }
});

async function saveWeek({ quiet = false } = {}) {
  if (!window.authApp?.canEdit('production')) return false;
  if (state.fromTemplate && !state.dirty) setDirty(true);
  if (!state.dirty) return true;
  const saved = await projectionAutosave.flush();
  if (saved && !quiet) showToast(`Semana ${state.week} guardada correctamente.`);
  return saved;
}

async function changeWeek(delta) {
  if (!(await flushPendingChanges())) return;
  const monday = weekMonday(state.year, state.week);
  monday.setUTCDate(monday.getUTCDate() + (delta * 7));
  const parts = isoWeekParts(new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()));
  state.year = parts.year;
  state.week = parts.week;
  await Promise.all([loadWeek(), loadFieldData()]);
}

async function flushPendingChanges() {
  if (!(await projectionAutosave.flush())) return false;
  if (!(await fieldAutosave.flush())) return false;
  if (window.inventoryApp && !(await window.inventoryApp.flush())) return false;
  return true;
}
window.flushPendingChanges = flushPendingChanges;

async function showView(name) {
  if (!window.authApp?.canView(name)) return;
  if (name === 'history' && !(await flushPendingChanges())) return;
  if (name !== state.activeView) setCaptureExpanded(null, false);
  state.activeView = name;
  for (const [view, element] of Object.entries({ projection: elements.projectionView, temperature: elements.temperatureView, water: elements.waterView, inventory: document.querySelector('#inventoryView'), consultation: document.querySelector('#consultationView'), history: elements.historyView })) {
    element.classList.toggle('active', view === name);
  }
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  if (name === 'history') await loadHistory();
  if (name === 'inventory') await window.inventoryApp?.show();
}

async function loadHistory() {
  elements.historyGrid.innerHTML = '<div class="history-empty">Cargando historial…</div>';
  try {
    state.history = await api(`/api/history/${state.farmId}`);
    renderHistory();
  } catch (error) {
    elements.historyGrid.innerHTML = `<div class="history-empty">${escapeHtml(error.message)}</div>`;
  }
}

async function refreshHistory() {
  const farmId = state.farmId;
  if (!farmId) return;
  const history = await api(`/api/history/${farmId}`, { cache: 'no-store' });
  if (farmId !== state.farmId || state.activeView !== 'history' ||
    JSON.stringify(state.history) === JSON.stringify(history)) return;
  state.history = history;
  renderHistory();
}

function renderHistory() {
  const query = elements.historySearch.value.trim().toLowerCase();
  const filtered = state.history.filter((item) => `${item.year} ${item.week}`.includes(query));
  elements.historyCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'semana' : 'semanas'}`;
  if (!filtered.length) {
    elements.historyGrid.innerHTML = '<div class="history-empty">No hay semanas guardadas que coincidan con la búsqueda.</div>';
    return;
  }
  elements.historyGrid.innerHTML = filtered.map((item) => {
    const performance = item.projected ? Math.round((item.actual / item.projected) * 100) : 0;
    return `
      <article class="history-card">
        <div class="history-card-top">
          <div class="history-week"><strong>S${item.week}</strong><span>${item.year}</span></div>
          <span class="row-badge">${item.rows} ${item.rows === 1 ? 'fila' : 'filas'}</span>
        </div>
        <div class="history-stats">
          <div><span>Proyección</span><strong>${formatNumber(item.projected)}</strong></div>
          <div><span>Real · ${performance}%</span><strong>${formatNumber(item.actual)}</strong></div>
        </div>
        <div class="history-actions">
          <button type="button" data-open-week="${item.year}:${item.week}">Abrir semana</button>
          <a href="/api/export/${state.farmId}/${item.year}/${item.week}.xlsx">Descargar Excel</a>
        </div>
      </article>`;
  }).join('');
}

function addRow(block, variety) {
  state.records.push({
    id: `new-${Date.now()}`,
    block: block.trim(),
    variety: variety.trim().toUpperCase(),
    notes: '',
    arrangements: 0,
    days: blankDays(),
  });
  setDirty(true);
  renderRows();
  const newRowInput = elements.projectionBody.querySelector(`tr:last-child input[data-kind="projected"]`);
  newRowInput?.focus();
}

elements.quickAddForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!elements.blockInput.value.trim() || !elements.varietyInput.value.trim()) return;
  addRow(elements.blockInput.value, elements.varietyInput.value);
  elements.blockInput.value = '';
  elements.varietyInput.value = '';
  elements.blockInput.focus();
});

elements.projectionBody.addEventListener('input', (event) => {
  const input = event.target.closest('input');
  if (!input) return;
  const row = input.closest('tr');
  const rowIndex = Number(row.dataset.row);
  if (input.dataset.field) {
    state.records[rowIndex][input.dataset.field] = input.dataset.field === 'arrangements'
      ? Math.max(0, Number.parseInt(input.value, 10) || 0) : input.value;
    if (input.dataset.field === 'arrangements') {
      renderGroupTotals();
      renderFoot();
      updateMobileCard(rowIndex);
    }
  } else {
    const day = Number(input.dataset.day);
    state.records[rowIndex].days[day][input.dataset.kind] = Math.max(0, Number.parseInt(input.value, 10) || 0);
    updateRowDisplay(rowIndex);
  }
  setDirty(true);
});

elements.mobileCapture.addEventListener('click', (event) => {
  const button = event.target.closest('[data-select-day]');
  if (!button) return;
  state.selectedDay = Number(button.dataset.selectDay);
  renderMobile();
});

elements.mobileCapture.addEventListener('input', (event) => {
  const input = event.target.closest('input');
  if (!input) return;
  updateCaptureInputContext(input);
  const rowIndex = Number(input.closest('[data-mobile-row]').dataset.mobileRow);
  const value = Math.max(0, Number.parseInt(input.value, 10) || 0);
  if (input.dataset.field === 'arrangements') {
    state.records[rowIndex].arrangements = value;
    const desktop = elements.projectionBody.querySelector(`tr[data-row="${rowIndex}"] [data-field="arrangements"]`);
    if (desktop) desktop.value = value || '';
    renderGroupTotals();
    renderFoot();
    renderMobileSummaries();
  } else {
    state.records[rowIndex].days[Number(input.dataset.day)][input.dataset.kind] = value;
    const desktop = elements.projectionBody.querySelector(`tr[data-row="${rowIndex}"] [data-day="${input.dataset.day}"][data-kind="${input.dataset.kind}"]`);
    if (desktop) desktop.value = value || '';
    updateRowDisplay(rowIndex);
  }
  setDirty(true);
});

elements.projectionBody.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action="delete"]');
  if (!button) return;
  if (isFixedFarm()) return;
  const rowIndex = Number(button.closest('tr').dataset.row);
  const record = state.records[rowIndex];
  if (!window.confirm(`¿Eliminar ${record.variety} del bloque ${record.block}?`)) return;
  state.records.splice(rowIndex, 1);
  setDirty(true);
  renderRows();
});

elements.historyGrid.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-open-week]');
  if (!button) return;
  const [year, week] = button.dataset.openWeek.split(':').map(Number);
  if (!(await flushPendingChanges())) return;
  state.year = year;
  state.week = week;
  showView('projection');
  await Promise.all([loadWeek(), loadFieldData()]);
});

elements.farmSelect.addEventListener('change', async () => {
  const previous = state.farmId;
  if (!(await flushPendingChanges())) {
    elements.farmSelect.value = previous;
    return;
  }
  state.farmId = Number(elements.farmSelect.value);
  applyFarmTheme();
  document.querySelector('#consultFarmName').textContent = elements.farmSelect.selectedOptions[0]?.textContent || '';
  if (window.authApp?.role !== 'postharvest') await Promise.all([loadWeek(), loadFieldData()]);
  if (state.activeView === 'inventory') await window.inventoryApp?.farmChanged();
  if (elements.historyView.classList.contains('active')) await loadHistory();
});

document.querySelector('#previousWeek').addEventListener('click', () => changeWeek(-1));
document.querySelector('#nextWeek').addEventListener('click', () => changeWeek(1));
document.querySelectorAll('[data-week-step]').forEach((button) => button.addEventListener('click', () => changeWeek(Number(button.dataset.weekStep))));
document.querySelector('#currentWeek').addEventListener('click', async () => {
  if (!(await flushPendingChanges())) return;
  const current = isoWeekParts();
  state.year = current.year;
  state.week = current.week;
  await Promise.all([loadWeek(), loadFieldData()]);
});
document.querySelectorAll('.field-save').forEach((button) => button.addEventListener('click', saveFieldData));
document.querySelectorAll('.field-editor').forEach((editor) => {
  editor.addEventListener('click', (event) => {
    const button = event.target.closest('[data-field-day]');
    if (!button) return;
    state.fieldDay = Number(button.dataset.fieldDay);
    renderFieldEditors();
  });
  editor.addEventListener('input', (event) => {
    const input = event.target.closest('.field-input');
    if (!input || !state.fieldData) return;
    const isBeds = input.dataset.beds === 'true';
    const value = parseFieldNumber(input.value, ['initial', 'final'].includes(input.dataset.field));
    const valid = !Number.isNaN(value) && (value === null || (isBeds
      ? Number.isInteger(value) && value > 0 : input.dataset.section === 'climate'
        ? (['minTemp', 'maxTemp'].includes(input.dataset.field) ? value >= -100 && value <= 100
          : input.dataset.field === 'humidity' ? value >= 0 && value <= 100 : value >= 0)
        : value >= 0));
    input.setCustomValidity(valid ? '' : 'Ingresa un número válido');
    if (!valid) return;
    if (isBeds) state.fieldData.beds = value;
    else state.fieldData[input.dataset.section][input.dataset.field][Number(input.dataset.day)] = value;
    editor.querySelectorAll('.field-input').forEach((other) => {
      if (other !== input && other.dataset.beds === input.dataset.beds
        && other.dataset.section === input.dataset.section && other.dataset.field === input.dataset.field
        && other.dataset.day === input.dataset.day) other.value = input.value;
    });
    state.fieldDirty = true;
    fieldAutosave.mark();
    renderSaveState();
    updateFieldCalculations();
  });
});
elements.saveButton.addEventListener('click', () => saveWeek());
elements.saveSheetButton.addEventListener('click', () => saveWeek());

function syncCaptureViewport() {
  const viewport = window.visualViewport;
  document.documentElement.style.setProperty('--capture-height', `${Math.round(viewport?.height || window.innerHeight)}px`);
  document.documentElement.style.setProperty('--capture-top', `${Math.round(viewport?.offsetTop || 0)}px`);
  if (document.body.classList.contains('capture-open')) window.requestAnimationFrame(keepFocusedCaptureRowVisible);
}

function updateCaptureInputContext(input) {
  if (!elements.sheetCard.classList.contains('sheet-expanded')) return;
  const row = input.closest('.mobile-record');
  if (!row) return;
  const block = row.querySelector('.mobile-block').textContent.trim();
  const variety = row.querySelector('.mobile-variety').textContent.trim();
  const kind = input.dataset.field === 'arrangements' ? 'Arreglos' : input.dataset.kind === 'projected' ? 'Proyección' : 'Real';
  const day = input.dataset.day === undefined ? '' : ` · ${DAYS[Number(input.dataset.day)]}`;
  elements.captureInputLabel.textContent = `${variety} · Bloque ${block} · ${kind}${day}`;
  elements.captureInputValue.textContent = input.value || '0';
  elements.captureInputContext.hidden = false;
}

function keepFocusedCaptureRowVisible() {
  const input = document.activeElement;
  if (!(input instanceof HTMLInputElement)) return;
  const scrollArea = input.closest('.mobile-sheet-scroll, .field-editor, .inventory-expanded #inventoryEditor');
  if (!scrollArea) return;
  const row = input.closest('.mobile-record, .field-mobile-row, .beds-line, .inventory-mobile-card, .inventory-mobile-row, .inventory-fn-mobile-row');
  if (!row) return;
  const areaRect = scrollArea.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  if (!areaRect.height) return;
  const topPadding = input.closest('.mobile-sheet-scroll') ? 40 : 10;
  if (rowRect.top < areaRect.top + topPadding || rowRect.bottom > areaRect.bottom - 8) {
    scrollArea.scrollTop += rowRect.top - areaRect.top - Math.max(topPadding, (areaRect.height - rowRect.height) / 2);
  }
}

elements.mobileCapture.addEventListener('focusin', (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  updateCaptureInputContext(event.target);
  window.requestAnimationFrame(keepFocusedCaptureRowVisible);
});
elements.mobileCapture.addEventListener('focusout', () => {
  window.requestAnimationFrame(() => {
    if (!elements.mobileCapture.contains(document.activeElement)) elements.captureInputContext.hidden = true;
  });
});
document.querySelectorAll('.field-editor').forEach((editor) => {
  editor.addEventListener('focusin', () => window.requestAnimationFrame(keepFocusedCaptureRowVisible));
});
document.querySelector('#inventoryEditor').addEventListener('focusin', () => window.requestAnimationFrame(keepFocusedCaptureRowVisible));

let captureLayoutWidth = window.innerWidth;

function setCaptureExpanded(target, expanded) {
  for (const [card, className, button] of [
    [elements.sheetCard, 'sheet-expanded', elements.expandSheet],
    [elements.temperatureView, 'field-expanded', elements.temperatureView.querySelector('.field-expand')],
    [elements.waterView, 'field-expanded', elements.waterView.querySelector('.field-expand')],
    [document.querySelector('#inventoryView'), 'inventory-expanded', document.querySelector('#expandInventory')],
  ]) {
    const active = expanded && card === target;
    card.classList.toggle(className, active);
    button.setAttribute('aria-pressed', String(active));
    button.textContent = active ? '✕ Cerrar' : '⛶ Pantalla completa';
  }
  document.body.classList.toggle('capture-open', expanded);
  if (!expanded) elements.captureInputContext.hidden = true;
  if (expanded) {
    captureLayoutWidth = window.innerWidth;
    syncCaptureViewport();
  }
  if (state.year && state.week) renderPeriod();
}

elements.expandSheet.addEventListener('click', () => setCaptureExpanded(elements.sheetCard, !elements.sheetCard.classList.contains('sheet-expanded')));
document.querySelectorAll('.field-expand').forEach((button) => button.addEventListener('click', () => {
  const view = button.closest('.field-view');
  setCaptureExpanded(view, !view.classList.contains('field-expanded'));
}));
document.querySelector('#expandInventory').addEventListener('click', () => {
  const view = document.querySelector('#inventoryView');
  setCaptureExpanded(view, !view.classList.contains('inventory-expanded'));
});
window.visualViewport?.addEventListener('resize', syncCaptureViewport);
window.visualViewport?.addEventListener('scroll', syncCaptureViewport);
window.addEventListener('resize', () => {
  if (document.body.classList.contains('capture-open') && Math.abs(window.innerWidth - captureLayoutWidth) > 120) {
    closeCaptureOnOrientationChange();
    return;
  }
  syncCaptureViewport();
});
function closeCaptureOnOrientationChange() {
  if (!document.body.classList.contains('capture-open')) return;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  setCaptureExpanded(null, false);
}
window.addEventListener('orientationchange', closeCaptureOnOrientationChange);
window.screen.orientation?.addEventListener?.('change', closeCaptureOnOrientationChange);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('capture-open')) setCaptureExpanded(null, false);
});
elements.exportButton.addEventListener('click', async () => {
  if (window.authApp?.canEdit('production') && (state.dirty || state.fromTemplate) && !(await saveWeek({ quiet: true }))) return;
  window.location.href = `/api/export/${state.farmId}/${state.year}/${state.week}.xlsx`;
  showToast('Preparando archivo Excel…');
});
document.querySelectorAll('[data-field-export]').forEach((button) => button.addEventListener('click', async () => {
  if (window.authApp?.canEdit('production') && state.fieldDirty && !(await saveFieldData())) return;
  window.location.href = `/api/reports/field/${state.farmId}/${state.year}/${state.week}/${button.dataset.fieldExport}.xlsx`;
  showToast('Preparando archivo Excel…');
}));
document.querySelector('#emptyAddButton').addEventListener('click', () => elements.blockInput.focus());
document.querySelector('#historyButton').addEventListener('click', () => showView('history'));
document.querySelector('.mobile-brand').addEventListener('click', () => showView(window.authApp?.initialView() || 'projection'));
document.querySelector('#backToProjection').addEventListener('click', () => showView('projection'));
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
elements.historySearch.addEventListener('input', renderHistory);

let lastToday = todayIndex();
function refreshTodaySelection() {
  const current = todayIndex();
  if (current === lastToday) return;
  lastToday = current;
  state.selectedDay = current;
  state.fieldDay = current;
  if (state.records.length) renderMobile();
  if (state.fieldData) renderFieldEditors();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) void flushPendingChanges();
  else { refreshTodaySelection(); void refreshLiveData(); }
});
setInterval(refreshTodaySelection, 60_000);

let liveRefreshInFlight = false;
async function refreshLiveData() {
  if (liveRefreshInFlight || document.hidden || !state.farmId || !window.authApp?.role) return;
  liveRefreshInFlight = true;
  try {
    const tasks = [];
    if (window.authApp.canView('projection')) tasks.push(refreshWeek(), refreshFieldData());
    if (state.activeView === 'inventory') tasks.push(window.inventoryApp?.refresh());
    if (state.activeView === 'history') tasks.push(refreshHistory());
    await Promise.allSettled(tasks);
  } finally { liveRefreshInFlight = false; }
}
setInterval(() => { void refreshLiveData(); }, 15_000);

window.addEventListener('beforeunload', (event) => {
  if (!state.dirty && !state.fieldDirty && !window.inventoryApp?.dirty) return;
  event.preventDefault();
});

async function initialize() {
  if (!(await window.authApp.session())) return;
  renderHead();
  const current = isoWeekParts();
  state.year = current.year;
  state.week = current.week;
  try {
    const [farms, health] = await Promise.all([api('/api/farms'), api('/api/health')]);
    state.farms = farms;
    state.farmId = Number(farms.find((farm) => farm.code === 'F1')?.id || farms[0]?.id);
    elements.farmSelect.innerHTML = farms.map((farm) => `<option value="${farm.id}">${escapeHtml(farm.name)}</option>`).join('');
    elements.farmSelect.value = String(state.farmId);
    applyFarmTheme();
    document.querySelector('#consultFarmName').textContent = elements.farmSelect.selectedOptions[0]?.textContent || '';
    document.querySelector('#dbStatus').textContent = health.persistent ? 'Base conectada' : 'Modo demostración';
    document.querySelector('#dbStatusDetail').textContent = health.persistent ? 'PostgreSQL activo' : 'Conecta PostgreSQL';
    document.querySelector('.status-dot').classList.toggle('online', health.persistent);
    if (window.authApp.role !== 'postharvest') await Promise.all([loadWeek(), loadFieldData()]);
    await showView(window.authApp.initialView());
  } catch (error) {
    showToast(`No se pudo iniciar: ${error.message}`, 'error');
    elements.projectionBody.innerHTML = `<tr><td colspan="20" style="padding:35px;text-align:center">${escapeHtml(error.message)}</td></tr>`;
  }
}

initialize();
