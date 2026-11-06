/* ParkMap Sverige — "Nära mig" position request. Pure logic (geolocation object injected) so it can be tested with a fake.
   Why two requests: a single enableHighAccuracy request with a 10 s timeout and maximumAge 0 fails on phones when the
   GPS has no quick fix (indoors, cold start) even though the OS/another app already has a network/cached position
   (owner walk 2026-11-06: e-park had a fix at the same moment, ParkMap alerted "Kunde inte hämta position").
   So: a fast request that accepts a cached/network position, and in parallel a precise one that may refine it. */
window.PM = window.PM || {};
(function () {
  const FAST = { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 };
  const PRECISE = { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 };

  const MESSAGES = {
    0: 'Din webbläsare saknar stöd för platsbestämning.',
    1: 'Platsåtkomst är avstängd för ParkMap. Tillåt plats i webbläsarens inställningar och försök igen.',
    2: 'Din position är inte tillgänglig just nu (kod 2). Försök igen.',
    3: 'Det tog för lång tid att hitta din position (kod 3). Försök igen, gärna utomhus.',
  };
  function messageFor(code) { return MESSAGES[code] || MESSAGES[2]; }

  /* handlers: onFix(pos, isFirst), onFail({code, message}). Never throws, never alerts. */
  function request(geo, handlers, opts) {
    const fast = Object.assign({}, FAST, opts && opts.fast), precise = Object.assign({}, PRECISE, opts && opts.precise);
    if (!geo || typeof geo.getCurrentPosition !== 'function') { handlers.onFail({ code: 0, message: messageFor(0) }); return; }
    let pending = 2, seen = false;
    const codes = [];
    const ok = (pos) => { handlers.onFix(pos, !seen); seen = true; };
    const bad = (err) => {
      codes.push(err && err.code);
      if (--pending === 0 && !seen) {
        const code = codes.includes(1) ? 1 : codes.includes(3) ? 3 : 2;
        handlers.onFail({ code, message: messageFor(code) });
      }
    };
    try {
      geo.getCurrentPosition(ok, bad, fast);
      geo.getCurrentPosition(ok, bad, precise);
    } catch (e) {
      handlers.onFail({ code: 2, message: messageFor(2) });
    }
  }
  PM.locate = { request, messageFor, FAST, PRECISE };
})();
