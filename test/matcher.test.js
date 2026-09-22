const test = require('node:test');
const assert = require('node:assert/strict');
const { matchByKeywords, tokenize } = require('../src/matcher');

test('tokenize lowercases, strips punctuation, and drops stopwords', () => {
  assert.deepEqual(
    tokenize('Graco 4Ever DLX Car Seat, for the win!'),
    ['graco', '4ever', 'dlx', 'car', 'seat', 'win']
  );
});

test('matchByKeywords requires every keyword to appear in the recall text', () => {
  const items = [{ id: 1, label: 'My car seat', criteria: { keywords: 'Graco 4Ever DLX car seat' } }];
  const recalls = [
    { id: 'a', searchText: 'graco 4ever dlx convertible car seat recalled for buckle defect' },
    { id: 'b', searchText: 'fisher-price rock n play sleeper recalled' }
  ];
  const matches = matchByKeywords(recalls, items);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].recall.id, 'a');
});

test('matchByKeywords falls back to the label when no keywords are set', () => {
  const items = [{ id: 1, label: 'Honda CR-V', criteria: {} }];
  const recalls = [{ id: 'a', searchText: 'honda cr-v recall for airbag inflator' }];
  const matches = matchByKeywords(recalls, items);
  assert.equal(matches.length, 1);
});

test('matchByKeywords skips items with no usable tokens', () => {
  const items = [{ id: 1, label: '', criteria: { keywords: 'the a of' } }];
  const recalls = [{ id: 'a', searchText: 'anything at all' }];
  assert.deepEqual(matchByKeywords(recalls, items), []);
});

test('matchByKeywords returns no matches for unrelated recalls', () => {
  const items = [{ id: 1, label: 'x', criteria: { keywords: 'Peloton treadmill' } }];
  const recalls = [{ id: 'a', searchText: 'graco car seat buckle defect' }];
  assert.deepEqual(matchByKeywords(recalls, items), []);
});
