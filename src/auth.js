const crypto = require('node:crypto');

const ROLES = ['production', 'postharvest', 'viewer'];
const SESSION_MS = 12 * 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

function createAuth(config) {
  const passwords = {
    production: config.productionPassword,
    postharvest: config.postharvestPassword,
    viewer: config.viewerPassword,
  };
  const localTestMode = config.allowInsecureLocal === true && config.secure !== true;
  if (Object.values(passwords).some((password) => typeof password !== 'string' || password.length < 5)) {
    throw new Error('Configura las tres contraseñas con al menos 5 caracteres');
  }
  if (!localTestMode && new Set(Object.values(passwords)).size !== ROLES.length) {
    throw new Error('Configura tres contraseñas distintas');
  }
  if (typeof config.sessionSecret !== 'string' || config.sessionSecret.length < 32) {
    throw new Error('Configura SESSION_SECRET con al menos 32 caracteres aleatorios');
  }
  const secure = Boolean(config.secure);
  const cookieName = secure ? '__Host-fs_session' : 'fs_session';
  const failures = new Map();
  const digests = Object.fromEntries(ROLES.map((role) => [role, crypto.createHash('sha256').update(passwords[role]).digest()]));
  const fingerprints = Object.fromEntries(ROLES.map((role) => [role, digests[role].toString('base64url').slice(0, 16)]));

  function sign(value) {
    return crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
  }

  function equals(a, b) {
    if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b) || a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  function token(role, now = Date.now()) {
    const payload = Buffer.from(JSON.stringify({ role, exp: now + SESSION_MS, fp: fingerprints[role], nonce: crypto.randomBytes(12).toString('base64url') })).toString('base64url');
    return `${payload}.${sign(payload)}`;
  }

  function roleFromToken(value, now = Date.now()) {
    if (typeof value !== 'string' || value.length > 1000) return null;
    const parts = value.split('.');
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    if (!equals(Buffer.from(sign(payload)), Buffer.from(signature))) return null;
    try {
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return ROLES.includes(parsed.role) && parsed.exp > now && parsed.fp === fingerprints[parsed.role] ? parsed.role : null;
    } catch { return null; }
  }

  function cookieValue(req) {
    const cookie = req.headers.cookie || '';
    const part = cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${cookieName}=`));
    return part ? part.slice(cookieName.length + 1) : null;
  }

  function session(req) { return roleFromToken(cookieValue(req)); }

  function setCookie(res, value, maxAge) {
    res.setHeader('Set-Cookie', `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
  }

  function login(req, res) {
    const { role, password } = req.body || {};
    if (!ROLES.includes(role) || typeof password !== 'string' || password.length > 256) {
      return res.status(400).json({ error: 'Selecciona un acceso e ingresa la contraseña' });
    }
    const key = `${req.ip}:${role}`;
    const now = Date.now();
    const prior = failures.get(key);
    const attempt = prior && prior.until > now ? prior : { count: 0, until: now + WINDOW_MS };
    if (attempt.count >= MAX_FAILURES) return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
    const candidate = crypto.createHash('sha256').update(password).digest();
    if (!equals(candidate, digests[role])) {
      failures.set(key, { count: attempt.count + 1, until: attempt.until });
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }
    failures.delete(key);
    setCookie(res, token(role, now), Math.floor(SESSION_MS / 1000));
    res.json({ role });
  }

  function logout(_req, res) {
    setCookie(res, '', 0);
    res.json({ ok: true });
  }

  function requireLogin(req, res, next) {
    const role = session(req);
    if (!role) return res.status(401).json({ error: 'Inicia sesión para consultar los registros' });
    req.authRole = role;
    next();
  }

  function requireRole(...allowed) {
    return (req, res, next) => (allowed.includes(req.authRole)
      ? next() : res.status(403).json({ error: 'Este acceso no tiene permiso para esta sección' }));
  }

  function requireSameOrigin(req, res, next) {//r5454
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const fetchSite = req.get('sec-fetch-site');
    const origin = req.get('origin');
    if (fetchSite === 'cross-site') return res.status(403).json({ error: 'Origen no permitido' });
    if (origin) {
      try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Origen no permitido' }); }
      catch { return res.status(403).json({ error: 'Origen no permitido' }); }
    }
    next();
  }

  return { login, logout, session, requireLogin, requireRole, requireSameOrigin, roleFromToken, token };
}

module.exports = { createAuth };
