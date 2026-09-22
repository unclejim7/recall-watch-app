process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../src/db');
const push = require('../src/push');

function makeUser(email) {
  return db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x').lastInsertRowid;
}

test('isConfigured is false when VAPID env vars are unset', () => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  assert.equal(push.isConfigured(), false);
});

test('buildPushPayload is JSON with title, body, and url', () => {
  const item = { label: 'Family SUV' };
  const recall = { title: '2019 Honda CR-V — airbag', url: 'https://nhtsa.gov/recalls?nhtsaId=123' };
  const payload = JSON.parse(push.buildPushPayload(item, recall));
  assert.equal(payload.title, 'Recall alert: Family SUV');
  assert.equal(payload.body, recall.title);
  assert.equal(payload.url, recall.url);
});

test('buildPushPayload falls back to "/" when the recall has no url', () => {
  const payload = JSON.parse(push.buildPushPayload({ label: 'x' }, { title: 'y' }));
  assert.equal(payload.url, '/');
});

test('saveSubscription stores a subscription and subscriptionsFor returns it', () => {
  const userId = makeUser('push-user@example.com');
  push.saveSubscription(userId, {
    endpoint: 'https://push.example.com/abc',
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' }
  });
  const subs = push.subscriptionsFor(userId);
  assert.equal(subs.length, 1);
  assert.equal(subs[0].endpoint, 'https://push.example.com/abc');
  assert.equal(subs[0].p256dh, 'p256dh-key');
});

test('saveSubscription upserts on a duplicate endpoint instead of duplicating', () => {
  const userId = makeUser('push-user2@example.com');
  const sub = { endpoint: 'https://push.example.com/dup', keys: { p256dh: 'a', auth: 'b' } };
  push.saveSubscription(userId, sub);
  push.saveSubscription(userId, { ...sub, keys: { p256dh: 'a2', auth: 'b2' } });
  const subs = push.subscriptionsFor(userId);
  assert.equal(subs.length, 1);
  assert.equal(subs[0].p256dh, 'a2');
});

test('removeSubscription deletes only that user\'s matching endpoint', () => {
  const userId = makeUser('push-user3@example.com');
  const endpoint = 'https://push.example.com/remove-me';
  push.saveSubscription(userId, { endpoint, keys: { p256dh: 'a', auth: 'b' } });
  assert.equal(push.subscriptionsFor(userId).length, 1);
  push.removeSubscription(userId, endpoint);
  assert.equal(push.subscriptionsFor(userId).length, 0);
});

test('sendPushToUser is a no-op when push is not configured', async () => {
  const userId = makeUser('push-user4@example.com');
  push.saveSubscription(userId, { endpoint: 'https://push.example.com/noop', keys: { p256dh: 'a', auth: 'b' } });
  // Should resolve without throwing and without touching the network, since VAPID isn't set.
  await push.sendPushToUser(userId, { label: 'x' }, { title: 'y' });
  assert.equal(push.subscriptionsFor(userId).length, 1);
});
