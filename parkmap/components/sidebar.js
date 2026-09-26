/* ParkMap Sverige — collapsible desktop sidebar (control center). */
window.PM = window.PM || {};
PM.ui = PM.ui || {};

function operatorCounts(features) {
  const counts = {};
  features.forEach(f => { const op = f.properties.operator; counts[op] = (counts[op] || 0) + 1; });
  return counts;
}

function filterCounts(features) {
  const counts = {};
  PM.FILTER_DEFS.forEach(def => { counts[def.key] = features.filter(f => def.test(f.properties)).length; });
  return counts;
}

function renderSidebar() {
  const s = PM.state;
  if (!s.geoData) return;
  const cfg = PM.CITIES[s.city];
  const cov = PM.map.cityCoverage(s.city);
  const allFeatures = s.geoData.features;
  const fCounts = filterCounts(allFeatures);
  const oCounts = operatorCounts(allFeatures.filter(f => f.properties.operator !== 'unknown'));

  document.getElementById('sb-city-name').textContent = cfg.name;
  document.getElementById('sb-city-line').textContent = `${cov.known} av ${cov.total} identifierade parkeringar` +
    (cov.unverified ? ` · ${cov.unverified} overifierade` : '');
  document.getElementById('sb-pct').textContent = cov.pct + '%';
  document.getElementById('sb-coverage-fill').style.width = cov.pct + '%';
  document.getElementById('sb-coverage-fill').style.background = PM.map.covColor(cov.pct);
  document.getElementById('sb-pct').style.color = PM.map.covColor(cov.pct);

  // Filter toggles
  const unverifiedCount = allFeatures.filter(f => PM.classify.isReviewMarker(f.properties)).length;
  const filterList = document.getElementById('sb-filters');
  filterList.innerHTML = PM.FILTER_DEFS.map(def => {
    const active = s.activeFilters.has(def.key);
    return `<div class="filter-row">
      <label class="filter-row-label" style="cursor:pointer">
        <span class="filter-dot" style="background:${def.color}"></span>
        <span>${def.label}</span>
      </label>
      <span class="filter-count">${fCounts[def.key]}</span>
      <label class="switch">
        <input type="checkbox" data-filter="${def.key}" ${active ? 'checked' : ''}>
        <span class="switch-track"></span>
      </label>
    </div>`;
  }).join('') + (unverifiedCount ? `<div class="filter-row filter-row-unverified">
      <label class="filter-row-label" style="cursor:pointer">
        <span class="filter-dot" style="background:${PM.USAGE_COLORS.unknown};border:1px dashed #475569"></span>
        <span>Visa overifierade</span>
      </label>
      <span class="filter-count">${unverifiedCount}</span>
      <label class="switch">
        <input type="checkbox" id="sb-show-unverified" ${s.showUnverified ? 'checked' : ''}>
        <span class="switch-track"></span>
      </label>
    </div>` : '');
  filterList.querySelectorAll('[data-filter]').forEach(inp => {
    inp.addEventListener('change', () => {
      const key = inp.getAttribute('data-filter');
      if (inp.checked) s.activeFilters.add(key); else s.activeFilters.delete(key);
      PM.map.render();
    });
  });
  document.getElementById('sb-show-unverified')?.addEventListener('change', (e) => {
    s.showUnverified = e.target.checked;
    PM.map.render();
  });

  // Operators (secondary filter)
  const opsList = document.getElementById('sb-operators');
  const opEntries = Object.entries(oCounts).sort((a, b) => b[1] - a[1]);
  opsList.innerHTML = opEntries.map(([key, count]) => {
    const info = s.opsData[key] || { name: key, color: '#64748B' };
    const checked = !s.operatorExclude.has(key);
    return `<div class="op-row">
      <label>
        <input type="checkbox" data-op="${key}" ${checked ? 'checked' : ''}>
        <span class="filter-dot" style="background:${info.color}"></span>
        <span class="name">${info.name}</span>
      </label>
      <span class="op-count">${count}</span>
    </div>`;
  }).join('');
  opsList.querySelectorAll('[data-op]').forEach(inp => {
    inp.addEventListener('change', () => {
      const key = inp.getAttribute('data-op');
      if (inp.checked) s.operatorExclude.delete(key); else s.operatorExclude.add(key);
      PM.map.render();
    });
  });

  // Sync quick-action button active states
  document.querySelector('.quickbtn[data-quick="free"]')?.classList.toggle('active', s.activeFilters.has('free'));
  document.querySelector('.quickbtn[data-quick="near"]')?.classList.toggle('active', s.quickMode === 'near');
  document.querySelector('.quickbtn[data-quick="cheap"]')?.classList.toggle('active', s.quickMode === 'cheap');

  const resetLink = document.getElementById('sb-reset');
  resetLink.style.display = s.activeFilters.size > 0 || s.operatorExclude.size > 0 || s.showUnverified || s.searchTerm ? 'inline-block' : 'none';

  renderResultsList();
}

