// Web Push alerts (Push API + VAPID) — an instant, installable-app-free notification
// on Android/desktop; on iOS Safari it only works once the site is added to the home
// screen (iOS 16.4+). Entirely optional — inactive until VAPID_* env vars are set.

const webpush = require('web-push');
const { db } = require('./db');

let configured = false;
function ensureConfigured() {
  if (configured) return;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    configured = true;
  }
}

function isConfigured() {
  ensureConfigured();
  return configured;
}

function buildPushPayload(item, recall) {
  return JSON.stringify({
    title: `Recall alert: ${item.label}`,
    body: recall.title,
    url: recall.url || '/'
  });
}

function subscriptionsFor(userId) {
  return db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
}

function saveSubscription(userId, sub) {
  db.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
  `).run(userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth);
}

function removeSubscription(userId, endpoint) {
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, endpoint);
}

async function sendPushToUser(userId, item, recall) {
  if (!isConfigured()) return;
  const payload = buildPushPayload(item, recall);
  for (const sub of subscriptionsFor(userId)) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        // Browser dropped the subscription (uninstalled, permission revoked, etc) — stop trying it.
        db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint);
      } else {
        console.error(`[push send failed] user ${userId}:`, err.message);
      }
    }
  }
}

module.exports = {
  isConfigured, buildPushPayload, saveSubscription, removeSubscription, subscriptionsFor, sendPushToUser
};
