// Very deliberately simple keyword matching: every significant word the user typed
// must appear somewhere in the recall's combined text. This favors missing an
// occasional match over spamming people with false alarms — tune STOPWORDS/logic
// as you learn from real usage.

const STOPWORDS = new Set([
  'the', 'a', 'an', 'my', 'and', 'or', 'of', 'for', 'with', 'in', 'on'
]);

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

// items: watched_items rows with parsed criteria { keywords: "..." }
// recalls: normalized recall objects with .searchText
// returns: [{ item, recall }] pairs that matched
function matchByKeywords(recalls, items) {
  const matches = [];
  for (const item of items) {
    const tokens = tokenize(item.criteria.keywords || item.label);
    if (tokens.length === 0) continue;
    for (const recall of recalls) {
      if (tokens.every((t) => recall.searchText.includes(t))) {
        matches.push({ item, recall });
      }
    }
  }
  return matches;
}

module.exports = { matchByKeywords, tokenize };
