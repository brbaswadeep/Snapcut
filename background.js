// background.js — SnapCut service worker

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ── Trigger selection on active tab ──────────────────────────────────────
  if (msg.action === 'startSelection') {
    chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
      if (!tab || !tab.id) return;

      // Prevent injection on chrome:// and edge:// pages
      if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('chrome-extension://'))) {
        return;
      }

      try {
        // Inject CSS first, then the content script
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content.css']
        });

        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });

        // The content script's IIFE runs immediately and registers listener
        // Small delay to ensure listener is registered before sending message
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, { action: 'activate' }, () => {
            // Ignore errors (e.g. if tab was closed)
            if (chrome.runtime.lastError) { /* noop */ }
          });
        }, 100);
      } catch (err) {
        // If scripting fails (e.g. restricted page), try sending message
        // in case content script was already injected from a previous attempt
        try {
          chrome.tabs.sendMessage(tab.id, { action: 'activate' }, () => {
            if (chrome.runtime.lastError) { /* noop */ }
          });
        } catch (_) { /* noop */ }
      }
    });
    return false;
  }

  // ── Capture visible tab and crop to rect ────────────────────────────────
  if (msg.action === 'capture') {
    (async () => {
      try {
        const windowId = sender.tab ? sender.tab.windowId : undefined;
        const captureOpts = { format: 'png', quality: 100 };

        let dataUrl;
        if (windowId !== undefined) {
          dataUrl = await chrome.tabs.captureVisibleTab(windowId, captureOpts);
        } else {
          dataUrl = await chrome.tabs.captureVisibleTab(null, captureOpts);
        }

        const resp   = await fetch(dataUrl);
        const blob   = await resp.blob();
        const bitmap = await createImageBitmap(blob);

        // rect is already in physical pixels (dpr applied in content.js)
        const sx = Math.max(0, Math.round(msg.rect.x));
        const sy = Math.max(0, Math.round(msg.rect.y));
        const sw = Math.min(Math.round(msg.rect.w), bitmap.width  - sx);
        const sh = Math.min(Math.round(msg.rect.h), bitmap.height - sy);

        if (sw <= 0 || sh <= 0) {
          sendResponse({ error: 'Selection out of bounds' });
          return;
        }

        const oc  = new OffscreenCanvas(sw, sh);
        const ctx = oc.getContext('2d');
        ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
        bitmap.close();

        const outBlob = await oc.convertToBlob({ type: 'image/png' });
        const ab      = await outBlob.arrayBuffer();

        // Chunk-safe base64 encoding
        const u8 = new Uint8Array(ab);
        const CHUNK = 32768;
        let bin = '';
        for (let i = 0; i < u8.length; i += CHUNK) {
          bin += String.fromCharCode(...u8.subarray(i, i + CHUNK));
        }

        sendResponse({ dataUrl: 'data:image/png;base64,' + btoa(bin) });
      } catch (e) {
        sendResponse({ error: e.message || 'Capture failed' });
      }
    })();
    return true; // keep message channel open for async response
  }

  // ── Open result page ─────────────────────────────────────────────────────
  if (msg.action === 'openResult') {
    chrome.storage.local.set({ snapcutImage: msg.dataUrl }, () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('result.html') });
    });
    return false;
  }
});
