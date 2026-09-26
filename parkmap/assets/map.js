/* ParkMap Sverige — Leaflet map + data loading + filtering engine. */
window.PM = window.PM || {};

PM.state = {
  city: 'lulea',
  geoData: null,
  opsData: null,
  coverageSummary: null, // assets/data/coverage_summary.json (generated from real GeoJSON)
  activeFilters: new Set(),
  operatorExclude: new Set(),
  showUnverified: false, // opt-in: app_marker_review estimates hidden by default
  searchTerm: '',
  followMap: true,
  autoSwitching: false,
  userLatLng: null,
  selected: null,
};

let map, geoLayer, pinLayer, bboxLayer, userMarker;

// Concept 2.0: round P-pins on top of the zone polygons, but only once
// zoomed in far enough that pins don't just clutter a city-wide view —
// no new dependency, plain Leaflet L.marker/L.divIcon, colored the same
// as the polygon beneath it (usageColor).
const PIN_ZOOM_THRESHOLD = 15;

function initMap() {
  map = L.map('map', { zoomControl: false }).setView([65.583, 22.148], 13);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd', maxZoom: 19,
  }).addTo(map);

  map.on('moveend', () => {
    renderBboxOverlays();
    if (!PM.state.followMap || PM.state.autoSwitching) return;
    const detected = detectCityFromCenter();
    if (detected && detected !== PM.state.city) {
      PM.state.autoSwitching = true;
      PM.ui.showToast(`Visar ${PM.CITIES[detected].name}`);
      loadCity(detected).finally(() => { PM.state.autoSwitching = false; });
    }
  });
  map.on('zoomend', renderPins);
  map.on('click', () => PM.ui.closeCard());
  window.map = map;
  return map;
}

async function fetchCoverageSummary() {
  try {
    const res = await fetch('assets/data/coverage_summary.json');
    if (res.ok) PM.state.coverageSummary = await res.json();
  } catch (e) { /* non-fatal — sidebar falls back to live geojson counts */ }
}

async function loadCity(city) {
  const cfg = PM.CITIES[city];
  if (!cfg) return;
  PM.state.city = city;
  PM.state.activeFilters.clear();
  PM.state.searchTerm = '';
  PM.ui.setLoading(true);
  PM.ui.setError(null);
  PM.ui.closeCard();

  try {
    const geoRes = await fetch(`../data/regions/${cfg.region}/${city}.geojson`);
    if (!geoRes.ok) throw new Error('HTTP ' + geoRes.status);
    PM.state.geoData = await geoRes.json();

    let ops = PM.DEFAULT_OPS;
    try {
      const opsRes = await fetch(`../data/operators/${city}-operators.json`);
      if (opsRes.ok) ops = await opsRes.json();
    } catch (e) { /* fall back to defaults */ }
    PM.state.opsData = Object.assign({}, PM.DEFAULT_OPS, ops);

    map.setView(cfg.center, cfg.zoom);
    document.title = `ParkMap Sverige – ${cfg.name}`;
    render();
    renderBboxOverlays();
    PM.ui.setLoading(false);
    PM.ui.onCityLoaded();
  } catch (e) {
    PM.ui.setLoading(false);
    PM.ui.setError('Kunde inte ladda data: ' + e.message);
  }
}

function visibleFeatures() {
  if (!PM.state.geoData) return [];
  return PM.state.geoData.features.filter(f => {
    const p = f.properties;
    // Ovaliderade Parkster-marker-estimat är INTE bekräftade parkeringar —
    // dolda som default, opt-in via PM.state.showUnverified.
    if (PM.classify.isReviewMarker(p) && !PM.state.showUnverified) return false;
    if (PM.state.operatorExclude.has(p.operator)) return false;
    // Unknown-operator zones stay visible (spec: grey = "Okänd" is a map color
    // category, not a hidden state) but never match a specific filter chip.
    if (PM.state.activeFilters.size > 0 && p.operator === 'unknown') return false;
    return PM.filters.matchesActiveFilters(p) && PM.filters.matchesSearch(p);
  });
}

function render() {
  if (geoLayer) map.removeLayer(geoLayer);
  const features = visibleFeatures();

  geoLayer = L.geoJSON({ type: 'FeatureCollection', features }, {
    style: styleForZone,
    pointToLayer: (f, latlng) => {
      const p = f.properties;
      const color = PM.classify.usageColor(p);
      const review = PM.classify.isReviewMarker(p);
      return L.circleMarker(latlng, {
        radius: 7, color, fillColor: color,
        fillOpacity: review ? 0.25 : 0.6, weight: review ? 1.5 : 2.5,
        opacity: review ? 0.6 : 1, dashArray: review ? '3,3' : null,
      });
    },
    onEachFeature: (f, layer) => {
      layer.on('click', (e) => { L.DomEvent.stopPropagation(e); PM.ui.openCard(f.properties); });
      layer.on('mouseover', () => layer.setStyle({ fillOpacity: 0.8, weight: 3.5 }));
      layer.on('mouseout', () => geoLayer.resetStyle(layer));
    },
  }).addTo(map);

  renderPins();
  PM.ui.refreshSidebar();
}

function renderPins() {
  if (pinLayer) { map.removeLayer(pinLayer); pinLayer = null; }
  if (!geoLayer || map.getZoom() < PIN_ZOOM_THRESHOLD) return;
  pinLayer = L.layerGroup();
  geoLayer.eachLayer(layer => {
    const p = layer.feature.properties;
    const center = layer.getLatLng ? layer.getLatLng() : (layer.getBounds ? layer.getBounds().getCenter() : null);
    if (!center) return;
    const icon = L.divIcon({
      className: '', iconSize: [26, 26], iconAnchor: [13, 13],
      html: `<div class="pmap-pin" style="background:${PM.classify.usageColor(p)}">P</div>`,
    });
    const marker = L.marker(center, { icon });
    marker.on('click', (e) => { L.DomEvent.stopPropagation(e); PM.ui.openCard(p); });
    pinLayer.addLayer(marker);
  });
  pinLayer.addTo(map);
}

