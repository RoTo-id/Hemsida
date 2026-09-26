/* ParkMap Sverige — classification heuristics derived from real GeoJSON fields.
   No fabricated data: every category below is computed from properties that
   already exist in the per-city GeoJSON files (price_per_hour, type, hours,
   restrictions, osm_note, operator). Where the source data doesn't yet carry
   a signal (e.g. accessibility tagging), the filter still exists per spec but
   will legitimately show 0/low counts until upstream data adds it. */
window.PM = window.PM || {};

const RE_CHARGING = /ladd|charg|elbil|\bev\b/i;
const RE_RESIDENT = /boende|hyresgäst|resident|tillst[aå]nd(?!.*erfordras.*1 h)/i;
const RE_ACCESSIBLE = /tillgänglig|handicap|rullstol|disab/i;

function priceIsFree(p) {
  return p.price_per_hour === 0 || p.operator === 'free_parking';
}
function priceIsPaid(p) {
  return typeof p.price_per_hour === 'number' && p.price_per_hour > 0;
}
function textBlob(p) {
  return [p.restrictions, p.osm_note, p.name, p.hours].filter(Boolean).join(' ');
}
function isCharging(p) { return RE_CHARGING.test(textBlob(p)); }
function isResident(p) { return RE_RESIDENT.test(p.restrictions || '') || RE_RESIDENT.test(p.osm_note || ''); }
function isAccessible(p) { return RE_ACCESSIBLE.test(textBlob(p)); }
function isTimeLimited(p) { return !!p.hours && p.hours !== '24/7'; }
function isGarageType(p) { return p.type === 'garage' || p.type === 'underground'; }
function isStreetType(p) { return p.type === 'street'; }
/* app_marker_review = ovaliderad positionsgissning (Parkster marker estimate /
   needs_review / not_verified) — INTE en bekräftad parkering. Michael 2026-07-23:
   dessa fick inte ligga i vattnet som vanliga "Okänd"-parkeringar. De döljs som
   default och räknas inte i huvudsiffran; opt-in "Visa overifierade". */
function isReviewMarker(p) { return p.type === 'app_marker_review'; }

/* Human-readable naming (Michael 2026-07-23: raw OSM IDs must never be a
   heading). ~91% of features carry a placeholder `name` — either the literal
   OSM-<id> bootstrap string or a generic review-marker label — because most
   spots were imported from OSM before any real address/name was captured.
   Priority: real name/address on file → else "Typ · Operatör/Område", built
   only from fields that already exist in the GeoJSON (type, operator via
   opsData, municipality/lulebo_district/region). Never the OSM ID itself —
   that stays a small secondary fact (see parking-card.js `addFact('OSM', …)`). */
const OSM_PLACEHOLDER_NAME_RE = /^OSM-\d+$/;
const REVIEW_MARKER_NAME_RE = /marker \(needs review\)$/i;

function isPlaceholderName(name) {
  return !name || OSM_PLACEHOLDER_NAME_RE.test(name) || REVIEW_MARKER_NAME_RE.test(name);
}

const TYPE_AREA_LABELS = {
  garage: 'P-hus',
  underground: 'P-hus (underjordiskt)',
  street: 'Gatuparkering',
  outdoor: 'Parkering',
  lot: 'Parkeringsplats',
  app_marker_review: 'Ej verifierad parkering',
};

function areaLabel(p, opsData) {
  const knownOperator = p.operator && p.operator !== 'unknown' ? (opsData && opsData[p.operator]) : null;
  if (knownOperator?.name) return knownOperator.name;
  return p.lulebo_district || p.municipality || p.region || '';
}

function displayName(p, opsData) {
  if (!isPlaceholderName(p.name)) return p.name;
  const typeLbl = TYPE_AREA_LABELS[p.type] || 'Parkering';
  const area = areaLabel(p, opsData);
  return area ? `${typeLbl} · ${area}` : typeLbl;
}

