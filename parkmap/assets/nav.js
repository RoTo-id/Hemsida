/* ParkMap Sverige — Android/browser Back closes the topmost open layer (parking card, expanded sheet, city picker, menu)
   instead of leaving the site. Each open layer pushes one history entry; Back pops the top layer; closing a layer by the UI
   (x, map tap) releases its entry. With no layer open, Back behaves normally. */
window.PM = window.PM || {};
(function () {
  const stack = [];          // [{ id, close }]
  let skip = 0;              // popstate events caused by our own history.back()

  function open(id, close) {
    if (stack.some((e) => e.id === id)) return;
    stack.push({ id, close });
    try { history.pushState({ pmLayer: id }, ''); } catch (e) { /* no history API: Back just leaves, as before */ }
  }
  /* the UI closed the layer itself */
  function release(id) {
    const i = stack.findIndex((e) => e.id === id);
    if (i < 0) return;
    const wasTop = i === stack.length - 1;
    stack.splice(i, 1);
    if (wasTop) { skip++; try { history.back(); } catch (e) { skip--; } }
  }
  function onPop() {
    if (skip > 0) { skip--; return; }
    const top = stack.pop();
    if (top) { try { top.close(); } catch (e) { console.error('ParkMap back:', e); } }
  }
  window.addEventListener('popstate', onPop);
  PM.nav = { open, release, depth: () => stack.length, _onPop: onPop };
})();
