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

/* Fee state of a zone whose price was never measured (owner 2026-11-06: "vi ska kolla så mycket vi kan istället för
   att andra ska göra det"). Zones that would otherwise read "Gratis" without evidence -- private_property with price 0
   and no OSM fee=no, or OSM fee=yes with price 0 / free_parking -- take their state from the fee check
   (assets/data/fee_check.json, attached as p.fee_check by map.js; every entry names its source). Without an entry they
   are 'unknown', never free. Returns null for every other zone, so ordinary zones are unaffected.
   States: paid | free | customers | residents | private | unknown. Data files stay untouched (the weekly OSM sync locks them). */
const FEE_CLASSES = { PAID: 'paid', FREE: 'free', CUSTOMERS: 'customers', RESIDENTS: 'residents', PRIVATE: 'private', UNKNOWN: 'unknown' };
function feeState(p) {
  const fee = String(p.osm_fee == null ? '' : p.osm_fee).toLowerCase();
  const price = p.price_per_hour;
  if (typeof price === 'number' && price > 0) return null;
  const needsCheck = (fee === 'yes' && (price === 0 || p.operator === 'free_parking'))
    || (p.operator === 'private_property' && price === 0 && fee !== 'no');
  if (!needsCheck) return null;
  const state = p.fee_check && FEE_CLASSES[p.fee_check.c];
  if (!state) return 'unknown';
  if (state === 'free' && fee === 'yes') return 'unknown'; // OSM later said fee=yes: a stale "free" must not survive
  return state;
}
function feeUnknown(p) { return feeState(p) === 'unknown'; }
function priceIsFree(p) {
  const st = feeState(p);
  if (st) return st === 'free';
  return p.price_per_hour === 0 || p.operator === 'free_parking';
}
function checkedPrice(p) {
  return feeState(p) === 'paid' && p.fee_check && typeof p.fee_check.p === 'number' && p.fee_check.p > 0 ? p.fee_check.p : null;
}
function priceIsPaid(p) {
  return (typeof p.price_per_hour === 'number' && p.price_per_hour > 0) || feeState(p) === 'paid';
}
/* One wording for card, sheet and sidebar list. */
function priceText(p) {
  switch (feeState(p)) {
    case 'paid': return checkedPrice(p) ? `${checkedPrice(p)} kr/tim` : 'Avgiftsbelagd – pris okänt';
    case 'free': return 'Gratis';
    case 'customers': return 'Kundparkering';
    case 'residents': return 'Boendeparkering / tillstånd';
    case 'private': return 'Privat parkering – ej för allmänheten';
    case 'unknown': return p.operator === 'private_property' ? 'Privat mark – avgift okänd' : 'Avgift okänd – se skylt';
    default: break;
  }
  if (priceIsFree(p)) return 'Gratis';
  if (priceIsPaid(p)) return `${p.price_per_hour} kr/tim`;
  return 'Pris okänt';
}
/* Where the state comes from, for the card ("Källa"). */
function feeSource(p) {
  return feeState(p) && feeState(p) !== 'unknown' && p.fee_check && p.fee_check.s ? p.fee_check.s : '';
}
function textBlob(p) {
  return [p.restrictions, p.osm_note, p.name, p.hours].filter(Boolean).join(' ');
}
function isCharging(p) { return RE_CHARGING.test(textBlob(p)); }
function isResident(p) { return feeState(p) === 'residents' || RE_RESIDENT.test(p.restrictions || '') || RE_RESIDENT.test(p.osm_note || ''); }
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

/* "free_parking" is a price class stored in the operator field; for a fee-unknown zone it must not surface as an
   operator named "Gratis" anywhere (card title, operator row, lists). */
function operatorLabel(p, opsData) {
  if (feeUnknown(p) && p.operator === 'free_parking') return 'Okänd operatör';
  return (opsData && opsData[p.operator]?.name) || p.operator;
}

function areaLabel(p, opsData) {
  const knownOperator = p.operator && p.operator !== 'unknown' && !(feeUnknown(p) && p.operator === 'free_parking') ? (opsData && opsData[p.operator]) : null;
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
  const st = feeState(p);
  if (st === 'customers' || st === 'private') return 'restricted';
  if (st === 'unknown') return 'incomplete';
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
  priceIsFree, priceIsPaid, feeState, feeUnknown, checkedPrice, feeSource, priceText, isCharging, isResident, isAccessible, isTimeLimited,
  isGarageType, isStreetType, isReviewMarker,
  isPlaceholderName, displayName, operatorLabel,
};
