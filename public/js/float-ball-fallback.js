/*! CSS fallback ball when Three.js module fails to load (1.9.123: transform3d + rAF) */
(function () {
  var ACTIVE = { home: 1, schedule: 1, predict: 1 };
  var root = null, hit = null, active = false;
  var dragging = false, ox = 0, oy = 0, x = 0, y = 0;
  var pending = null, moveRaf = 0;

  function ensure() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'float-ball-fallback';
    root.className = 'float-ball-fallback hidden';
    root.innerHTML = '<div class="fb-css-ball" id="fbCssBall" role="button" aria-label="足球"></div>';
    document.body.appendChild(root);
    hit = root.querySelector('#fbCssBall');
    function tabFloor() {
      var tb = document.getElementById('tabbar');
      var tbH = 54;
      if (tb && !tb.classList.contains('hidden')) {
        // Only read layout on resize/place — not every move
        if (!ensure._tabH || ensure._tabDirty) {
          ensure._tabH = tb.getBoundingClientRect().height;
          ensure._tabDirty = false;
        }
        tbH = ensure._tabH || 54;
      }
      return window.innerHeight - tbH - 56 - 16;
    }
    function applyPos() {
      hit.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    }
    function placeDefault() {
      ensure._tabDirty = true;
      x = window.innerWidth * 0.78 - 28;
      y = Math.max(8, tabFloor());
      applyPos();
    }
    hit.addEventListener('pointerdown', function (e) {
      dragging = true;
      try { window.__fbBusy = true; } catch (_) {}
      if (root) root.classList.add('fb-dragging');
      ox = e.clientX - x; oy = e.clientY - y;
      try { hit.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    hit.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      pending = { cx: e.clientX, cy: e.clientY };
      if (!moveRaf) {
        moveRaf = requestAnimationFrame(function () {
          moveRaf = 0;
          if (!pending || !dragging) return;
          var p = pending; pending = null;
          x = Math.max(8, Math.min(window.innerWidth - 64, p.cx - ox));
          y = Math.max(8, Math.min(tabFloor(), p.cy - oy));
          applyPos();
        });
      }
      e.preventDefault();
    });
    function end() {
      dragging = false;
      pending = null;
      if (moveRaf) { cancelAnimationFrame(moveRaf); moveRaf = 0; }
      if (root) root.classList.remove('fb-dragging');
      try { window.__fbBusy = false; } catch (_) {}
    }
    hit.addEventListener('pointerup', end);
    hit.addEventListener('pointercancel', end);
    window.addEventListener('resize', function () {
      ensure._tabDirty = true;
      if (active) placeDefault();
    });
    placeDefault();
  }

  function show() {
    ensure();
    active = true;
    root.classList.remove('hidden');
  }
  function hide() {
    active = false;
    if (root) {
      root.classList.add('hidden');
      root.classList.remove('fb-dragging');
    }
    try { window.__fbBusy = false; } catch (_) {}
  }
  function syncRoute(name) {
    if (ACTIVE[name]) show(); else hide();
  }
  function mount() {
    if (window.JCFloatBall) return;
    window.JCFloatBall = { syncRoute: syncRoute, show: show, hide: hide, fallback: true };
    try {
      var raw = (location.hash || '#/home').replace(/^#\/?/, '');
      var name = (raw.split('?')[0].split('/')[0]) || 'home';
      syncRoute(name);
    } catch (_) { syncRoute('home'); }
    console.warn('[float-ball] CSS fallback mounted');
  }

  window.JCFloatBallFallback = { mount: mount, syncRoute: syncRoute };
  if (window.__floatBallModuleError) mount();
  setTimeout(function () {
    if (!window.JCFloatBall) {
      console.warn('[float-ball] auto-mount CSS fallback (no JCFloatBall after timeout)');
      mount();
    }
  }, 3500);
})();
