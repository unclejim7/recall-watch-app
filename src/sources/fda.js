// openFDA enforcement reports — covers food and drug recalls.
// Free, no key required (rate-limited to 40 req/min without a key; set FDA_API_KEY to raise that).
// Docs: https://open.fda.gov/apis/food/enforcement/ and https://open.fda.gov/apis/drug/enforcement/

const SOURCE_FOOD = 'fda_food';
const SOURCE_FOOD_LABEL = 'FDA (food recalls)';
const SOURCE_DRUG = 'fda_drug';
const SOURCE_DRUG_LABEL = 'FDA (drug recalls)';

function fmtDate(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

async function fetchEnforcement(endpoint, sinceDate) {
  const start = fmtDate(sinceDate);
  const end = fmtDate(new Date());
  const key = process.env.FDA_API_KEY ? `&api_key=${process.env.FDA_API_KEY}` : '';
  const search = encodeURIComponent(`report_date:[${start}+TO+${end}]`);
  const url = `https://api.fda.gov/${endpoint}.json?search=${search}&limit=100${key}`;
  const res = await fetch(url);
  if (res.status === 404) return []; // openFDA 404s when zero results match the search
  if (!res.ok) throw new Error(`openFDA ${endpoint} error: ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

async function fetchRecentFood(sinceDate) {
  const results = await fetchEnforcement('food/enforcement', sinceDate);
  return results.map((r) => normalize(r, SOURCE_FOOD, SOURCE_FOOD_LABEL));
}

async function fetchRecentDrug(sinceDate) {
  const results = await fetchEnforcement('drug/enforcement', sinceDate);
  return results.map((r) => normalize(r, SOURCE_DRUG, SOURCE_DRUG_LABEL));
}

function normalize(r, source, sourceLabel) {
  return {
    source,
    sourceLabel,
    id: String(r.recall_number),
    title: r.product_description || r.recalling_firm || 'FDA recall',
    reason: r.reason_for_recall || '',
    url: 'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts',
    date: r.report_date || null,
    searchText: [r.product_description, r.reason_for_recall, r.recalling_firm]
      .filter(Boolean).join(' ').toLowerCase()
  };
}

module.exports = {
  SOURCE_FOOD, SOURCE_FOOD_LABEL, SOURCE_DRUG, SOURCE_DRUG_LABEL,
  fetchRecentFood, fetchRecentDrug
};
