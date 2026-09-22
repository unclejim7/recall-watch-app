const cron = require('node-cron');
const { db, getSetting, setSetting } = require('./db');
const { sendRecallAlert } = require('./mailer');
const sms = require('./sms');
const push = require('./push');
const { matchByKeywords } = require('./matcher');
const cpsc = require('./sources/cpsc');
const nhtsa = require('./sources/nhtsa');
const fda = require('./sources/fda');
const usda = require('./sources/usda');

const LOOKBACK_DAYS_FIRST_RUN = 14; // how far back to look the very first time a source runs

function getItemsByCategory(category) {
  const rows = db.prepare(
    `SELECT wi.id, wi.label, wi.criteria_json, u.id AS user_id, u.email, u.phone
     FROM watched_items wi JOIN users u ON u.id = wi.user_id
     WHERE wi.category = ?`
  ).all(category);
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    email: r.email,
    userId: r.user_id,
    phone: r.phone,
    criteria: JSON.parse(r.criteria_json)
  }));
}

function alreadySent(watchedItemId, source, recallId) {
  return !!db.prepare(
    'SELECT 1 FROM sent_alerts WHERE watched_item_id = ? AND source = ? AND recall_id = ?'
  ).get(watchedItemId, source, recallId);
}

function markSent(watchedItemId, source, recallId) {
  db.prepare(
    'INSERT OR IGNORE INTO sent_alerts (watched_item_id, source, recall_id) VALUES (?, ?, ?)'
  ).run(watchedItemId, source, recallId);
}

function sinceDateFor(sourceKey) {
  const stored = getSetting(`last_run_${sourceKey}`);
  if (stored) {
    // small overlap buffer so nothing slips through around a run boundary
    const d = new Date(stored);
    d.setHours(d.getHours() - 6);
    return d;
  }
  const d = new Date();
  d.setDate(d.getDate() - LOOKBACK_DAYS_FIRST_RUN);
  return d;
}

async function processMatches(matches) {
  for (const { item, recall } of matches) {
    if (alreadySent(item.id, recall.source, recall.id)) continue;
    try {
      await sendRecallAlert(item.email, item, recall);
      console.log(`[alert sent] ${item.email} <- ${recall.sourceLabel}: ${recall.title}`);
    } catch (err) {
      console.error(`[alert FAILED] ${item.email}:`, err.message);
      continue; // don't mark as sent if the email failed — retry next cycle
    }
    markSent(item.id, recall.source, recall.id);

    // SMS and push are instant best-effort extras on top of the required email —
    // neither blocks the dedup mark above, and a failure here just logs and moves on.
    if (item.phone && sms.isConfigured()) {
      sms.sendSmsAlert(item.phone, item, recall)
        .then(() => console.log(`[sms sent] ${item.phone} <- ${recall.sourceLabel}: ${recall.title}`))
        .catch((err) => console.error(`[sms FAILED] ${item.phone}:`, err.message));
    }
    push.sendPushToUser(item.userId, item, recall)
      .catch((err) => console.error(`[push FAILED] user ${item.userId}:`, err.message));
  }
}

async function checkConsumerProducts() {
  const items = getItemsByCategory('consumer_product');
  if (items.length === 0) return;
  const since = sinceDateFor('cpsc');
  const recalls = await cpsc.fetchRecent(since);
  await processMatches(matchByKeywords(recalls, items));
  setSetting('last_run_cpsc', new Date().toISOString());
}

async function checkFood() {
  const items = getItemsByCategory('food');
  if (items.length === 0) return;
  const since = sinceDateFor('fda_food');
  const [fdaRecalls, usdaRecalls] = await Promise.all([
    fda.fetchRecentFood(since),
    usda.fetchRecent(since)
  ]);
  await processMatches(matchByKeywords([...fdaRecalls, ...usdaRecalls], items));
  setSetting('last_run_fda_food', new Date().toISOString());
}

async function checkDrugs() {
  const items = getItemsByCategory('drug');
  if (items.length === 0) return;
  const since = sinceDateFor('fda_drug');
  const recalls = await fda.fetchRecentDrug(since);
  await processMatches(matchByKeywords(recalls, items));
  setSetting('last_run_fda_drug', new Date().toISOString());
}

async function checkVehicles() {
  const items = getItemsByCategory('vehicle');
  if (items.length === 0) return;
  // Group by unique make/model/year so we don't hit NHTSA once per user for shared vehicles
  const byVehicle = new Map();
  for (const item of items) {
    const { make, model, year } = item.criteria;
    if (!make || !model || !year) continue;
    const key = `${make}|${model}|${year}`.toLowerCase();
    if (!byVehicle.has(key)) byVehicle.set(key, { make, model, year, items: [] });
    byVehicle.get(key).items.push(item);
  }
  for (const { make, model, year, items: vItems } of byVehicle.values()) {
    try {
      const recalls = await nhtsa.fetchForVehicle({ make, model, year });
      for (const item of vItems) {
        for (const recall of recalls) {
          if (!alreadySent(item.id, recall.source, recall.id)) {
            await processMatches([{ item, recall }]);
          }
        }
      }
    } catch (err) {
      console.error(`[nhtsa error] ${make} ${model} ${year}:`, err.message);
    }
  }
}

async function runAllChecks() {
  console.log(`[recall-watch] running checks at ${new Date().toISOString()}`);
  await checkConsumerProducts().catch((e) => console.error('[cpsc check failed]', e.message));
  await checkFood().catch((e) => console.error('[food check failed]', e.message));
  await checkDrugs().catch((e) => console.error('[drug check failed]', e.message));
  await checkVehicles().catch((e) => console.error('[vehicle check failed]', e.message));
  console.log('[recall-watch] checks complete');
}

function start() {
  const schedule = process.env.CRON_SCHEDULE || '0 */6 * * *';
  cron.schedule(schedule, () => {
    runAllChecks().catch((e) => console.error('[scheduler error]', e));
  });
  console.log(`[recall-watch] scheduler started (${schedule})`);
}

module.exports = { start, runAllChecks };
