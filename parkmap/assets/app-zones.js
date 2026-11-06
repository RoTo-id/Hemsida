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

  const st = { zones: [], visible: true, layer: null, markers: new Map(), map: null, ctl: null, error: null, loaded: false };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* The popup says exactly what we know: code, app, city, name, and that the location is approximate and the price unknown. */
  function popupHtml(z) {
    return `<div class="appzone-popup">
      <div class="appzone-title">Zon ${esc(z.code)}</div>
      <div class="appzone-meta">${esc(z.app)} · ${esc(z.city)}</div>
      ${z.name ? `<div class="appzone-name">${esc(z.name)}</div>` : ''}
      <div class="appzone-note">${esc(NOTE)}</div>
    </div>`;
  }

  function ringOptions() {
    return { radius: 7, color: '#111827', weight: 2.5, opacity: 0.95, fill: true, fillColor: '#ffffff', fillOpacity: 0.12, className: 'appzone-ring' };
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
    st.zones.forEach((z, i) => {
      if (!inView(z, bounds)) return;
      keep.add(i);
      if (st.markers.has(i)) return;
      const m = L.circleMarker([z.lat, z.lon], ringOptions()).bindPopup(popupHtml(z), { maxWidth: 260 });
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
        div.innerHTML = `<label class="appzones-label"><input type="checkbox" id="app-zones-toggle" checked>
          <span class="appzones-swatch" aria-hidden="true"></span><span class="appzones-text">${esc(LABEL)}</span></label>
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
      st.loaded = true;
    } catch (e) {
      st.error = e.message;
      console.error('ParkMap app zones:', e);
    }
    refresh();
  }

  PM.appZones = { LABEL, NOTE, MIN_ZOOM, esc, popupHtml, ringOptions, init, setVisible, refresh, state: st };
})();
