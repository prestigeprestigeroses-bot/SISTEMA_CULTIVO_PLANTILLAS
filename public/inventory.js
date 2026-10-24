(() => {
  const ui = {
    view: document.querySelector('#inventoryView'),
    templates: document.querySelector('#inventoryTemplates'),
    sections: document.querySelector('#inventorySections'),
    date: document.querySelector('#inventoryDate'),
    metrics: document.querySelector('#inventoryMetrics'),
    editor: document.querySelector('#inventoryEditor'),
    save: document.querySelector('#inventorySave'),
    export: document.querySelector('#inventoryExport'),
    farmExport: document.querySelector('#inventoryFarmExport'),
    farmTotal: document.querySelector('#inventoryFarmTotal'),
    farmBreakdown: document.querySelector('#inventoryFarmBreakdown'),
  };
  const sectionNames = { processed: 'Inventario ramos', bulk: 'Flor a granel', guard: 'Flor de guarde' };
  const model = {
    farmId: null, templates: [], key: null, template: null, data: null,
    section: 'processed', date: localDate(), variety: 0, process: null, gridDay: null,
    dirty: false, saved: false,
  };

  function localDate() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function period() {
    const [year, month, day] = model.date.split('-').map(Number);
    return { year, month, day, days: new Date(year, month, 0).getDate() };
  }

  function format(value) { return new Intl.NumberFormat('es-CO').format(value || 0); }
  function processClass(process) {
    const name = process.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (name.includes('terceros')) return 'inventory-process-terceros';
    if (name.includes('nacional')) return 'inventory-process-nacional';
    const color = ['pvc', 'verde', 'negra', 'blanca', 'azul', 'amarilla', 'morada', 'roja'].find((item) => name.includes(item));
    return `inventory-process-${color || 'neutral'}`;
  }
  function keyFor(section, row, column) {
    return section === 'processed' ? `${period().day}:${row}:${column}` : `${row}:${column}`;
  }
  function amount(section, row, column) { return model.data?.[section]?.[keyFor(section, row, column)] || 0; }
  function input(section, row, column, label) {
    const value = amount(section, row, column);
    return `<input class="inventory-input" type="number" min="0" max="1000000" step="1" inputmode="numeric" data-section="${section}" data-inventory-key="${keyFor(section, row, column)}" value="${value || ''}" aria-label="${escapeHtml(label)}" placeholder="—">`;
  }

  function summary() {
    if (!model.template || !model.data) return null;
    const section = model.section;
    const rows = section === 'processed' ? model.template.processed.varieties : model.template[section];
    const details = rows.map((item, row) => {
      if (item.retired) return { units: 0, stems: 0, unweighted: 0, fnStems: 0 };
      let units = 0; let stems = 0; let unweighted = 0; let fnStems = 0;
      if (section === 'processed') {
        for (const column of model.template.processed.columns) {
          const count = amount(section, row, column.key);
          units += count;
          if (column.stems === null) unweighted += count;
          else stems += count * column.stems;
        }
      } else {
        for (let day = 1; day <= period().days; day += 1) units += amount(section, row, day);
        if (item.stemsPerBunch === null) unweighted = units;
        else stems = units * item.stemsPerBunch;
        if (section === 'bulk') {
          fnStems = amount(section, row, 'FN');
          stems += fnStems;
        }
      }
      return { units, stems, unweighted, fnStems };
    });
    const totals = details.reduce((result, item, index) => {
      result.units += item.units;
      result.stems += item.stems;
      result.fnStems += item.fnStems;
      result.unweighted += item.unweighted;
      if (section === 'processed' ? index === 0 : index < 3) result.red += item.stems;
      else result.color += item.stems;
      return result;
    }, { units: 0, stems: 0, fnStems: 0, unweighted: 0, red: 0, color: 0 });
    return { details, totals };
  }

  function renderMetrics() {
    const result = summary();
    if (!result) { ui.metrics.innerHTML = ''; return; }
    ui.metrics.innerHTML = `<article><span>TALLOS TOTALES</span><strong>${format(result.totals.stems)}</strong></article>
      <article><span>FLOR ROJA</span><strong>${format(result.totals.red)}</strong></article>
      <article><span>FLOR DE COLOR</span><strong>${format(result.totals.color)}</strong></article>
      <article><span>CANTIDADES SIN CONVERSIÓN</span><strong>${format(result.totals.unweighted)}</strong></article>`;
    ui.save.textContent = model.dirty ? '✓ Guardar cambios' : model.saved ? '✓ Guardado' : '✓ Guardar inventario';
  }

  async function loadFarmSummary() {
    if (!model.farmId) return;
    const { year, month } = period();
    const farmId = model.farmId;
    try {
      const result = await api(`/api/inventory/summary/${farmId}/${year}/${month}`, { cache: 'no-store' });
      if (farmId !== model.farmId || year !== period().year || month !== period().month) return;
      ui.farmTotal.textContent = format(result.totalStems);
      ui.farmBreakdown.textContent = result.inventories.map((item) => `${item.label}: ${format(item.summary.stems)}`).join(' · ');
    } catch (error) {
      if (farmId !== model.farmId || year !== period().year || month !== period().month) return;
      ui.farmTotal.textContent = '—';
      ui.farmBreakdown.textContent = error.message;
    }
  }

  function renderTabs() {
    ui.templates.innerHTML = model.templates.map((item) => `<button type="button" data-template="${item.key}" class="${item.key === model.key ? 'active' : ''}">${escapeHtml(item.label)}</button>`).join('');
    const available = model.template?.sections || Object.keys(sectionNames);
    ui.sections.innerHTML = available.map((key) => `<button type="button" data-inventory-section="${key}" class="${key === model.section ? 'active' : ''}">${sectionNames[key]}</button>`).join('');
    ui.date.value = model.date;
  }

  function processedEditor(result) {
    const { varieties, columns } = model.template.processed;
    const groups = [...new Set(columns.map((column) => column.process))];
    if (!groups.includes(model.process)) model.process = groups[0];
    const contiguousGroups = (getValue) => columns.reduce((runs, column) => {
      const value = getValue(column);
      const last = runs[runs.length - 1];
      if (last && last.value === value) last.count += 1;
      else runs.push({ value, count: 1 });
      return runs;
    }, []);
    const factorHead = contiguousGroups((column) => column.stems).map(({ value, count }) =>
      `<th class="inventory-factor-header" colspan="${count}">${value === null ? 'Sin factor' : `×${value} tallos`}</th>`).join('');
    const groupedHead = contiguousGroups((column) => column.process).map(({ value, count }) =>
      `<th class="inventory-process-header ${processClass(value)}" colspan="${count}">${escapeHtml(value)}</th>`).join('');
    const gradeLabel = (grade) => typeof grade === 'number' ? `Grado ${grade}` : escapeHtml(grade);
    const columnHead = columns.map((column) => `<th class="inventory-process-column ${processClass(column.process)}" title="${column.stems === null ? 'No se convierte a tallos' : `${column.stems} tallos por unidad`}">${gradeLabel(column.grade)}<small>${column.stems === null ? 'sin factor' : `${column.stems} tallos`}</small></th>`).join('');
    const rows = varieties.map((variety, row) => `<tr><th class="inventory-identity ${row === 0 ? 'inventory-freedom' : ''}">${escapeHtml(variety)}</th>${columns.map((column) => `<td class="inventory-process-cell ${processClass(column.process)}">${input('processed', row, column.key, `${variety} ${column.process} grado ${column.grade}`)}</td>`).join('')}<td class="inventory-total" data-row-stems="${row}">${format(result.details[row].stems)}</td></tr>`).join('');
    const totals = columns.map((column) => `<td class="inventory-total" data-col-total="${column.key}">${format(varieties.reduce((sum, _, row) => sum + amount('processed', row, column.key), 0))}</td>`).join('');
    const current = model.variety;
    const mobileColumns = columns.filter((column) => column.process === model.process);
    const mobile = `<div class="inventory-mobile-capture"><label>Variedad<select id="inventoryVariety">${varieties.map((name, index) => `<option value="${index}" ${index === current ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></label>
      <label>Proceso<select id="inventoryProcess">${groups.map((name) => `<option value="${escapeHtml(name)}" ${name === model.process ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></label>
      <div class="inventory-mobile-process ${processClass(model.process)}">${escapeHtml(model.process)}</div>
      <div class="inventory-mobile-grid">${mobileColumns.map((column) => `<div class="inventory-mobile-card ${processClass(column.process)}"><div><strong>${gradeLabel(column.grade)}</strong><span>${column.stems === null ? 'Sin factor de tallos' : `${column.stems} tallos por unidad`}</span></div>${input('processed', current, column.key, `${varieties[current]} ${column.process} grado ${column.grade}`)}</div>`).join('')}</div>
      <div class="inventory-mobile-total">${escapeHtml(varieties[current])}: <strong data-row-stems="${current}">${format(result.details[current].stems)}</strong> tallos</div></div>`;
    return `<div class="inventory-note">Captura del día ${period().day}. Las presentaciones se muestran por cantidad de tallos (de mayor a menor); las casillas y sus registros se conservan. “Nacional” y “NAL” quedan aparte porque no tienen factor.</div>
      <div class="inventory-table-scroll"><table class="inventory-table inventory-processed-table"><thead><tr><th rowspan="3" class="inventory-identity">VARIEDAD</th>${factorHead}<th rowspan="3">TOTAL TALLOS</th></tr><tr>${groupedHead}</tr><tr>${columnHead}</tr></thead><tbody>${rows}</tbody><tfoot><tr><th class="inventory-identity">TOTAL</th>${totals}<td class="inventory-total" data-all-stems>${format(result.totals.stems)}</td></tr></tfoot></table></div>${mobile}`;
  }

  function gridEditor(result) {
    const section = model.section;
    const isBulk = section === 'bulk';
    const unit = 'tabacos';
    const factorUnit = 'tabaco';
    const rows = model.template[section];
    const visibleRows = rows.map((item, row) => ({ item, row })).filter(({ item }) => !item.retired);
    const days = period().days;
    if (!model.gridDay || model.gridDay > days) model.gridDay = period().day;
    const displayDays = section === 'bulk' ? 31 : days;
    const headers = Array.from({ length: displayDays }, (_, i) => `<th>${i + 1}</th>`).join('');
    const fnHeader = isBulk ? '<th class="inventory-fn-heading" title="Fin de corte: ingresar tallos, no tabacos">FN<small>TALLOS</small></th>' : '';
    const desktopRows = visibleRows.map(({ item, row }) => `<tr><th class="inventory-identity ${row < 3 ? 'inventory-freedom' : ''}">${escapeHtml(item.name)}<small>${item.stemsPerBunch === null ? 'Sin factor' : `${item.stemsPerBunch} tallos/${factorUnit}`}</small></th>${Array.from({ length: displayDays }, (_, i) => i < days ? `<td>${input(section, row, i + 1, `${item.name} día ${i + 1} ${unit}`)}</td>` : '<td class="inventory-day-unavailable">—</td>').join('')}${isBulk ? `<td class="inventory-fn-cell">${input(section, row, 'FN', `${item.name} FN fin de corte en tallos`)}</td>` : ''}<td class="inventory-total" data-row-units="${row}">${format(result.details[row].units)}</td><td class="inventory-total" data-row-stems="${row}">${format(result.details[row].stems)}</td></tr>`).join('');
    const dayTotals = Array.from({ length: displayDays }, (_, i) => i < days ? `<td class="inventory-total" data-day-total="${i + 1}">${format(visibleRows.reduce((sum, { row }) => sum + amount(section, row, i + 1), 0))}</td>` : '<td class="inventory-day-unavailable">—</td>').join('');
    const mobileRows = visibleRows.map(({ item, row }) => `<div class="inventory-mobile-row"><div><strong>${escapeHtml(item.name)}</strong><small>${item.stemsPerBunch === null ? 'Sin factor' : `${item.stemsPerBunch} tallos/${factorUnit}`}</small></div>${input(section, row, model.gridDay, `${item.name} día ${model.gridDay} ${unit}`)}<span data-row-stems="${row}">${format(result.details[row].stems)}</span></div>`).join('');
    const fnMobile = isBulk ? `<div class="inventory-fn-mobile"><h3>FN · Fin de corte</h3><p>Ingresa tallos directamente. No se multiplican por tallos/${factorUnit}.</p>${visibleRows.map(({ item, row }) => `<div class="inventory-fn-mobile-row"><strong>${escapeHtml(item.name)}</strong>${input(section, row, 'FN', `${item.name} FN fin de corte en tallos`)}</div>`).join('')}</div>` : '';
    return `<div class="inventory-note">Mes de ${new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(new Date(period().year, period().month - 1, 1))}. Cada columna diaria registra ${unit}; total tallos = ${unit} × tallos por ${factorUnit}${isBulk ? ' + FN. FN (fin de corte) registra tallos directos.' : '.'}</div>
      <div class="inventory-table-scroll"><table class="inventory-table inventory-grid-table"><thead><tr><th class="inventory-identity">VARIEDAD</th>${headers}${fnHeader}<th>TOTAL ${unit.toUpperCase()}</th><th>TOTAL TALLOS</th></tr></thead><tbody>${desktopRows}</tbody><tfoot><tr><th class="inventory-identity">TOTAL</th>${dayTotals}${isBulk ? `<td class="inventory-total inventory-fn-total" data-all-fn>${format(result.totals.fnStems)}</td>` : ''}<td class="inventory-total" data-all-units>${format(result.totals.units)}</td><td class="inventory-total" data-all-stems>${format(result.totals.stems)}</td></tr></tfoot></table></div>
      <div class="inventory-mobile-capture"><label>Día del mes<select id="inventoryGridDay">${Array.from({ length: days }, (_, i) => `<option value="${i + 1}" ${i + 1 === model.gridDay ? 'selected' : ''}>Día ${i + 1}</option>`).join('')}</select></label><div class="inventory-mobile-head"><span>VARIEDAD</span><span>${unit.toUpperCase()}</span><span>TALLOS MES</span></div>${mobileRows}${fnMobile}</div>`;
  }

  function renderEditor() {
    if (!model.template || !model.data) { ui.editor.innerHTML = '<p class="inventory-note">Cargando inventario…</p>'; return; }
    const result = summary();
    ui.editor.innerHTML = `<section class="inventory-card inventory-template-${model.key}"><h2>${sectionNames[model.section]} · ${escapeHtml(model.template.label)}</h2>${model.section === 'processed' ? processedEditor(result) : gridEditor(result)}</section>`;
    renderMetrics();
  }

  function updateCalculations() {
    const result = summary();
    renderMetrics();
    ui.editor.querySelectorAll('[data-row-stems]').forEach((element) => { element.textContent = format(result.details[Number(element.dataset.rowStems)].stems); });
    ui.editor.querySelectorAll('[data-row-units]').forEach((element) => { element.textContent = format(result.details[Number(element.dataset.rowUnits)].units); });
    ui.editor.querySelectorAll('[data-all-stems]').forEach((element) => { element.textContent = format(result.totals.stems); });
    ui.editor.querySelectorAll('[data-all-units]').forEach((element) => { element.textContent = format(result.totals.units); });
    ui.editor.querySelectorAll('[data-all-fn]').forEach((element) => { element.textContent = format(result.totals.fnStems); });
    ui.editor.querySelectorAll('[data-col-total]').forEach((element) => { element.textContent = format(model.template.processed.varieties.reduce((sum, _, row) => sum + amount('processed', row, element.dataset.colTotal), 0)); });
    ui.editor.querySelectorAll('[data-day-total]').forEach((element) => { element.textContent = format(model.template[model.section].reduce((sum, item, row) => sum + (item.retired ? 0 : amount(model.section, row, Number(element.dataset.dayTotal))), 0)); });
  }

  async function loadTemplate() {
    if (!model.key) return;
    autosave.reset();
    const { year, month } = period();
    ui.editor.innerHTML = '<p class="inventory-note">Cargando inventario…</p>';
    try {
      const response = await api(`/api/inventory/${model.farmId}/${model.key}/${year}/${month}`);
      model.template = response.template;
      model.data = response.data;
      if (!model.template.sections?.includes(model.section) && model.template.sections) model.section = model.template.sections[0];
      model.saved = response.saved;
      model.dirty = false;
      model.variety = 0;
      model.process = null;
      model.gridDay = period().day;
      renderTabs();
      renderEditor();
      renderSaveState();
      await loadFarmSummary();
    } catch (error) {
      ui.editor.innerHTML = `<p class="field-error">${escapeHtml(error.message)}</p>`;
      showToast(error.message, 'error');
    }
  }

  async function loadFarm() {
    const farmId = Number(document.querySelector('#farmSelect').value);
    if (!farmId || (model.farmId === farmId && model.templates.length)) return;
    model.farmId = farmId;
    model.key = null;
    model.template = null;
    model.data = null;
    try {
      model.templates = await api(`/api/inventory/templates/${farmId}`);
      model.key = model.templates[0]?.key || null;
      renderTabs();
      await loadTemplate();
    } catch (error) {
      ui.editor.innerHTML = `<p class="field-error">${escapeHtml(error.message)}</p>`;
      showToast(error.message, 'error');
    }
  }

  const autosave = window.createAutosave(async (isCurrent) => {
    if (!window.authApp?.canEdit('inventory')) return false;
    if (!model.data || !model.template) return false;
    const bad = ui.editor.querySelector('.inventory-input:invalid');
    if (bad) { bad.reportValidity(); return false; }
    const { year, month } = period();
    const farmId = model.farmId;
    const key = model.key;
    const payload = JSON.stringify(model.data);
    ui.save.disabled = true;
    ui.save.textContent = 'Guardando…';
    renderSaveState();
    try {
      const response = await api(`/api/inventory/${farmId}/${key}/${year}/${month}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: payload,
      });
      if (isCurrent()) {
        model.data = response.data;
        model.saved = true;
        model.dirty = false;
      }
      renderSaveState();
      if (isCurrent()) await loadFarmSummary();
      return true;
    } catch (error) { showToast(error.message, 'error'); return false; }
    finally { ui.save.disabled = false; renderMetrics(); }
  });

  function inventoryInputFocused() {
    const active = document.activeElement;
    return ui.view.contains(active) && active?.matches('input, select, textarea');
  }

  async function refresh() {
    if (!model.farmId || !model.key || !model.data || model.dirty || autosave.saving || inventoryInputFocused()) return;
    const farmId = model.farmId;
    const key = model.key;
    const { year, month } = period();
    const revision = autosave.revision;
    const response = await api(`/api/inventory/${farmId}/${key}/${year}/${month}`, { cache: 'no-store' });
    if (farmId !== model.farmId || key !== model.key || year !== period().year || month !== period().month ||
      revision !== autosave.revision || model.dirty || autosave.saving || inventoryInputFocused()) return;
    if (JSON.stringify(model.data) !== JSON.stringify(response.data) ||
      JSON.stringify(model.template) !== JSON.stringify(response.template) || model.saved !== response.saved) {
      const scrollTop = ui.editor.scrollTop;
      const table = ui.editor.querySelector('.inventory-table-scroll');
      const tablePosition = table && { top: table.scrollTop, left: table.scrollLeft };
      model.template = response.template;
      model.data = response.data;
      model.saved = response.saved;
      if (model.template.sections && !model.template.sections.includes(model.section)) model.section = model.template.sections[0];
      model.variety = Math.min(model.variety, Math.max(0, (model.template.processed?.varieties.length || 1) - 1));
      renderTabs();
      renderEditor();
      ui.editor.scrollTop = scrollTop;
      const nextTable = ui.editor.querySelector('.inventory-table-scroll');
      if (tablePosition && nextTable) nextTable.scrollTo(tablePosition.left, tablePosition.top);
    }
    await loadFarmSummary();
  }

  async function save() {
    if (!window.authApp?.canEdit('inventory') || !model.data) return false;
    if (!model.dirty) return true;
    const saved = await autosave.flush();
    if (saved) showToast(`${model.template.label} guardado.`);
    return saved;
  }

  ui.templates.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-template]');
    if (!button || button.dataset.template === model.key) return;
    if (!(await autosave.flush())) return;
    model.key = button.dataset.template;
    model.section = 'processed';
    await loadTemplate();
  });
  ui.sections.addEventListener('click', (event) => {
    const button = event.target.closest('[data-inventory-section]');
    if (!button || button.dataset.inventorySection === model.section ||
      (model.template?.sections && !model.template.sections.includes(button.dataset.inventorySection))) return;
    model.section = button.dataset.inventorySection;
    renderTabs(); renderEditor();
  });
  ui.date.addEventListener('change', async () => {
    const oldDate = model.date;
    const nextDate = ui.date.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) { ui.date.value = oldDate; return; }
    const oldMonth = oldDate.slice(0, 7);
    const nextMonth = nextDate.slice(0, 7);
    if (oldMonth !== nextMonth && !(await autosave.flush())) {
      ui.date.value = oldDate; return;
    }
    model.date = nextDate;
    model.gridDay = period().day;
    if (oldMonth !== nextMonth) await loadTemplate();
    else renderEditor();
  });
  ui.editor.addEventListener('change', (event) => {
    if (event.target.id === 'inventoryVariety') model.variety = Number(event.target.value);
    else if (event.target.id === 'inventoryProcess') model.process = event.target.value;
    else if (event.target.id === 'inventoryGridDay') model.gridDay = Number(event.target.value);
    else return;
    renderEditor();
  });
  ui.editor.addEventListener('input', (event) => {
    const target = event.target.closest('.inventory-input');
    if (!target || !model.data) return;
    const raw = target.value;
    if (raw && (!/^\d+$/.test(raw) || Number(raw) > 1000000)) { target.setCustomValidity('Ingresa una cantidad entera entre 0 y 1.000.000'); return; }
    target.setCustomValidity('');
    const section = target.dataset.section;
    const key = target.dataset.inventoryKey;
    const value = Number(raw);
    if (value) model.data[section][key] = value;
    else delete model.data[section][key];
    ui.editor.querySelectorAll(`.inventory-input[data-section="${section}"][data-inventory-key="${key}"]`).forEach((other) => { if (other !== target) other.value = target.value; });
    model.dirty = true;
    autosave.mark();
    renderSaveState();
    updateCalculations();
  });
  ui.save.addEventListener('click', save);
  async function exportInventory(allFarm) {
    if (!model.template) return;
    if (model.dirty && window.authApp?.canEdit('inventory') && !(await save())) return;
    const { year, month } = period();
    window.location.href = allFarm
      ? `/api/reports/inventory-summary/${model.farmId}/${year}/${month}.xlsx`
      : `/api/reports/inventory/${model.farmId}/${model.key}/${year}/${month}.xlsx`;
    showToast('Preparando archivo Excel…');
  }
  ui.export.addEventListener('click', () => exportInventory(false));
  ui.farmExport.addEventListener('click', () => exportInventory(true));
  window.inventoryApp = { get dirty() { return model.dirty; }, get saving() { return autosave.saving; }, flush: autosave.flush, show: loadFarm, farmChanged: loadFarm, refresh };
})();
