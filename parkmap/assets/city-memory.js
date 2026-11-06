/* ParkMap Sverige — remembers the last chosen city (localStorage, always try/catch) and finds the nearest city. */
window.PM = window.PM || {};
(function () {
  const KEY = 'parkmap.city';
  function store() { try { return window.localStorage; } catch (e) { return null; } }
  function get() {
    try { const v = store() && store().getItem(KEY); return v && PM.CITIES && PM.CITIES[v] ? v : null; } catch (e) { return null; }
  }
  function set(city) {
    try { if (store() && PM.CITIES && PM.CITIES[city]) store().setItem(KEY, city); } catch (e) { /* private mode: just don't remember */ }
  }
  function km(lat1, lon1, lat2, lon2) {
    const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(a));
  }
  /* nearest map city to a position, only when within maxKm (else null: do not teleport the map to a far city) */
  function nearest(lat, lon, maxKm) {
    let best = null, bestD = Infinity;
    for (const [key, c] of Object.entries(PM.CITIES || {})) {
      const d = km(lat, lon, c.center[0], c.center[1]);
      if (d < bestD) { best = key; bestD = d; }
    }
    return bestD <= (maxKm == null ? 150 : maxKm) ? best : null;
  }
  PM.cityMemory = { get, set, nearest, KEY };
})();
