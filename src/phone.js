// Normalizes user-entered phone numbers into E.164 (what Twilio requires).
// Bare 10-digit numbers are assumed US/Canada; anything else needs a leading "+".

const E164_RE = /^\+[1-9]\d{7,14}$/;

function normalizePhone(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('+')) {
    const compact = `+${trimmed.slice(1).replace(/\D/g, '')}`;
    return E164_RE.test(compact) ? compact : null;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

module.exports = { normalizePhone, E164_RE };
