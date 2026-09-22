const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSmsBody, isConfigured } = require('../src/sms');

test('isConfigured is false when Twilio env vars are unset', () => {
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
  assert.equal(isConfigured(), false);
});

test('isConfigured is true only once all three Twilio env vars are set', () => {
  process.env.TWILIO_ACCOUNT_SID = 'AC_test';
  assert.equal(isConfigured(), false);
  process.env.TWILIO_AUTH_TOKEN = 'test_token';
  assert.equal(isConfigured(), false);
  process.env.TWILIO_FROM_NUMBER = '+15550000000';
  assert.equal(isConfigured(), true);

  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
});

test('buildSmsBody includes the item label, recall title, and url', () => {
  const item = { label: 'Graco 4Ever car seat' };
  const recall = { title: 'Buckle can fail to latch', url: 'https://cpsc.gov/recalls/123' };
  const body = buildSmsBody(item, recall);
  assert.match(body, /Graco 4Ever car seat/);
  assert.match(body, /Buckle can fail to latch/);
  assert.match(body, /https:\/\/cpsc\.gov\/recalls\/123/);
});

test('buildSmsBody truncates long messages', () => {
  const item = { label: 'x'.repeat(500) };
  const recall = { title: 'y'.repeat(500) };
  const body = buildSmsBody(item, recall);
  assert.ok(body.length <= 300);
  assert.match(body, /\.\.\.$/);
});
