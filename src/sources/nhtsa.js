// NHTSA vehicle recalls. Queried per watched vehicle (make/model/year), since NHTSA's
// API doesn't offer a "recent recalls across everything" firehose the way CPSC/FDA do.
// Public API, no key required. Docs: https://www.nhtsa.gov/nhtsa-datasets-and-apis

const SOURCE = 'nhtsa';
const SOURCE_LABEL = 'NHTSA (vehicle recalls)';

async function fetchForVehicle({ make, model, year }) {
  const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NHTSA API error: ${res.status}`);
  const data = await res.json();
  return (data.results || []).map((r) => normalize(r, { make, model, year }));
}

function normalize(r, vehicle) {
  return {
    source: SOURCE,
    sourceLabel: SOURCE_LABEL,
    // NHTSA campaign number is the stable recall identifier
    id: String(r.NHTSACampaignNumber),
    title: r.Component ? `${vehicle.year} ${vehicle.make} ${vehicle.model} — ${r.Component}` : 'Vehicle recall',
    reason: r.Summary || r.Conequence || r.Consequence || '',
    url: `https://www.nhtsa.gov/recalls?nhtsaId=${r.NHTSACampaignNumber}`,
    date: r.ReportReceivedDate || null,
    searchText: '' // not used — vehicle matching is exact make/model/year via the query itself
  };
}

module.exports = { SOURCE, SOURCE_LABEL, fetchForVehicle };
