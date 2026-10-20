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
  selectedDay: 0,
};

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
  const needsSave = value || state.fromTemplate;
  elements.saveState.className = `save-state ${needsSave ? 'dirty' : 'saved'}`;
  elements.saveState.innerHTML = `<span></span> ${value ? 'Cambios sin guardar' : state.fromTemplate ? 'Plantilla sin guardar' : 'Todo guardado'}`;
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
  document.querySelector('#tableTitle').textContent = `Proyección por día · Semana ${state.week}`;
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
      html.push(`<tr class="production-total" data-production="${record.production}"><td colspan="2">TOTAL PRODUCCIÓN ${record.production}</td>${Array.from({ length: 17 }, (_, index) => `<td class="${index === 14 ? 'total-projected' : index === 15 ? 'total-real' : ''}">0</td>`).join('')}</tr>`);
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
      <td>${formatNumber(arrangements)}</td>
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
  const groups = [];
  state.records.forEach((record, index) => {
    if (fixed && (index === 0 || state.records[index - 1].production !== record.production)) {
      groups.push(`<div class="mobile-production">PRODUCCIÓN ${record.production}</div>`);
    }
    const sum = rowTotals(record);
    groups.push(`<article class="mobile-record day-${day}" data-mobile-row="${index}">
      <div class="mobile-record-head"><span class="mobile-block">BLQ ${escapeHtml(record.block)}</span><strong class="${['FREEDOM', 'DANCING RED'].includes(record.variety) ? 'red-variety' : ''}">${escapeHtml(record.variety)}</strong></div>
      <div class="mobile-inputs">
        <label class="mobile-projected"><span>Proyección · ${DAYS[day]}</span><input type="number" min="0" step="1" inputmode="numeric" data-day="${day}" data-kind="projected" aria-label="Proyección ${DAYS[day]} ${record.variety} bloque ${record.block}" value="${Number(record.days[day].projected) || ''}" placeholder="0"></label>
        <label class="mobile-actual"><span>Real · ${DAYS[day]}</span><input type="number" min="0" step="1" inputmode="numeric" data-day="${day}" data-kind="actual" aria-label="Real ${DAYS[day]} ${record.variety} bloque ${record.block}" value="${Number(record.days[day].actual) || ''}" placeholder="0"></label>
      </div>
      <div class="mobile-totals"><div class="mobile-total-projected"><span>Total proyección</span><strong>${formatNumber(sum.projected)}</strong></div><div class="mobile-total-real"><span>Total real</span><strong>${formatNumber(sum.actual)}</strong></div><label class="mobile-arrangements"><span>Total arreglos</span><input type="number" min="0" step="1" inputmode="numeric" data-field="arrangements" aria-label="Total arreglos ${record.variety} bloque ${record.block}" value="${Number(record.arrangements) || ''}" placeholder="0"></label></div>
    </article>`);
  });
  elements.mobileCapture.innerHTML = `<div class="mobile-days" role="group" aria-label="Día para capturar">${DAYS.map((name, index) => `<button type="button" class="day-${index} ${day === index ? 'active' : ''}" data-select-day="${index}" aria-pressed="${day === index}">${name.slice(0, 3)}</button>`).join('')}</div><p class="mobile-day-note">Captura ${DAYS[day].toLowerCase()} · los totales incluyen toda la semana</p>${groups.join('') || '<p class="mobile-day-note">Aún no hay filas en esta semana.</p>'}`;
}

function updateMobileCard(rowIndex) {
  const card = elements.mobileCapture.querySelector(`[data-mobile-row="${rowIndex}"]`);
  if (!card) return;
  const record = state.records[rowIndex];
  const sum = rowTotals(record);
  card.querySelector('.mobile-total-projected strong').textContent = formatNumber(sum.projected);
  card.querySelector('.mobile-total-real strong').textContent = formatNumber(sum.actual);
  for (const kind of ['projected', 'actual']) {
    const input = card.querySelector(`[data-kind="${kind}"]`);
    if (document.activeElement !== input) input.value = record.days[state.selectedDay][kind] || '';
  }
  const arrangements = card.querySelector('[data-field="arrangements"]');
  if (document.activeElement !== arrangements) arrangements.value = record.arrangements || '';
}

