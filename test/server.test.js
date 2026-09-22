process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/server');

let server;
let baseUrl;

test.before(() => {
  server = http.createServer(app);
  server.listen(0);
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

// Minimal per-test cookie jar so session cookies survive across requests.
function client() {
  let cookie = '';
  return async (path, opts = {}) => {
    const res = await fetch(baseUrl + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...opts.headers },
      redirect: 'manual'
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  };
}

test('GET /api/health responds ok', async () => {
  const res = await fetch(baseUrl + '/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('unknown /api route 404s', async () => {
  const res = await fetch(baseUrl + '/api/nope');
  assert.equal(res.status, 404);
});

test('/api/check-now is fire-and-forget and returns immediately with no watched items', async () => {
  const c = client();
  await c('/api/signup', { method: 'POST', body: JSON.stringify({ email: 'runner@example.com', password: 'longenough1' }) });
  const res = await c('/api/check-now', { method: 'POST' });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('GET /api/items requires auth', async () => {
  const res = await fetch(baseUrl + '/api/items');
  assert.equal(res.status, 401);
});

test('signup rejects a short password', async () => {
  const c = client();
  const res = await c('/api/signup', { method: 'POST', body: JSON.stringify({ email: 'short@example.com', password: 'short' }) });
  assert.equal(res.status, 400);
});

test('signup rejects a malformed email', async () => {
  const c = client();
  const res = await c('/api/signup', { method: 'POST', body: JSON.stringify({ email: 'not-an-email', password: 'longenough1' }) });
  assert.equal(res.status, 400);
});

test('signup, then duplicate signup is rejected', async () => {
  const c = client();
  const first = await c('/api/signup', { method: 'POST', body: JSON.stringify({ email: 'dup@example.com', password: 'longenough1' }) });
  assert.equal(first.status, 200);
  const second = await client()('/api/signup', { method: 'POST', body: JSON.stringify({ email: 'dup@example.com', password: 'longenough1' }) });
  assert.equal(second.status, 400);
});

test('login fails with wrong password, succeeds with right one', async () => {
  const signupClient = client();
  await signupClient('/api/signup', { method: 'POST', body: JSON.stringify({ email: 'login@example.com', password: 'correcthorse1' }) });

  const wrong = await client()('/api/login', { method: 'POST', body: JSON.stringify({ email: 'login@example.com', password: 'wrongpassword' }) });
  assert.equal(wrong.status, 401);

  const right = await client()('/api/login', { method: 'POST', body: JSON.stringify({ email: 'login@example.com', password: 'correcthorse1' }) });
  assert.equal(right.status, 200);
  assert.equal(right.body.email, 'login@example.com');
});

test('full item lifecycle: add vehicle + consumer product, list, delete', async () => {
  const c = client();
  await c('/api/signup', { method: 'POST', body: JSON.stringify({ email: 'items@example.com', password: 'longenough1' }) });

  const vehicle = await c('/api/items', {
    method: 'POST',
    body: JSON.stringify({ category: 'vehicle', label: 'Family SUV', criteria: { make: 'Honda', model: 'CR-V', year: '2019' } })
  });
  assert.equal(vehicle.status, 200);
  assert.ok(vehicle.body.id);

  const badVehicle = await c('/api/items', {
    method: 'POST',
    body: JSON.stringify({ category: 'vehicle', label: 'Missing year', criteria: { make: 'Honda', model: 'CR-V' } })
  });
  assert.equal(badVehicle.status, 400);

  const product = await c('/api/items', {
    method: 'POST',
    body: JSON.stringify({ category: 'consumer_product', label: 'Car seat', criteria: { keywords: 'Graco 4Ever DLX' } })
  });
  assert.equal(product.status, 200);

  const list = await c('/api/items');
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 2);

  const del = await c(`/api/items/${vehicle.body.id}`, { method: 'DELETE' });
  assert.equal(del.status, 200);

  const listAfter = await c('/api/items');
  assert.equal(listAfter.body.length, 1);
});

test('a user cannot delete another user\'s item', async () => {
  const owner = client();
  await owner('/api/signup', { method: 'POST', body: JSON.stringify({ email: 'owner@example.com', password: 'longenough1' }) });
  const item = await owner('/api/items', {
    method: 'POST',
    body: JSON.stringify({ category: 'consumer_product', label: 'Toy', criteria: { keywords: 'test toy' } })
  });

  const attacker = client();
  await attacker('/api/signup', { method: 'POST', body: JSON.stringify({ email: 'attacker@example.com', password: 'longenough1' }) });
  await attacker(`/api/items/${item.body.id}`, { method: 'DELETE' });

  const stillThere = await owner('/api/items');
  assert.equal(stillThere.body.length, 1);
});

test('logout clears the session', async () => {
  const c = client();
  await c('/api/signup', { method: 'POST', body: JSON.stringify({ email: 'logout@example.com', password: 'longenough1' }) });
  await c('/api/logout', { method: 'POST' });
  const res = await c('/api/items');
  assert.equal(res.status, 401);
});
