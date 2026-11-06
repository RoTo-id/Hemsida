/* ParkMap Sverige — "Zoner från parkeringsappar (ungefärligt läge)": a SEPARATE, toggleable map layer.
   Zones read from the e-park and Parkster apps' search boxes (phone scan 2026-11-06), placed at a street/address
   centroid. They are NOT OSM zones: no price, no operator, never merged into PM.state.geoData, never counted in
   coverage, filters, search or "nearest" results, and drawn as a hollow ring so they cannot be mistaken for a
   priced/verified zone. Data: assets/data/app_zones.json (built by scripts/parkmap_app_zones.py from committed staging). */
window.PM = window.PM || {};

(function () {
  const LABEL = 'Zoner från parkeringsappar (ungefärligt läge)';
  const NOTE = 'Ungefärligt läge – kontrollera skylten. Pris okänt.';
  const MIN_ZOOM = 12;           // below this the rings would only clutter a country-wide view
  const DATA_URL = 'assets/data/app_zones.json';

  const st = { zones: [], visible: true, layer: null, markers: new Map(), groups: [], map: null, ctl: null, error: null, loaded: false };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* The popup says exactly what we know: code, app, city, name, and that the location is approximate and the price unknown. */
  function zoneBlock(z) {
    return `<div class="appzone-title">Zon ${esc(z.code)}</div>
      <div class="appzone-meta">${esc(z.app)} · ${esc(z.city)}</div>
      ${z.name ? `<div class="appzone-name">${esc(z.name)}</div>` : ''}`;
  }
  function popupHtml(z) {
    return `<div class="appzone-popup">${zoneBlock(z)}<div class="appzone-note">${esc(NOTE)}</div></div>`;
  }
  /* Several zones with identical coordinates (the apps only gave a street/city centroid): ONE ring with a count,
     and a list of all of them, so none is hidden and no zone looks more precisely placed than it is. */
  function groupPopupHtml(g) {
    const items = g.zones.map((z) => `<li><b>Zon ${esc(z.code)}</b> · ${esc(z.app)}${z.name ? ' · ' + esc(z.name) : ''}</li>`).join('');
    return `<div class="appzone-popup"><div class="appzone-title">${g.zones.length} zoner på samma punkt</div>
      <div class="appzone-meta">${esc(g.zones[0].city)} · exakt plats okänd</div>
      <ul class="appzone-list">${items}</ul><div class="appzone-note">${esc(NOTE)}</div></div>`;
  }

  /* Group zones that share a coordinate. */
  function groupZones(zones) {
    const m = new Map();
    for (const z of zones) {
      const k = z.lat + ',' + z.lon;
      if (!m.has(k)) m.set(k, { lat: z.lat, lon: z.lon, zones: [] });
      m.get(k).zones.push(z);
    }
    return [...m.values()];
  }

  /* Visual stays small (hollow ring 14 px, or 24 px with a count); the clickable box is 36 px (touch target). */
  const HIT = 36;
  function iconFor(g) {
    const n = g.zones.length;
    const inner = n > 1 ? `<span class="appzone-dot appzone-dot-n">${n}</span>` : '<span class="appzone-dot"></span>';
    return L.divIcon({ className: 'appzone-icon', html: inner, iconSize: [HIT, HIT], iconAnchor: [HIT / 2, HIT / 2], popupAnchor: [0, -12] });
  }
  function ringOptions() {
    return { keyboard: true, riseOnHover: true };
  }

  function inView(z, bounds) { return bounds.contains([z.lat, z.lon]); }

  /* Incremental: markers stay while in view, so a popup survives the pan Leaflet does when it opens
     (a full rebuild on moveend closed it). */
  function refresh() {
    if (!st.map) return;
    const zoomOk = st.map.getZoom() >= MIN_ZOOM;
    updateControl(zoomOk);
    if (!st.layer) st.layer = L.layerGroup();
    if (!st.visible || !zoomOk || !st.zones.length) {
      if (st.map.hasLayer(st.layer)) st.map.removeLayer(st.layer);
      st.layer.clearLayers(); st.markers.clear();
      return;
    }
    if (!st.map.hasLayer(st.layer)) st.layer.addTo(st.map);
    const bounds = st.map.getBounds().pad(0.25);
    const keep = new Set();
    st.groups.forEach((g, i) => {
      if (!inView(g, bounds)) return;
      keep.add(i);
      if (st.markers.has(i)) return;
      const m = L.marker([g.lat, g.lon], Object.assign({ icon: iconFor(g) }, ringOptions()))
        .bindPopup(g.zones.length > 1 ? groupPopupHtml(g) : popupHtml(g.zones[0]), { maxWidth: 280, autoPanPaddingTopLeft: [12, 125], autoPanPaddingBottomRight: [12, 12] });
      st.markers.set(i, m); st.layer.addLayer(m);
    });
    for (const [i, m] of st.markers) {
      if (keep.has(i) || m.isPopupOpen()) continue;
      st.layer.removeLayer(m); st.markers.delete(i);
    }
  }

  function updateControl(zoomOk) {
    if (!st.ctl) return;
    const hint = st.ctl.querySelector('.appzones-hint');
    if (!hint) return;
    if (st.error) hint.textContent = 'Kunde inte ladda appzoner (' + st.error + ')';
    else if (!st.loaded) hint.textContent = 'Laddar …';
    else if (!zoomOk) hint.textContent = `${st.zones.length.toLocaleString('sv-SE')} zoner · zooma in för att visa`;
    else hint.textContent = `${st.zones.length.toLocaleString('sv-SE')} zoner · ungefärligt läge, pris okänt`;
  }

  function setVisible(on) {
    st.visible = !!on;
    const box = st.ctl && st.ctl.querySelector('input');
    if (box) box.checked = st.visible;
    refresh();
  }

  function buildControl() {
    const Ctl = L.Control.extend({
      options: { position: 'topright' },
      onAdd() {
        const div = L.DomUtil.create('div', 'appzones-ctl leaflet-bar');
        div.innerHTML = `<label class="appzones-label" title="${esc(LABEL)}"><input type="checkbox" id="app-zones-toggle" aria-label="${esc(LABEL)}" checked>
          <span class="appzones-swatch" aria-hidden="true"></span><span class="appzones-text"><span class="appzones-full">${esc(LABEL)}</span><span class="appzones-short">Appzoner (ungefärligt)</span></span></label>
          <div class="appzones-hint">Laddar …</div>`;
        L.DomEvent.disableClickPropagation(div);
        div.querySelector('input').addEventListener('change', (e) => setVisible(e.target.checked));
        return div;
      },
    });
    return new Ctl();
  }

  async function init(map) {
    st.map = map;
    const control = buildControl().addTo(map);
    st.ctl = control.getContainer();
    map.on('moveend zoomend', refresh);
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      st.zones = (data.zones || []).filter((z) => Number.isFinite(z.lat) && Number.isFinite(z.lon));
      st.groups = groupZones(st.zones);
      st.loaded = true;
    } catch (e) {
      st.error = e.message;
      console.error('ParkMap app zones:', e);
    }
    refresh();
  }

  PM.appZones = { LABEL, NOTE, MIN_ZOOM, HIT, esc, popupHtml, groupPopupHtml, groupZones, iconFor, ringOptions, init, setVisible, refresh, state: st };
})();
