// CPSC (Consumer Product Safety Commission) — toys, car seats, furniture, appliances, etc.
// Public API, no key required. Docs: https://www.saferproducts.gov/RestWebServices/Help

const SOURCE = 'cpsc';
const SOURCE_LABEL = 'CPSC (Consumer Product Safety Commission)';

async function fetchRecent(sinceDate) {
  // sinceDate: JS Date. API wants YYYY-MM-DD.
  const dateStr = sinceDate.toISOString().slice(0, 10);
  const url = `https://www.saferproducts.gov/RestWebServices/Recall?RecallDateStart=${dateStr}&format=json`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`CPSC API error: ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map(normalize);
}

function normalize(r) {
  const productNames = (r.Products || []).map((p) => p.Name).filter(Boolean).join('; ');
  return {
    source: SOURCE,
    sourceLabel: SOURCE_LABEL,
    id: String(r.RecallID),
    title: r.Title || productNames || 'CPSC recall',
    reason: r.Description || '',
    url: r.URL || `https://www.cpsc.gov/Recalls`,
    date: r.RecallDate || null,
    searchText: [r.Title, productNames, r.Description]
      .filter(Boolean).join(' ').toLowerCase()
  };
}

module.exports = { SOURCE, SOURCE_LABEL, fetchRecent };
