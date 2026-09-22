const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePhone } = require('../src/phone');

test('normalizePhone accepts a bare 10-digit US number', () => {
  assert.equal(normalizePhone('5551234567'), '+15551234567');
});

test('normalizePhone accepts common US formatting', () => {
  assert.equal(normalizePhone('(555) 123-4567'), '+15551234567');
  assert.equal(normalizePhone('555-123-4567'), '+15551234567');
});

test('normalizePhone accepts an 11-digit number with a leading 1', () => {
  assert.equal(normalizePhone('15551234567'), '+15551234567');
});

test('normalizePhone accepts an already-E.164 international number', () => {
  assert.equal(normalizePhone('+442071838750'), '+442071838750');
});

test('normalizePhone rejects garbage and empty input', () => {
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone(null), null);
  assert.equal(normalizePhone('not a phone number'), null);
  assert.equal(normalizePhone('123'), null);
});
