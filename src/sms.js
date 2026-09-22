// SMS alerts via Twilio. Entirely optional — inactive until TWILIO_* env vars are set,
// so accounts without a phone number (or deployments without Twilio configured) are unaffected.

let client = null;
function getClient() {
  if (!client) {
    const twilio = require('twilio');
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return client;
}

function isConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

// Carriers segment (and often charge) past 160 chars, so keep this tight.
function buildSmsBody(item, recall) {
  const body = `Recall alert: ${item.label} — ${recall.title}${recall.url ? ` ${recall.url}` : ''}`;
  return body.length > 300 ? `${body.slice(0, 297)}...` : body;
}

async function sendSmsAlert(toPhone, item, recall) {
  if (!isConfigured()) throw new Error('SMS not configured (missing TWILIO_* env vars)');
  await getClient().messages.create({
    to: toPhone,
    from: process.env.TWILIO_FROM_NUMBER,
    body: buildSmsBody(item, recall)
  });
}

module.exports = { sendSmsAlert, buildSmsBody, isConfigured };
