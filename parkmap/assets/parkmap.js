/* ParkMap Sverige — app bootstrap: header, city modal, menu, card open/close,
   overlays, mobile wiring. Ties together map.js + components/*.js. */
window.PM = window.PM || {};
PM.ui = PM.ui || {};

function setLoading(on) { document.getElementById('loading').style.display = on ? 'flex' : 'none'; }
function setError(msg) {
  const el = document.getElementById('error');
  if (!msg) { el.style.display = 'none'; return; }
  document.getElementById('error-msg').textContent = msg;
  el.style.display = 'flex';
}
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

function openCard(p) {
  PM.state.selected = p;
  const isMobile = window.matchMedia('(max-width:860px)').matches;
  if (isMobile) {
    PM.ui.setSheetMode('card');
    return;
  }
  const card = document.getElementById('parking-card');
  const body = document.getElementById('pc-body');
  body.innerHTML = PM.ui.parkingCard.buildCardHtml(p, PM.state.opsData);
  PM.ui.parkingCard.wireCardEvents(body, p);
  card.classList.add('open');
}
function closeCard() {
  PM.state.selected = null;
  document.getElementById('parking-card')?.classList.remove('open');
  if (PM.ui.getSheetMode && PM.ui.getSheetMode() === 'card') PM.ui.setSheetMode('list');
}

function onCityLoaded() {
  PM.trackEvent?.(`city/${PM.state.city}`, `Stad: ${PM.CITIES[PM.state.city].name}`);
  PM.ui.refreshSidebar();
  PM.ui.renderBottomSheet?.();
  renderMapLegend();
  document.getElementById('mobile-city-name').textContent = PM.CITIES[PM.state.city].name;
  buildCityModalList();
}

function renderMapLegend() {
  const el = document.getElementById('map-legend');
  el.innerHTML = Object.entries(PM.USAGE_LABELS).map(([key, label]) =>
    `<div class="item"><span class="dot" style="background:${PM.USAGE_COLORS[key]}">P</span>${label}</div>`).join('');
}

/* ---- City switcher (search-in-field pill + full modal) ---- */
function buildCityModalList(filterText) {
  const list = document.getElementById('city-modal-list');
  if (!list) return;
  const q = (filterText || '').toLowerCase();
  const regions = {};
  Object.entries(PM.CITIES).forEach(([key, cfg]) => {
    if (q && !cfg.name.toLowerCase().includes(q)) return;
    (regions[cfg.region] = regions[cfg.region] || []).push([key, cfg]);
  });
  const regionLabels = { norrbotten: 'Norrbotten', vasterbotten: 'Västerbotten', vasternorrland: 'Västernorrland', jamtland: 'Jämtland' };
  let html = '';
  Object.entries(regions).forEach(([region, cities]) => {
    html += `<div class="city-modal-region">${regionLabels[region] || region}</div>`;
    cities.forEach(([key, cfg]) => {
      const cov = PM.map.cityCoverage(key);
      const active = key === PM.state.city;
      html += `<div class="city-modal-row${active ? ' active' : ''}" data-city="${key}">
        <span>${cfg.name}</span>
        <span class="cov-pct-tag" style="color:${PM.map.covColor(cov.pct)}">${cov.pct}%</span>
      </div>`;
    });
  });
  list.innerHTML = html || '<div style="padding:16px;color:var(--muted);font-size:13px">Ingen stad hittades</div>';
  list.querySelectorAll('[data-city]').forEach(row => {
    row.addEventListener('click', () => {
      closeCityModal();
      PM.map.switchCity(row.getAttribute('data-city'));
    });
  });
}
function openCityModal() {
  document.getElementById('city-modal-backdrop').classList.add('open');
  document.getElementById('city-modal-search-input').value = '';
  buildCityModalList();
  document.getElementById('city-modal-search-input').focus();
}
function closeCityModal() { document.getElementById('city-modal-backdrop').classList.remove('open'); }

function initHeader() {
  document.getElementById('city-pill').addEventListener('click', openCityModal);
  document.getElementById('mobile-city-pill')?.addEventListener('click', openCityModal);
  document.getElementById('city-modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'city-modal-backdrop') closeCityModal(); });
  document.getElementById('city-modal-close')?.addEventListener('click', closeCityModal);
  document.getElementById('city-modal-search-input').addEventListener('input', (e) => buildCityModalList(e.target.value));

  const searchHandler = (e) => { PM.state.searchTerm = e.target.value; PM.map.render(); };
  document.getElementById('search-input').addEventListener('input', searchHandler);
  document.getElementById('mobile-search-input')?.addEventListener('input', searchHandler);

  document.getElementById('menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('menu-dropdown').classList.toggle('open');
  });
  document.getElementById('mobile-menu-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('menu-dropdown').classList.toggle('open');
  });
  document.addEventListener('click', () => document.getElementById('menu-dropdown').classList.remove('open'));

  document.getElementById('min-position-btn').addEventListener('click', () => PM.map.locateMe(() => showToast('Position hittad')));

  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
    // Leaflet caches its container size — nudge it after the CSS transition
    // finishes so the map actually fills the freed-up space.
    setTimeout(() => PM.map.getMap().invalidateSize(), 220);
  });

  document.getElementById('pc-close').addEventListener('click', closeCard);

  document.querySelectorAll('.quickbtn[data-quick]').forEach(btn => {
    btn.addEventListener('click', () => PM.ui.setQuickMode(btn.getAttribute('data-quick')));
  });
  document.getElementById('sb-reset').addEventListener('click', PM.ui.resetFilters);

  document.getElementById('near-me-fab').addEventListener('click', () => PM.map.locateMe(() => showToast('Position hittad')));

  // Mobile chips
  document.getElementById('chip-free')?.addEventListener('click', (e) => {
    if (PM.state.activeFilters.has('free')) PM.state.activeFilters.delete('free'); else PM.state.activeFilters.add('free');
    e.currentTarget.classList.toggle('active');
    PM.map.render();
  });
  document.getElementById('chip-near')?.addEventListener('click', (e) => {
    e.currentTarget.classList.add('active');
    PM.map.locateMe(() => { PM.ui.setSheetMode('list'); });
  });
  document.getElementById('chip-filter')?.addEventListener('click', () => PM.ui.setSheetMode('filters'));
}

async function boot() {
  initHeader();
  PM.map.initMap();
  await PM.map.fetchCoverageSummary();

  const hashCity = location.hash.replace('#', '').toLowerCase();
  const startCity = (hashCity && PM.CITIES[hashCity]) ? hashCity : 'lulea';
  await PM.map.loadCity(startCity);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

PM.ui.setLoading = setLoading;
PM.ui.setError = setError;
PM.ui.showToast = showToast;
PM.ui.openCard = openCard;
PM.ui.closeCard = closeCard;
PM.ui.onCityLoaded = onCityLoaded;

document.addEventListener('DOMContentLoaded', boot);
