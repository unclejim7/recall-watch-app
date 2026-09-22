// USDA FSIS recalls — meat, poultry, and egg products (the FDA food feed excludes these).
// Public API, no key required. Docs: https://www.fsis.usda.gov/science-data/developer-resources

const SOURCE = 'usda';
const SOURCE_LABEL = 'USDA FSIS (meat, poultry & egg recalls)';

async function fetchRecent(sinceDate) {
  const url = 'https://www.fsis.usda.gov/fsis/api/recall/v/1';
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`USDA FSIS API error: ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : [])
    .filter((r) => {
      const d = parseDate(r.field_recall_date);
      return d && d >= sinceDate;
    })
    .map(normalize);
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function normalize(r) {
  return {
    source: SOURCE,
    sourceLabel: SOURCE_LABEL,
    id: String(r.field_recall_number || r.field_title),
    title: r.field_title || 'USDA FSIS recall',
    reason: r.field_recall_reason || (Array.isArray(r.field_recall_reason) ? r.field_recall_reason.join(', ') : ''),
    url: r.field_recall_url || 'https://www.fsis.usda.gov/recalls',
    date: r.field_recall_date || null,
    searchText: [r.field_title, r.field_summary, r.field_product_items]
      .filter(Boolean).join(' ').toLowerCase()
  };
}

module.exports = { SOURCE, SOURCE_LABEL, fetchRecent };
