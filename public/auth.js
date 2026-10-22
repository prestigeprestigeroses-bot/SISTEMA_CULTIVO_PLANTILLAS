(() => {
  let role = null;
  const labels = { production: 'Producción', postharvest: 'Poscosecha', viewer: 'Consulta' };
  const badges = { production: 'PR', postharvest: 'PC', viewer: 'CO' };
  const views = {
    production: ['projection', 'temperature', 'water', 'history'],
    postharvest: ['inventory'],
    viewer: ['consultation', 'projection', 'temperature', 'water', 'inventory', 'history'],
  };
  const screen = document.querySelector('#loginScreen');
  const form = document.querySelector('#loginForm');
  const error = document.querySelector('#loginError');

  function applyLocks() {
    if (role !== 'viewer') return;
    document.querySelectorAll('#projectionView input, #temperatureView .field-input, #waterView .field-input, #inventoryView .inventory-input')
      .forEach((input) => { input.disabled = true; });
  }

  function applyRole() {
    document.body.classList.remove('auth-pending', 'role-production', 'role-postharvest', 'role-viewer');
    document.body.classList.add(`role-${role}`);
    screen.hidden = true;
    document.querySelectorAll('[data-view]').forEach((button) => { button.hidden = !views[role].includes(button.dataset.view); });
    document.querySelector('#historyButton').hidden = role === 'postharvest';
    const badge = document.querySelector('#roleBadge');
    badge.textContent = badges[role];
    badge.title = `Acceso: ${labels[role]}`;
    applyLocks();
    new MutationObserver(applyLocks).observe(document.querySelector('.app-shell'), { childList: true, subtree: true });
  }

  async function session() {
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store' });
      if (!response.ok) throw new Error('No se pudo comprobar el acceso');
      const data = await response.json();
      role = data.role;
    } catch (failure) {
      error.textContent = failure.message;
      role = null;
    }
    if (role) applyRole();
    else { document.body.classList.remove('auth-pending'); document.body.classList.add('auth-logged-out'); screen.hidden = false; }
    return role;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.textContent = '';
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: document.querySelector('#loginRole').value, password: document.querySelector('#loginPassword').value }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo ingresar');
      window.location.reload();
    } catch (failure) {
      error.textContent = failure.message;
      document.querySelector('#loginPassword').value = '';
      document.querySelector('#loginPassword').focus();
      button.disabled = false;
    }
  });

  document.querySelector('#logoutButton').addEventListener('click', async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('No se pudo cerrar la sesión');
      window.location.reload();
    } catch (failure) { alert(failure.message); }
  });

  window.authApp = {
    session,
    get role() { return role; },
    canView(view) { return Boolean(role && views[role].includes(view)); },
    canEdit(section) { return role === (section === 'inventory' ? 'postharvest' : 'production'); },
    initialView() { return role === 'viewer' ? 'consultation' : role === 'postharvest' ? 'inventory' : 'projection'; },
  };
})();
