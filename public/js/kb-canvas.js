/* Personal KB brain canvas (waiguge-style UX, standalone vanilla JS). */
(function (global) {
  'use strict';

  const NODE_W = 176;
  const NODE_H = 88;
  const MOVE_THRESHOLD = 6;
  const DEBOUNCE_MS = 280;
  const MIN_ZOOM = 0.45;
  const MAX_ZOOM = 2.5;

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function createKbCanvas(root, options) {
    options = options || {};
    const hooks = {
      onChange: options.onChange || function () {},
      onNodeOpen: options.onNodeOpen || function () {},
      onDelete: options.onDelete || function () {},
      onBlankTap: options.onBlankTap || function () {},
      onSelectionChange: options.onSelectionChange || function () {},
    };

    let pan = { x: Number(options.pan?.x) || 0, y: Number(options.pan?.y) || 0 };
    let zoom = clamp(Number(options.zoom) || 1, MIN_ZOOM, MAX_ZOOM);
    const nodes = new Map();
    (options.items || []).forEach((it) => {
      nodes.set(String(it.id), {
        id: String(it.id),
        title: String(it.title || ''),
        body: String(it.body || ''),
        x: Number(it.x) || 0,
        y: Number(it.y) || 0,
      });
    });

    root.innerHTML = '';
    root.classList.add('kb-brain-root');
    const shell = document.createElement('div');
    shell.className = 'kb-brain';
    shell.innerHTML = `
      <div class="kb-brain-viewport" tabindex="0" aria-label="知识画布">
        <div class="kb-brain-world"></div>
      </div>
      <div class="kb-brain-float hidden" role="toolbar" aria-label="节点操作">
        <button type="button" class="kb-brain-act" data-kb-act="edit">编辑</button>
        <button type="button" class="kb-brain-act danger" data-kb-act="delete">删除</button>
      </div>
      <div class="kb-brain-zoom" aria-label="缩放">
        <button type="button" class="kb-brain-zoom-btn" data-kb-act="zin" aria-label="放大">+</button>
        <button type="button" class="kb-brain-zoom-btn" data-kb-act="zout" aria-label="缩小">−</button>
      </div>`;
    root.appendChild(shell);

    const viewport = shell.querySelector('.kb-brain-viewport');
    const world = shell.querySelector('.kb-brain-world');
    const floatBar = shell.querySelector('.kb-brain-float');
    let selectedId = null;
    let changeTimer = null;
    let destroyed = false;

    function applyTransform() {
      world.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
    }

    function esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function snippet(body) {
      const t = String(body || '').replace(/\s+/g, ' ').trim();
      if (!t) return '（无正文）';
      return t.length > 48 ? t.slice(0, 48) + '…' : t;
    }

    function renderNodes() {
      world.innerHTML = '';
      nodes.forEach((n) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'kb-brain-node' + (selectedId === n.id ? ' sel' : '');
        el.dataset.nodeId = n.id;
        el.style.width = NODE_W + 'px';
        el.style.height = NODE_H + 'px';
        el.style.transform = `translate(${n.x}px, ${n.y}px)`;
        el.innerHTML = `<span class="kb-brain-node-t">${esc(n.title || '未命名')}</span><span class="kb-brain-node-b">${esc(snippet(n.body))}</span>`;
        world.appendChild(el);
      });
      applyTransform();
      positionFloatBar();
    }

    function positionFloatBar() {
      if (!selectedId || floatBar.classList.contains('hidden')) return;
      const node = nodes.get(selectedId);
      const el = world.querySelector(`[data-node-id="${selectedId}"]`);
      if (!node || !el) return;
      const vr = viewport.getBoundingClientRect();
      const nr = el.getBoundingClientRect();
      const left = clamp(nr.left - vr.left + nr.width / 2, 56, vr.width - 56);
      const top = clamp(nr.top - vr.top - 8, 36, vr.height - 12);
      floatBar.style.left = left + 'px';
      floatBar.style.top = top + 'px';
      floatBar.style.transform = 'translate(-50%, -100%)';
    }

    function emitChange() {
      if (destroyed) return;
      const payload = {
        panX: pan.x,
        panY: pan.y,
        zoom,
        nodes: {},
      };
      nodes.forEach((n) => { payload.nodes[n.id] = { x: n.x, y: n.y }; });
      hooks.onChange(payload);
    }

    function scheduleChange() {
      clearTimeout(changeTimer);
      changeTimer = setTimeout(emitChange, DEBOUNCE_MS);
    }

    function selectNode(id) {
      const next = id ? String(id) : null;
      if (selectedId === next) return;
      selectedId = next;
      world.querySelectorAll('.kb-brain-node').forEach(el => el.classList.toggle('sel', el.dataset.nodeId === selectedId));
      floatBar.classList.toggle('hidden', !selectedId);
      positionFloatBar();
      hooks.onSelectionChange(selectedId);
    }

    function screenToWorld(clientX, clientY) {
      const r = viewport.getBoundingClientRect();
      return {
        x: (clientX - r.left - pan.x) / zoom,
        y: (clientY - r.top - pan.y) / zoom,
      };
    }

    function getViewportCenterWorld() {
      const r = viewport.getBoundingClientRect();
      return screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
    }

    let drag = null;

    function onPointerDown(e) {
      if (destroyed) return;
      const nodeEl = e.target.closest('.kb-brain-node');
      const pt = { x: e.clientX, y: e.clientY };
      drag = {
        pointerId: e.pointerId,
        start: pt,
        moved: false,
        mode: nodeEl ? 'node' : 'pan',
        nodeId: nodeEl ? nodeEl.dataset.nodeId : null,
        nodeStart: null,
        panStart: { ...pan },
      };
      if (drag.mode === 'node') {
        const n = nodes.get(drag.nodeId);
        drag.nodeStart = n ? { x: n.x, y: n.y } : { x: 0, y: 0 };
        selectNode(drag.nodeId);
      } else {
        selectNode(null);
      }
      try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
    }

    function onPointerMove(e) {
      if (!drag || drag.pointerId !== e.pointerId) return;
      const dx = e.clientX - drag.start.x;
      const dy = e.clientY - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) >= MOVE_THRESHOLD) drag.moved = true;
      if (drag.mode === 'pan') {
        pan.x = drag.panStart.x + dx;
        pan.y = drag.panStart.y + dy;
        applyTransform();
        positionFloatBar();
        return;
      }
      if (drag.mode === 'node' && drag.nodeStart) {
        const n = nodes.get(drag.nodeId);
        if (!n) return;
        n.x = drag.nodeStart.x + dx / zoom;
        n.y = drag.nodeStart.y + dy / zoom;
        const el = world.querySelector(`[data-node-id="${drag.nodeId}"]`);
        if (el) el.style.transform = `translate(${n.x}px, ${n.y}px)`;
        positionFloatBar();
      }
    }

    function onPointerUp(e) {
      if (!drag || drag.pointerId !== e.pointerId) return;
      const was = drag;
      drag = null;
      try { viewport.releasePointerCapture(e.pointerId); } catch (_) {}
      if (was.mode === 'node' && !was.moved) {
        hooks.onNodeOpen(was.nodeId);
      } else if (was.moved) {
        scheduleChange();
      } else if (was.mode === 'pan') {
        hooks.onBlankTap();
      }
    }

    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    viewport.addEventListener('pointerup', onPointerUp);
    viewport.addEventListener('pointercancel', onPointerUp);

    let pinch = null;
    viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const [a, b] = e.touches;
        pinch = {
          dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
          zoom0: zoom,
          pan0: { ...pan },
          mid: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 },
        };
      }
    }, { passive: true });
    viewport.addEventListener('touchmove', (e) => {
      if (!pinch || e.touches.length !== 2) return;
      const [a, b] = e.touches;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const mid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
      const nz = clamp(pinch.zoom0 * (dist / pinch.dist), MIN_ZOOM, MAX_ZOOM);
      const before = screenToWorld(pinch.mid.x, pinch.mid.y);
      zoom = nz;
      const after = screenToWorld(mid.x, mid.y);
      pan.x += (after.x - before.x) * zoom;
      pan.y += (after.y - before.y) * zoom;
      applyTransform();
      positionFloatBar();
      scheduleChange();
    }, { passive: true });
    viewport.addEventListener('touchend', () => { pinch = null; }, { passive: true });

    shell.addEventListener('click', (e) => {
      const act = e.target.closest('[data-kb-act]');
      if (!act) return;
      e.preventDefault();
      e.stopPropagation();
      const kind = act.dataset.kbAct;
      if (kind === 'edit' && selectedId) hooks.onNodeOpen(selectedId);
      else if (kind === 'delete' && selectedId) hooks.onDelete(selectedId);
      else if (kind === 'zin') {
        zoom = clamp(zoom * 1.15, MIN_ZOOM, MAX_ZOOM);
        applyTransform();
        positionFloatBar();
        scheduleChange();
      } else if (kind === 'zout') {
        zoom = clamp(zoom / 1.15, MIN_ZOOM, MAX_ZOOM);
        applyTransform();
        positionFloatBar();
        scheduleChange();
      }
    });

    renderNodes();

    return {
      destroy() {
        destroyed = true;
        clearTimeout(changeTimer);
        viewport.removeEventListener('pointerdown', onPointerDown);
        viewport.removeEventListener('pointermove', onPointerMove);
        viewport.removeEventListener('pointerup', onPointerUp);
        viewport.removeEventListener('pointercancel', onPointerUp);
        root.innerHTML = '';
        root.classList.remove('kb-brain-root');
      },
      setItems(items) {
        nodes.clear();
        (items || []).forEach((it) => {
          nodes.set(String(it.id), {
            id: String(it.id),
            title: String(it.title || ''),
            body: String(it.body || ''),
            x: Number(it.x) || 0,
            y: Number(it.y) || 0,
          });
        });
        renderNodes();
      },
      upsertItem(it) {
        const id = String(it.id);
        nodes.set(id, {
          id,
          title: String(it.title || ''),
          body: String(it.body || ''),
          x: Number(it.x) || 0,
          y: Number(it.y) || 0,
        });
        renderNodes();
        selectNode(id);
      },
      removeItem(id) {
        nodes.delete(String(id));
        if (selectedId === String(id)) selectNode(null);
        renderNodes();
      },
      getViewportCenterWorld,
      flushChange() {
        clearTimeout(changeTimer);
        emitChange();
      },
    };
  }

  global.createKbCanvas = createKbCanvas;
})(typeof window !== 'undefined' ? window : global);
