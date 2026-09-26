/* ParkMap Sverige — privacy-friendly, serverless, cookie-free analytics.
   Uses GoatCounter (https://www.goatcounter.com) free tier: no cookies, no
   personal-data collection, GDPR-safe without a consent banner.

   TODO(Michael): create a free GoatCounter account and site (e.g. "parkmap"),
   then replace PARKMAP_GOATCOUNTER_SITE below with the real site code — the
   script becomes https://<sitecode>.goatcounter.com/count.js. Until that
   exists this loads in "no-op" mode: goatcounter.count() calls are safe
   no-ops (see the guard below) so nothing breaks and nothing is sent anywhere.
*/
window.PM = window.PM || {};
const PARKMAP_GOATCOUNTER_SITE = null; // TODO(Michael): e.g. "parkmap-sverige"

(function loadGoatCounter() {
  if (!PARKMAP_GOATCOUNTER_SITE) {
    // No-op stand-in so every window.goatcounter.count(...) call elsewhere in
    // the app is harmless until the real account exists.
    window.goatcounter = { count: () => {} };
    return;
  }
  const s = document.createElement('script');
  s.async = true;
  s.setAttribute('data-goatcounter', `https://${PARKMAP_GOATCOUNTER_SITE}.goatcounter.com/count`);
  s.src = 'https://gc.zgo.at/count.js';
  document.head.appendChild(s);
})();

/* Helper: record a pageview-style event for SPA navigation (city switch)
   that GoatCounter's automatic pageview pixel can't see on its own. */
PM.trackEvent = function (path, title) {
  window.goatcounter?.count({ path, title: title || path, event: true });
};