function renderResultsList() {
  const s = PM.state;
  const container = document.getElementById('sb-results');
  const titleEl = document.getElementById('sb-results-title');
  let items = [];
  let title = '';

  if (s.quickMode === 'near' && s.userLatLng) {
    items = PM.map.nearestFeatures(8);
    title = 'Nära mig';
  } else if (s.quickMode === 'cheap') {
    items = PM.map.visibleFeatures().map(f => f.properties)
      .filter(p => PM.classify.priceIsPaid(p) || PM.classify.priceIsFree(p))
      .sort((a, b) => (a.price_per_hour || 0) - (b.price_per_hour || 0))
      .slice(0, 8);
    title = 'Billigast';
  } else {
    container.innerHTML = '';
    titleEl.style.display = 'none';
    return;
  }
  titleEl.style.display = 'block';
  titleEl.textContent = title + ` (${items.length})`;
  container.innerHTML = items.map(p => resultItemHtml(p)).join('') || '<div class="result-meta">Inga träffar</div>';
  container.querySelectorAll('[data-result]').forEach((el, i) => {
    el.addEventListener('click', () => PM.ui.openCard(items[i]));
  });
}

function resultItemHtml(p) {
  const priceStr = PM.classify.priceIsFree(p) ? 'Gratis' : (p.price_per_hour != null ? `${p.price_per_hour} kr/tim` : 'Pris okänt');
  const opName = (PM.state.opsData && PM.state.opsData[p.operator]?.name) || p.operator;
  return `<div class="result-item" data-result="1">
    <div class="result-name">${PM.classify.displayName(p, PM.state.opsData)}</div>
    <div class="result-meta">${priceStr} · ${opName}</div>
  </div>`;
}

function setQuickMode(mode) {
  const s = PM.state;
  document.querySelectorAll('.quickbtn[data-quick]').forEach(b => b.classList.remove('active'));
  if (mode === 'near') {
    s.quickMode = s.quickMode === 'near' ? null : 'near';
    if (s.quickMode === 'near') {
      const fab = document.getElementById('near-me-fab');
      fab?.classList.add('busy');
      PM.map.locateMe(() => { fab?.classList.remove('busy'); renderResultsList(); });
    }
  } else if (mode === 'free') {
    if (s.activeFilters.has('free')) s.activeFilters.delete('free'); else s.activeFilters.add('free');
    PM.map.render();
    return;
  } else if (mode === 'cheap') {
    s.quickMode = s.quickMode === 'cheap' ? null : 'cheap';
  }
  if (s.quickMode === mode) document.querySelector(`.quickbtn[data-quick="${mode}"]`)?.classList.add('active');
  renderResultsList();
}

function resetFilters() {
  PM.state.activeFilters.clear();
  PM.state.operatorExclude.clear();
  PM.state.showUnverified = false;
  PM.state.searchTerm = '';
  PM.state.quickMode = null;
  document.getElementById('search-input').value = '';
  document.querySelectorAll('.quickbtn[data-quick]').forEach(b => b.classList.remove('active'));
  PM.map.render();
}

PM.ui.refreshSidebar = renderSidebar;
PM.ui.setQuickMode = setQuickMode;
PM.ui.resetFilters = resetFilters;
PM.ui.resultItemHtml = resultItemHtml;
