const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuth } = require('../src/auth');

const config = {
  productionPassword: 'production-password-123',
  postharvestPassword: 'postharvest-password-456',
  viewerPassword: 'viewer-password-789',
  sessionSecret: 'test-session-secret-with-more-than-32-characters',
  secure: true,
};

test('acepta cinco caracteres, rechaza menos de cinco y conserva claves distintas y sesión larga', () => {
  const shortPasswords = { ...config, productionPassword: 'PROD1', postharvestPassword: 'POSC2', viewerPassword: 'LEER3' };
  const auth = createAuth(shortPasswords);
  assert.equal(auth.roleFromToken(auth.token('viewer')), 'viewer');
  assert.throws(() => createAuth({ ...config, viewerPassword: 'abcd' }), /al menos 5 caracteres/);
  assert.throws(() => createAuth({ ...config, viewerPassword: config.productionPassword }));
  assert.throws(() => createAuth({ ...config, sessionSecret: 'short' }));
});

test('permite 12345 en los tres perfiles solo para pruebas locales', () => {
  const local = { ...config, productionPassword: '12345', postharvestPassword: '12345', viewerPassword: '12345', secure: false, allowInsecureLocal: true };
  const auth = createAuth(local);
  for (const role of ['production', 'postharvest', 'viewer']) {
    assert.equal(auth.roleFromToken(auth.token(role)), role);
  }
  assert.throws(() => createAuth({ ...local, secure: true }));
  assert.throws(() => createAuth({ ...local, allowInsecureLocal: false }));
  assert.throws(() => createAuth({ ...local, viewerPassword: '1234' }));
});

test('sesiones firmadas distinguen los tres perfiles y caducan', () => {
  const auth = createAuth(config);
  for (const role of ['production', 'postharvest', 'viewer']) {
    const token = auth.token(role, 1000);
    assert.equal(auth.roleFromToken(token, 1001), role);
    assert.equal(auth.roleFromToken(token, 1000 + 12 * 60 * 60 * 1000), null);
    assert.equal(auth.roleFromToken(`${token}x`, 1001), null);
  }
  const rotated = createAuth({ ...config, viewerPassword: 'new-viewer-password-789' });
  assert.equal(rotated.roleFromToken(auth.token('viewer')), null);
});

test('login crea cookie segura y rechaza contraseña incorrecta', () => {
  const auth = createAuth(config);
  const req = { ip: '127.0.0.1', body: { role: 'viewer', password: config.viewerPassword } };
  const headers = {};
  const res = {
    setHeader(key, value) { headers[key] = value; },
    json(value) { this.payload = value; return this; },
    status(code) { this.code = code; return this; },
  };
  auth.login(req, res);
  assert.deepEqual(res.payload, { role: 'viewer' });
  assert.match(headers['Set-Cookie'], /__Host-fs_session=.*HttpOnly; SameSite=Strict; Max-Age=43200; Secure/);
  const cookie = headers['Set-Cookie'].split(';')[0];
  assert.equal(auth.session({ headers: { cookie } }), 'viewer');
  req.body.password = 'bad';
  auth.login(req, res);
  assert.equal(res.code, 401);
});

test('solo el perfil autorizado puede escribir en cada sección', () => {
  const auth = createAuth(config);
  const res = { status(code) { this.code = code; return this; }, json(value) { this.payload = value; return this; } };
  let called = false;
  auth.requireRole('production')({ authRole: 'viewer' }, res, () => { called = true; });
  assert.equal(res.code, 403);
  assert.equal(called, false);
  auth.requireRole('production')({ authRole: 'production' }, res, () => { called = true; });
  assert.equal(called, true);
});