function styleForZone(feature) {
  const p = feature.properties;
  const color = PM.classify.usageColor(p);
  const review = PM.classify.isReviewMarker(p);
  // Overifierade Parkster-marker-estimat: streckad kontur + halvtransparent
  // (spec: aldrig samma visuella vikt som en bekräftad parkering).
  if (review) return { fillColor: color, fillOpacity: 0.18, color, weight: 1.5, opacity: 0.55, dashArray: '4,4' };
  return { fillColor: color, fillOpacity: 0.42, color, weight: 2.5, opacity: 0.9 };
}

function switchCity(key) {
  if (key === PM.state.city) return;
  loadCity(key);
}

function renderBboxOverlays() {
  if (bboxLayer) { map.removeLayer(bboxLayer); bboxLayer = null; }
  if (map.getZoom() >= 11) return;
  bboxLayer = L.layerGroup();
  for (const [key, bb] of Object.entries(PM.CITY_BOUNDS)) {
    const cov = cityCoverage(key);
    const color = covColor(cov.pct);
    const isActive = key === PM.state.city;
    const bounds = [[bb.latMin, bb.lngMin], [bb.latMax, bb.lngMax]];
    const rect = L.rectangle(bounds, { color, weight: isActive ? 2.5 : 1.5, fillColor: color, fillOpacity: isActive ? 0.16 : 0.08, dashArray: isActive ? null : '5,5' });
    const cLat = (bb.latMin + bb.latMax) / 2, cLng = (bb.lngMin + bb.lngMax) / 2;
    const label = L.marker([cLat, cLng], {
      icon: L.divIcon({
        className: '', iconSize: [110, 40], iconAnchor: [55, 20],
        html: `<div style="background:${color}dd;color:#0B1220;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:700;white-space:nowrap;text-align:center;font-family:'DM Sans',sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.25)">${PM.CITIES[key].name}<br><span style="font-size:11px;font-weight:400">${cov.pct}% · ${cov.total} zoner</span></div>`,
      }),
    });
    rect.on('click', () => switchCity(key));
    label.on('click', () => switchCity(key));
    bboxLayer.addLayer(rect); bboxLayer.addLayer(label);
  }
  bboxLayer.addTo(map);
}

function detectCityFromCenter() {
  const c = map.getCenter();
  for (const [key, bb] of Object.entries(PM.CITY_BOUNDS)) {
    if (c.lat >= bb.latMin && c.lat <= bb.latMax && c.lng >= bb.lngMin && c.lng <= bb.lngMax) return key;
  }
  return null;
}

function covColor(pct) {
  return pct >= 90 ? '#16A34A' : pct >= 70 ? '#65A30D' : pct >= 50 ? '#F59E0B' : '#DC2626';
}

/* Coverage for a given city: prefer the currently-loaded live GeoJSON (authoritative,
   real-time) when it IS that city; otherwise fall back to the generated summary file. */
function cityCoverage(key) {
  if (key === PM.state.city && PM.state.geoData) {
    // Ovaliderade app_marker_review-estimat räknas inte in i "identifierade
    // parkeringar" — de hör hemma i sitt eget unverified-antal, inte i totalen.
    const all = PM.state.geoData.features;
    const verified = all.filter(f => !PM.classify.isReviewMarker(f.properties));
    const total = verified.length;
    const known = verified.filter(f => f.properties.operator !== 'unknown').length;
    const unverified = all.length - total;
    return { total, known, pct: total ? +(known / total * 100).toFixed(1) : 0, unverified };
  }
  const s = PM.state.coverageSummary && PM.state.coverageSummary.cities && PM.state.coverageSummary.cities[key];
  if (s) return s;
  return { total: 0, known: 0, pct: 0, unverified: 0 };
}

function locateMe(onDone) {
  if (!navigator.geolocation) { alert('GPS stöds ej i denna webbläsare'); onDone && onDone(); return; }
  navigator.geolocation.getCurrentPosition((pos) => {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    PM.state.userLatLng = [lat, lng];
    map.setView([lat, lng], 16);
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.circleMarker([lat, lng], { radius: 8, color: '#2563EB', fillColor: '#2563EB', fillOpacity: 0.9 }).addTo(map).bindPopup('Du är här');
    onDone && onDone();
  }, () => { alert('Kunde inte hämta position'); onDone && onDone(); }, { enableHighAccuracy: true, timeout: 10000 });
}

function nearestFeatures(n) {
  if (!PM.state.userLatLng || !PM.state.geoData) return [];
  const [ulat, ulng] = PM.state.userLatLng;
  const dist = (lat, lng) => Math.hypot(lat - ulat, lng - ulng);
  const withCoords = PM.state.geoData.features
    .map(f => {
      let lat, lng;
      if (f.geometry.type === 'Point') { [lng, lat] = f.geometry.coordinates; }
      else if (f.properties.lat != null && f.properties.lon != null) { lat = f.properties.lat; lng = f.properties.lon; }
      else return null;
      return { f, d: dist(lat, lng) };
    })
    .filter(Boolean)
    .filter(x => x.f.properties.operator !== 'unknown')
    .sort((a, b) => a.d - b.d)
    .slice(0, n || 5)
    .map(x => x.f.properties);
  return withCoords;
}

PM.map = {
  initMap, loadCity, switchCity, render, visibleFeatures, cityCoverage,
  locateMe, nearestFeatures, fetchCoverageSummary, covColor,
  getMap: () => map,
};
