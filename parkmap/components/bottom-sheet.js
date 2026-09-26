/* ParkMap Sverige — mobile bottom sheet (list / filter / selected-card modes). */
window.PM = window.PM || {};
PM.ui = PM.ui || {};

let sheetMode = 'list'; // 'list' | 'filters' | 'card'
let dragStartY = null, dragStartTranslate = null;

function sheetEl() { return document.getElementById('bottom-sheet'); }

function renderBottomSheet() {
  const s = PM.state;
  if (!s.geoData) return;
  const sheet = sheetEl();
  const cov = PM.map.cityCoverage(s.city);

  if (sheetMode === 'card' && s.selected) {
    sheet.classList.add('expanded', 'card-mode');
    sheet.innerHTML = `<div class="sheet-handle"></div>
      <div class="sheet-body pc-body" id="sheet-card-body"></div>`;
    const body = document.getElementById('sheet-card-body');
    body.innerHTML = PM.ui.parkingCard.buildCardHtml(s.selected, s.opsData);
    PM.ui.parkingCard.wireCardEvents(body, s.selected);
    wireHandle();
    return;
  }

  sheet.classList.remove('card-mode');
  const features = PM.map.visibleFeatures().map(f => f.properties);

  let bodyHtml;
  if (sheetMode === 'filters') {
    const unverifiedCount = s.geoData.features.filter(f => PM.classify.isReviewMarker(f.properties)).length;
    bodyHtml = `<div class="sidebar-section-title">Filter</div>` +
      PM.FILTER_DEFS.map(def => {
        const active = s.activeFilters.has(def.key);
        return `<div class="filter-row">
          <label class="filter-row-label"><span class="filter-dot" style="background:${def.color}"></span><span>${def.label}</span></label>
          <span class="filter-count">${s.geoData.features.filter(f => def.test(f.properties)).length}</span>
          <label class="switch"><input type="checkbox" data-mfilter="${def.key}" ${active ? 'checked' : ''}><span class="switch-track"></span></label>
        </div>`;
      }).join('') +
      (unverifiedCount ? `<div class="filter-row filter-row-unverified">
          <label class="filter-row-label"><span class="filter-dot" style="background:${PM.USAGE_COLORS.unknown};border:1px dashed #475569"></span><span>Visa overifierade</span></label>
          <span class="filter-count">${unverifiedCount}</span>
          <label class="switch"><input type="checkbox" id="ms-show-unverified" ${s.showUnverified ? 'checked' : ''}><span class="switch-track"></span></label>
        </div>` : '') +
      `<button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:14px" data-show-list>Visa ${features.length} parkeringar</button>`;
  } else {
    bodyHtml = `<div class="sheet-list">` + features.slice(0, 40).map((p, i) => sheetItemHtml(p)).join('') + `</div>`;
    if (!features.length) bodyHtml = `<div class="result-meta">Inga parkeringar matchar filtret.</div>`;
  }

  sheet.innerHTML = `<div class="sheet-handle"></div>
    <div class="sheet-summary">
      <div class="sheet-summary-title">${features.length} parkeringar · ${cov.pct}%</div>
      <div class="sheet-summary-sub">${sheetMode === 'filters' ? 'Filter' : 'Dra upp för att visa lista'}</div>
    </div>
    <div class="sheet-body">${bodyHtml}</div>`;

  sheet.querySelectorAll('[data-mfilter]').forEach(inp => {
    inp.addEventListener('change', () => {
      const key = inp.getAttribute('data-mfilter');
      if (inp.checked) s.activeFilters.add(key); else s.activeFilters.delete(key);
      PM.map.render();
    });
  });
  document.getElementById('ms-show-unverified')?.addEventListener('change', (e) => {
    s.showUnverified = e.target.checked;
    PM.map.render();
  });
  sheet.querySelectorAll('[data-sheet-item]').forEach((el, i) => {
    el.addEventListener('click', () => PM.ui.openCard(features[i]));
  });
  sheet.querySelector('[data-show-list]')?.addEventListener('click', () => { sheetMode = 'list'; renderBottomSheet(); });

  wireHandle();
}

function sheetItemHtml(p) {
  const color = PM.classify.usageColor(p);
  const priceStr = PM.classify.priceIsFree(p) ? 'Gratis' : (p.price_per_hour != null ? `${p.price_per_hour} kr/tim` : 'Pris okänt');
  const opName = (PM.state.opsData && PM.state.opsData[p.operator]?.name) || p.operator;
  return `<div class="sheet-item" data-sheet-item="1">
    <div class="sheet-item-pin" style="background:${color}">P</div>
    <div>
      <div class="sheet-item-name">${PM.classify.displayName(p, PM.state.opsData)}</div>
      <div class="sheet-item-meta">${priceStr} · ${opName}</div>
    </div>
  </div>`;
}

function wireHandle() {
  const sheet = sheetEl();
  const handle = sheet.querySelector('.sheet-handle');
  if (!handle) return;
  handle.addEventListener('pointerdown', onDragStart);
  sheet.querySelector('.sheet-summary')?.addEventListener('click', () => {
    if (sheetMode === 'card') return;
    sheet.classList.toggle('expanded');
  });
}

function onDragStart(e) {
  dragStartY = e.clientY;
  const sheet = sheetEl();
  dragStartTranslate = sheet.classList.contains('expanded') ? 0 : 1;
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
}
function onDragMove(e) {
  const dy = e.clientY - dragStartY;
  const sheet = sheetEl();
  if (dy < -40) sheet.classList.add('expanded');
  if (dy > 40 && dragStartTranslate === 0) sheet.classList.remove('expanded');
}
function onDragEnd() {
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
}

function setSheetMode(mode) { sheetMode = mode; renderBottomSheet(); if (mode !== 'list') sheetEl().classList.add('expanded'); }

PM.ui.renderBottomSheet = renderBottomSheet;
PM.ui.setSheetMode = setSheetMode;
PM.ui.getSheetMode = () => sheetMode;
