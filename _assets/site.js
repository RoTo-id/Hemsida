/* Maxine Platform / MedRemind — small progressive enhancements.
   No analytics, no cookies, no network requests. */
(function () {
  'use strict';

  /* 1. Check-in demo: press the button, see the confirmed state + 24h countdown. */
  document.querySelectorAll('[data-demo]').forEach(function (demo) {
    var btn = demo.querySelector('.checkin');
    var timer = demo.querySelector('.app-timer');
    var reset = demo.querySelector('.demo-reset');
    var hint = demo.querySelector('.stage-hint');
    var label = demo.querySelector('.checkin-label');
    if (!btn || !timer) return;
    var tick = null;
    var left = 0;
    var hintBefore = hint ? hint.textContent : '';

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function render() {
      var h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;
      timer.textContent = pad(h) + ':' + pad(m) + ':' + pad(s);
    }
    function setState(done) {
      demo.classList.toggle('is-done', done);
      btn.setAttribute('aria-pressed', done ? 'true' : 'false');
      if (label) label.textContent = done ? btn.dataset.done : btn.dataset.todo;
      if (hint) hint.textContent = done ? hint.dataset.done : hintBefore;
      clearInterval(tick);
      if (done) {
        left = 24 * 3600 - 1;
        render();
        tick = setInterval(function () { left = left > 0 ? left - 1 : 0; render(); }, 1000);
      }
    }
    btn.addEventListener('click', function () { setState(btn.getAttribute('aria-pressed') !== 'true'); });
    if (reset) reset.addEventListener('click', function () { setState(false); btn.focus(); });
  });

  /* 2. Walkthrough videos: one pair of players, switched by language. */
  document.querySelectorAll('[data-videos]').forEach(function (box) {
    var tabs = box.querySelectorAll('.video-tabs button');
    var players = box.querySelectorAll('video[data-edition]');
    function show(lang) {
      tabs.forEach(function (t) { t.setAttribute('aria-pressed', t.dataset.lang === lang ? 'true' : 'false'); });
      players.forEach(function (v) {
        var src = v.getAttribute('data-src-' + lang);
        if (!src) return;
        v.pause();
        v.innerHTML = '';
        var vtt = v.getAttribute('data-vtt-' + lang);
        if (vtt) {
          var tr = document.createElement('track');
          tr.kind = 'subtitles'; tr.srclang = lang; tr.label = lang.toUpperCase(); tr.src = vtt;
          v.appendChild(tr);
        }
        v.poster = v.getAttribute('data-poster-' + lang) || '';
        v.src = src;
        v.load();
      });
    }
    tabs.forEach(function (t) { t.addEventListener('click', function () { show(t.dataset.lang); }); });
  });

  /* 3. Campaign pass-through. If a visitor arrives with ?utm_source=...,
        forward those values to the Google Play links as the install referrer,
        so campaigns show up in Play Console's acquisition reports.
        Nothing is stored and nothing is sent anywhere from this site. */
  try {
    var q = new URLSearchParams(location.search);
    var ref = new URLSearchParams();
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) {
      var v = q.get(k);
      if (v) ref.set(k, v.slice(0, 80));
    });
    if (!ref.get('utm_source')) { ref.set('utm_source', 'maxineplatform.com'); ref.set('utm_medium', 'website'); }
    document.querySelectorAll('a[href^="https://play.google.com/store/apps/details"]').forEach(function (a) {
      var u = new URL(a.href);
      u.searchParams.set('referrer', ref.toString());
      a.href = u.toString();
    });
  } catch (e) { /* links keep working without the referrer */ }
})();

/* Home page: Stockholm clock, rotating headline line, scroll reveals. */
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  var clock = document.querySelector('[data-clock]');
  if (clock) {
    var fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit', hour12: false });
    var tickClock = function () { clock.textContent = fmt.format(new Date()); };
    tickClock(); setInterval(tickClock, 15000);
  }

  var rot = document.querySelector('[data-rotate]');
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (rot && !calm) {
    var lines = JSON.parse(rot.getAttribute('data-rotate')), i = 0;
    setInterval(function () {
      rot.classList.add('out');
      setTimeout(function () { i = (i + 1) % lines.length; rot.textContent = lines[i]; rot.classList.remove('out'); }, 460);
    }, 2800);
  }

  var items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) { items.forEach(function (el) { el.classList.add('in'); }); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px' });
  items.forEach(function (el) { io.observe(el); });
})();