/* Usage category → drives map marker/polygon color (spec: user-benefit colors) */
function usageCategory(p) {
  if (isCharging(p)) return 'charging';
  if (isResident(p)) return 'resident';
  if (p.operator === 'unknown') return 'unknown';
  if (priceIsFree(p)) return 'free';
  if (priceIsPaid(p)) return 'paid';
  return 'incomplete'; // known operator, no price info on file
}
function usageColor(p) { return PM.USAGE_COLORS[usageCategory(p)]; }

/* Best-effort "open now" parser for the hours free-text field.
   Returns true/false, or null when the format isn't recognized (never guessed). */
function isOpenNow(p, now) {
  now = now || new Date();
  const h = p.hours;
  if (!h) return null;
  if (h === '24/7' || /^every ?day 00-24/i.test(h) || /^alla dagar 00-24/i.test(h)) return true;

  const day = now.getDay(); // 0=sun..6=sat
  const isWeekend = day === 0 || day === 6;
  const isSaturday = day === 6;
  const mins = now.getHours() * 60 + now.getMinutes();
  const toMin = (hh, mm) => parseInt(hh, 10) * 60 + parseInt(mm, 10);

  // "Mon-Fri 09:00-18:00; Sat 09:00-15:00" style
  const segs = h.split(';').map(s => s.trim());
  let matched = false;
  for (const seg of segs) {
    const m = seg.match(/(Mon-Fri|Sat|Sun|Sat-Sun|Vardagar|Helg)[^\d]*(\d{1,2})[:.]?(\d{2})?\s*-\s*(\d{1,2})[:.]?(\d{2})?/i);
    if (!m) continue;
    const tag = m[1].toLowerCase();
    const appliesToday =
      (tag === 'mon-fri' || tag === 'vardagar') ? !isWeekend :
      (tag === 'sat') ? isSaturday :
      (tag === 'sun') ? day === 0 :
      (tag === 'sat-sun' || tag === 'helg') ? isWeekend : false;
    if (!appliesToday) continue;
    matched = true;
    const start = toMin(m[2], m[3] || '0');
    const end = toMin(m[4], m[5] || '0');
    if (mins >= start && mins < end) return true;
  }
  if (matched) return false; // a rule applied today but we're outside its window
  return null; // format not recognized for today
}

/* Filter definitions shown in the sidebar / mobile filter sheet.
   Every `test` runs against real feature properties — counts are always
   computed live from the loaded GeoJSON, never hardcoded. */
PM.FILTER_DEFS = [
  { key: 'free',        label: 'Avgiftsfri',              color: PM.USAGE_COLORS.free,       test: priceIsFree },
  { key: 'paid',        label: 'Avgiftsbelagd',           color: PM.USAGE_COLORS.paid,       test: priceIsPaid },
  { key: 'timed',       label: 'Tidsbegränsad',           color: '#F59E0B',                   test: isTimeLimited },
  { key: 'resident',    label: 'Boendeparkering',         color: PM.USAGE_COLORS.resident,   test: isResident },
  { key: 'charging',    label: 'Laddplats',               color: PM.USAGE_COLORS.charging,   test: isCharging },
  { key: 'accessible',  label: 'Tillgänglighetsparkering', color: '#0EA5E9',                  test: isAccessible },
  { key: 'garage',      label: 'Parkeringshus',           color: '#64748B',                   test: isGarageType },
  { key: 'street',      label: 'Gatuparkering',           color: '#64748B',                   test: isStreetType },
  { key: 'open_now',    label: 'Öppet nu',                color: '#2563EB',                    test: (p) => isOpenNow(p) === true },
];

PM.classify = {
  usageCategory, usageColor, isOpenNow,
  priceIsFree, priceIsPaid, isCharging, isResident, isAccessible, isTimeLimited,
  isGarageType, isStreetType, isReviewMarker,
  isPlaceholderName, displayName,
};