async function loadWeek() {
  if (!state.farmId) return;
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

async function saveWeek({ quiet = false } = {}) {
  const invalid = state.records.find((record) => !record.block.trim() || !record.variety.trim());
  if (invalid) {
    showToast('Completa bloque y variedad antes de guardar.', 'error');
    return false;
  }
  elements.saveButton.disabled = true;
  elements.saveButton.textContent = 'Guardando…';
  try {
    const data = await api(`/api/projections/${state.farmId}/${state.year}/${state.week}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: state.records }),
    });
    state.records = data.records;
    state.fromTemplate = false;
    setDirty(false);
    renderRows();
    if (!quiet) showToast(`Semana ${state.week} guardada correctamente.`);
    return true;
  } catch (error) {
    showToast(error.message, 'error');
    return false;
  } finally {
    elements.saveButton.disabled = false;
    elements.saveButton.innerHTML = '<span aria-hidden="true">✓</span> Guardar semana';
  }
}

async function changeWeek(delta) {
  if (state.dirty && !window.confirm('Hay cambios sin guardar. ¿Deseas cambiar de semana y descartarlos?')) return;
  const monday = weekMonday(state.year, state.week);
  monday.setUTCDate(monday.getUTCDate() + (delta * 7));
  const parts = isoWeekParts(new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()));
  state.year = parts.year;
  state.week = parts.week;
  await loadWeek();
}

function showView(name) {
  const history = name === 'history';
  elements.projectionView.classList.toggle('active', !history);
  elements.historyView.classList.toggle('active', history);
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  if (history) loadHistory();
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
  const rowIndex = Number(input.closest('[data-mobile-row]').dataset.mobileRow);
  const value = Math.max(0, Number.parseInt(input.value, 10) || 0);
  if (input.dataset.field === 'arrangements') {
    state.records[rowIndex].arrangements = value;
    const desktop = elements.projectionBody.querySelector(`tr[data-row="${rowIndex}"] [data-field="arrangements"]`);
    if (desktop) desktop.value = value || '';
    renderGroupTotals();
    renderFoot();
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
  state.year = year;
  state.week = week;
  showView('projection');
  await loadWeek();
});

elements.farmSelect.addEventListener('change', async () => {
  const previous = state.farmId;
  if (state.dirty && !window.confirm('Hay cambios sin guardar. ¿Deseas cambiar de finca y descartarlos?')) {
    elements.farmSelect.value = previous;
    return;
  }
  state.farmId = Number(elements.farmSelect.value);
  await loadWeek();
  if (elements.historyView.classList.contains('active')) await loadHistory();
});

document.querySelector('#previousWeek').addEventListener('click', () => changeWeek(-1));
document.querySelector('#nextWeek').addEventListener('click', () => changeWeek(1));
document.querySelector('#currentWeek').addEventListener('click', async () => {
  if (state.dirty && !window.confirm('Hay cambios sin guardar. ¿Deseas ir a esta semana y descartarlos?')) return;
  const current = isoWeekParts();
  state.year = current.year;
  state.week = current.week;
  await loadWeek();
});
elements.saveButton.addEventListener('click', () => saveWeek());
elements.exportButton.addEventListener('click', async () => {
  if ((state.dirty || state.fromTemplate) && !(await saveWeek({ quiet: true }))) return;
  window.location.href = `/api/export/${state.farmId}/${state.year}/${state.week}.xlsx`;
  showToast('Preparando archivo Excel…');
});
document.querySelector('#emptyAddButton').addEventListener('click', () => elements.blockInput.focus());
document.querySelector('#historyButton').addEventListener('click', () => showView('history'));
document.querySelector('.mobile-brand').addEventListener('click', () => showView('projection'));
document.querySelector('#backToProjection').addEventListener('click', () => showView('projection'));
document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
elements.historySearch.addEventListener('input', renderHistory);

window.addEventListener('beforeunload', (event) => {
  if (!state.dirty) return;
  event.preventDefault();
});

async function initialize() {
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
    document.querySelector('#dbStatus').textContent = health.persistent ? 'Base conectada' : 'Modo demostración';
    document.querySelector('#dbStatusDetail').textContent = health.persistent ? 'PostgreSQL activo' : 'Conecta PostgreSQL';
    document.querySelector('.status-dot').classList.toggle('online', health.persistent);
    await loadWeek();
  } catch (error) {
    showToast(`No se pudo iniciar: ${error.message}`, 'error');
    elements.projectionBody.innerHTML = `<tr><td colspan="20" style="padding:35px;text-align:center">${escapeHtml(error.message)}</td></tr>`;
  }
}

initialize();
