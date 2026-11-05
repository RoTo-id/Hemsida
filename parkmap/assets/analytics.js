/* ParkMap Sverige — privacy-friendly, serverless, cookie-free analytics.
   Uses GoatCounter (https://www.goatcounter.com) free tier: no cookies, no
   personal-data collection, GDPR-safe without a consent banner.

   ACTIVATION (one line, Michael): create a free GoatCounter site, then set
   PARKMAP_GOATCOUNTER_SITE below to its site code (the part before
   ".goatcounter.com", lowercase letters/digits/hyphen). While it is null the
   page sends NOTHING anywhere and every tracking call is a harmless no-op.
   Once set, page views plus the events below are counted:
     city/<key>                   city shown
     near-me/click, near-me/found "Nära mig" / "Min position" used (never the position itself)
     pay-click/<operator>/<app>   a pay-app button was tapped
   Events queued before count.js has loaded are flushed when it loads. */
window.PM = window.PM || {};
const PARKMAP_GOATCOUNTER_SITE = null; // TODO(Michael): e.g. "parkmap-sverige"

PM._gcQueue = [];
PM._gcReady = false;

PM.analyticsEnabled = function () {
  return typeof PARKMAP_GOATCOUNTER_SITE === 'string' && /^[a-z0-9][a-z0-9-]{0,62}$/.test(PARKMAP_GOATCOUNTER_SITE);
};

function pmGcSend(item) {
  try { window.goatcounter.count(item); } catch (e) { /* analytics must never break the app */ }
}

(function loadGoatCounter() {
  if (!PM.analyticsEnabled()) {
    // No-op stand-in: every window.goatcounter.count(...) elsewhere is harmless until the account exists.
    window.goatcounter = { count: () => {} };
    return;
  }
  const s = document.createElement('script');
  s.async = true;
  s.setAttribute('data-goatcounter', `https://${PARKMAP_GOATCOUNTER_SITE}.goatcounter.com/count`);
  s.src = 'https://gc.zgo.at/count.js';
  s.onload = () => {
    PM._gcReady = true;
    PM._gcQueue.splice(0).forEach(pmGcSend);
  };
  document.head.appendChild(s);
})();

/* Record a named event (SPA navigation or a click that the automatic pageview can't see). */
PM.trackEvent = function (path, title) {
  if (!PM.analyticsEnabled()) return;
  const item = { path, title: title || path, event: true };
  if (PM._gcReady) pmGcSend(item); else PM._gcQueue.push(item);
};
