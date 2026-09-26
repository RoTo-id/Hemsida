/* ParkMap Sverige — filter/search matching logic (state lives in map.js's PM.state,
   category test functions live in classify.js's PM.FILTER_DEFS). */
window.PM = window.PM || {};

function matchesActiveFilters(p) {
  const active = PM.state.activeFilters;
  if (active.size === 0) return true;
  for (const key of active) {
    const def = PM.FILTER_DEFS.find(d => d.key === key);
    if (def && def.test(p)) return true;
  }
  return false;
}

function matchesSearch(p) {
  const term = PM.state.searchTerm;
  if (!term) return true;
  const s = term.toLowerCase();
  const hay = [p.name, p.operator, p.zone_code, p.restrictions].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(s);
}

PM.filters = { matchesActiveFilters, matchesSearch };
