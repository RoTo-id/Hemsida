/* ParkMap Sverige — parking card component.
   Shared HTML builder used by BOTH the desktop floating card (#parking-card)
   and the mobile bottom sheet (card-mode). Order per spec:
   namn/adress → operatör → pris → tider/regler → ZONKOD [Kopiera] →
   [Öppna i app] → [Vägbeskrivning] → platser/egenskaper → senast kontrollerad
   → rapportera fel. */
window.PM = window.PM || {};
PM.ui = PM.ui || {};

function typeLabel(t) {
  return { garage: 'Garage', outdoor: 'Utomhus', underground: 'Underjordisk', street: 'Gatuparkering', lot: 'Parkeringsplats' }[t] || t;
}

/* The pay button is the product's hero action (Michael 2026-07-23 scope add):
   the user should never need to know who owns the spot — one big tap-and-pay
   button, zone code copyable right next to it. First payment_apps entry = the
   primary/recommended app (big); any others render as smaller secondary
   buttons in the same hero block. All links keep ref=parkmap attribution. */
function payButtonsHtml(op, zoneCode) {
  const apps = (op && op.payment_apps) || [];
  const valid = apps.map(a => ({ name: a, cfg: PM.PAY_APPS[a] })).filter(x => x.cfg);
  if (!valid.length) return '';
  const [primary, ...rest] = valid;
  const zoneChip = zoneCode ? `<div class="pc-hero-zone">
      <div><div class="pc-hero-zone-label">Zonkod</div><div class="pc-hero-zone-code">${zoneCode}</div></div>
      <button class="pc-copy-btn" data-copy="${zoneCode}">Kopiera</button>
    </div>` : '';
  const primaryBtn = `<a class="pc-pay-btn pc-pay-hero" href="${primary.cfg.url}" target="_blank" rel="noopener" style="background:${primary.cfg.color}">Öppna i ${primary.name}</a>`;
  const restBtns = rest.map(({ name, cfg }) => `<a class="pc-pay-btn pc-pay-secondary" href="${cfg.url}" target="_blank" rel="noopener" style="border-color:${cfg.color};color:${cfg.color}">Öppna i ${name}</a>`).join('');
  return `<div class="pc-hero">${zoneChip}${primaryBtn}${restBtns}</div>`;
}

function directionsUrl(p) {
  const q = encodeURIComponent(p.name || p.zone_code || 'parkering');
  if (p.lat != null && p.lon != null) return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function buildCardHtml(p, opsData) {
  const op = opsData[p.operator];
  const opName = op?.name || p.operator;
  const isUnknown = p.operator === 'unknown';
  const cat = PM.classify.usageCategory(p);
  const opColor = PM.USAGE_COLORS[cat];

  const priceHtml = PM.classify.priceIsFree(p)
    ? `<div class="pc-price free">Gratis</div>`
    : (p.price_per_hour != null
        ? `<div class="pc-price">${p.price_per_hour} <small>${p.currency || 'SEK'}/tim</small></div>`
        : `<div class="pc-price" style="color:var(--muted);font-size:15px">Pris ej känt</div>`);

  const openState = PM.classify.isOpenNow(p);
  const openBadge = openState === true ? `<span class="pc-open-badge open">Öppet nu</span>`
    : openState === false ? `<span class="pc-open-badge closed">Stängt nu</span>` : '';

  // Hero block = pay button(s) + zonkod together (the product's primary action).
  // Falls back to a plain zonkod chip when there's no payment app to link to.
  let heroBlock = payButtonsHtml(op, p.zone_code);
  if (!heroBlock && p.zone_code) {
    heroBlock = `<div class="pc-zone-block">
      <div class="pc-zone-label">Zonkod</div>
      <div class="pc-zone-row">
        <div class="pc-zone-code">${p.zone_code}</div>
        <button class="pc-copy-btn" data-copy="${p.zone_code}">Kopiera</button>
      </div>
    </div>`;
  }

  const facts = [];
  const addFact = (label, val) => { if (val != null && val !== '') facts.push(`<div class="row"><span>${label}</span><span>${val}</span></div>`); };
  addFact('Typ', typeLabel(p.type));
  addFact('Platser', p.spots);
  addFact('Restriktioner', p.restrictions);
  if (p.osm_id) addFact('OSM', `<a href="https://www.openstreetmap.org/${p.osm_type || 'way'}/${p.osm_id}" target="_blank" rel="noopener">${p.osm_id}</a>`);
  if (isUnknown && p.lat != null && p.lon != null) addFact('Koordinater', `${parseFloat(p.lat).toFixed(5)}, ${parseFloat(p.lon).toFixed(5)}`);

  const flags = (p.flags || []).map(f => `<span class="pc-flag">${f.replace(/_/g, ' ')}</span>`).join('');

  const unknownNotice = isUnknown ? `<div class="pc-unknown-notice">
      <strong>Okänd operatör</strong> — hittad via OpenStreetMap, men vi vet inte vem som driver den.
      <div style="margin-top:6px">Vet du vem det är? <a href="mailto:parkmap@maxineplatform.com?subject=${encodeURIComponent('Operatör för ' + (p.name || p.id))}">Tipsa oss</a></div>
    </div>` : '';

  return `
    <div class="pc-name">${PM.classify.displayName(p, opsData)}</div>
    <div class="pc-operator"><span class="filter-dot" style="background:${opColor}"></span>${opName}</div>
    ${priceHtml}
    ${p.hours ? `<div class="pc-hours">${p.hours}</div>` : ''}
    ${openBadge}
    ${heroBlock}
    <button class="pc-directions-btn" data-directions="${directionsUrl(p)}">↗ Vägbeskrivning</button>
    ${facts.length ? `<div class="pc-facts">${facts.join('')}</div>` : ''}
    ${flags ? `<div class="pc-flags">${flags}</div>` : ''}
    ${unknownNotice}
    <div class="pc-verified">Data senast kontrollerad: ${p.last_verified || 'okänt datum'}</div>
    <a href="#" class="pc-report" data-report="${encodeURIComponent(p.name || 'zon')}">⚠ Rapportera felaktig information</a>
  `;
}

function wireCardEvents(root, p) {
  root.querySelectorAll('.pc-pay-btn').forEach(a => {
    a.addEventListener('click', () => {
      // Privacy-friendly event: which operator's pay app users actually tap.
      window.goatcounter?.count({ path: `pay-click/${p.operator || 'unknown'}`, title: 'Pay click', event: true });
    });
  });
  root.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-copy');
      navigator.clipboard?.writeText(val).then(() => PM.ui.showToast('Zonkod kopierad: ' + val))
        .catch(() => PM.ui.showToast('Kunde inte kopiera'));
    });
  });
  root.querySelectorAll('[data-directions]').forEach(btn => {
    btn.addEventListener('click', () => window.open(btn.getAttribute('data-directions'), '_blank', 'noopener'));
  });
  root.querySelectorAll('[data-report]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const zone = decodeURIComponent(a.getAttribute('data-report'));
      const subject = encodeURIComponent('ParkMap felrapport: ' + zone);
      const body = encodeURIComponent(`Zon: ${zone}\nVad är fel (pris/tider/zon/operatör/borttagen)?\n\nDin beskrivning: `);
      window.open(`mailto:noreply@maxineplatform.com?subject=${subject}&body=${body}`, '_blank');
    });
  });
}

PM.ui.parkingCard = { buildCardHtml, wireCardEvents, typeLabel };
