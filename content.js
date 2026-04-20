(() => {
  // Guard against duplicate injection
  if (document.getElementById('_sc_ov')) {
    document.getElementById('_sc_ov').remove();
  }

  let overlay, mask, box, hint;
  let sx = 0, sy = 0, dragging = false;

  // Listen for activation from background script
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'activate') {
      init();
      sendResponse({ ok: true });
    }
    return false;
  });

  function init() {
    // Clean up any existing overlay
    document.getElementById('_sc_ov')?.remove();
    dragging = false;

    // Build overlay structure
    overlay = el('div', '_sc_ov');

    mask = el('div', '_sc_mask');
    overlay.appendChild(mask);

    box = el('div', '_sc_box');
    box.classList.add('_sc_hidden'); // hidden by default via class
    overlay.appendChild(box);

    hint = el('div', '_sc_hint');
    hint.innerHTML = '<b>⬚</b> Drag to select&nbsp;&nbsp;<kbd>ESC</kbd>';
    overlay.appendChild(hint);

    document.documentElement.appendChild(overlay);

    // Mouse events on the overlay itself (mask has pointer-events: none)
    overlay.addEventListener('mousedown', onDown, true);
    overlay.addEventListener('mousemove', onMove, true);
    overlay.addEventListener('mouseup', onUp, true);

    // Touch support for tablets
    overlay.addEventListener('touchstart', onTouchDown, { passive: false });
    overlay.addEventListener('touchmove', onTouchMove, { passive: false });
    overlay.addEventListener('touchend', onTouchUp, { passive: false });

    // ESC to cancel
    document.addEventListener('keydown', onKey, true);
  }

  // ── Mouse handlers ──────────────────────────────────────────────────────────

  function onDown(e) {
    if (e.button !== 0) return; // left click only
    e.preventDefault();
    e.stopPropagation();
    startDrag(e.clientX, e.clientY);
  }

  function onMove(e) {
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();
    updateDrag(e.clientX, e.clientY);
  }

  function onUp(e) {
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();
    endDrag(e.clientX, e.clientY);
  }

  // ── Touch handlers ─────────────────────────────────────────────────────────

  function onTouchDown(e) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY);
  }

  function onTouchMove(e) {
    if (!dragging || e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    updateDrag(t.clientX, t.clientY);
  }

  function onTouchUp(e) {
    if (!dragging) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    endDrag(t.clientX, t.clientY);
  }

  // ── Drag logic ──────────────────────────────────────────────────────────────

  function startDrag(cx, cy) {
    dragging = true;
    sx = cx;
    sy = cy;

    // Hide hint, show box
    if (hint) hint.style.display = 'none';
    box.classList.remove('_sc_hidden');
    drawBox(cx, cy);
  }

  function updateDrag(cx, cy) {
    drawBox(cx, cy);
  }

  function endDrag(cx, cy) {
    dragging = false;
    const r = getRect(cx, cy);

    // Too small = cancel
    if (r.w < 8 || r.h < 8) {
      cleanup();
      return;
    }

    capture(r);
  }

  function drawBox(cx, cy) {
    const r = getRect(cx, cy);
    box.style.left   = r.x + 'px';
    box.style.top    = r.y + 'px';
    box.style.width  = r.w + 'px';
    box.style.height = r.h + 'px';
    box.dataset.sz   = r.w + ' × ' + r.h;
  }

  function getRect(cx, cy) {
    return {
      x: Math.min(sx, cx),
      y: Math.min(sy, cy),
      w: Math.abs(cx - sx),
      h: Math.abs(cy - sy)
    };
  }

  // ── ESC handler ─────────────────────────────────────────────────────────────

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cleanup();
    }
  }

  // ── Capture the selected region ─────────────────────────────────────────────

  function capture(r) {
    box.classList.add('_sc_busy');
    box.dataset.sz = 'Capturing…';

    const dpr = window.devicePixelRatio || 1;
    const physRect = {
      x: Math.round(r.x * dpr),
      y: Math.round(r.y * dpr),
      w: Math.round(r.w * dpr),
      h: Math.round(r.h * dpr)
    };

    chrome.runtime.sendMessage(
      { action: 'capture', rect: physRect },
      (res) => {
        cleanup();
        if (chrome.runtime.lastError) {
          alert('SnapCut: ' + (chrome.runtime.lastError.message || 'Capture failed'));
          return;
        }
        if (!res || res.error) {
          alert('SnapCut: ' + (res?.error || 'Capture failed'));
          return;
        }
        chrome.runtime.sendMessage({ action: 'openResult', dataUrl: res.dataUrl });
      }
    );
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  function cleanup() {
    dragging = false;

    if (overlay) {
      overlay.removeEventListener('mousedown', onDown, true);
      overlay.removeEventListener('mousemove', onMove, true);
      overlay.removeEventListener('mouseup', onUp, true);
      overlay.removeEventListener('touchstart', onTouchDown);
      overlay.removeEventListener('touchmove', onTouchMove);
      overlay.removeEventListener('touchend', onTouchUp);
      overlay.remove();
    }

    document.removeEventListener('keydown', onKey, true);
    overlay = mask = box = hint = null;
  }

  // ── Utility ─────────────────────────────────────────────────────────────────

  function el(tag, id) {
    const e = document.createElement(tag);
    e.id = id;
    return e;
  }
})();
