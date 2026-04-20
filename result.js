// result.js — orchestrates capture → API → display

const origPanel = document.getElementById('origPanel');
const resPanel  = document.getElementById('resPanel');
const procUI    = document.getElementById('procUI');
const procTitle = document.getElementById('procTitle');
const procSub   = document.getElementById('procSub');
const progFill  = document.getElementById('progFill');
const progPct   = document.getElementById('progPct');
const resBadge  = document.getElementById('resBadge');
const dlBtn     = document.getElementById('dlBtn');
const bgRow     = document.getElementById('bgRow');
const statsRow  = document.getElementById('statsRow');

let resultCanvas = null;
let currentBg    = 'transparent';
let t0;

const REMOVE_BG_API_KEY = (typeof ENV !== 'undefined' && ENV.REMOVE_BG_API_KEY) ? ENV.REMOVE_BG_API_KEY : '';

// ── Load captured image from storage ────────────────────────────────────────
chrome.storage.local.get(['snapcutImage'], ({ snapcutImage }) => {
  if (!snapcutImage) { showErr('No image found. Please capture an area first.'); return; }
  chrome.storage.local.remove('snapcutImage');
  run(snapcutImage);
});

async function run(dataUrl) {
  // Show original
  const oImg = new Image();
  oImg.style.cssText = 'max-width:100%;max-height:380px;border-radius:7px;object-fit:contain;display:block';
  oImg.onload = () => {
    origPanel.innerHTML = '';
    origPanel.appendChild(oImg);
    document.getElementById('stOrig').textContent = oImg.naturalWidth + ' × ' + oImg.naturalHeight + 'px';
    statsRow.style.display = 'flex';
  };
  oImg.src = dataUrl;

  setStatus('Uploading to remove.bg…', 'Preparing API request');
  setProgress(20);
  t0 = performance.now();

  try {
    // We already have a base64 png string: 'data:image/png;base64,...'
    // The Remove.bg API accepts `image_file_b64` which expects raw base64 string without data: URL prefix.
    const base64Data = dataUrl.split(',')[1];
    
    // Create FormData
    const formData = new FormData();
    formData.append('image_file_b64', base64Data);
    formData.append('size', 'auto');
    formData.append('format', 'png');

    setProgress(50);
    setStatus('Processing…', 'Waiting for cut out');

    // Call API
    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': REMOVE_BG_API_KEY,
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg = errorData.errors ? errorData.errors[0].title : response.statusText;
      throw new Error(`API Error: ${response.status} - ${msg}`);
    }

    setProgress(80);
    setStatus('Downloading result…', 'Preparing image');

    // Get the result as a Blob
    const blob = await response.blob();
    const resultUrl = URL.createObjectURL(blob);

    // Create image from blob
    const resultImage = new Image();
    resultImage.onload = () => {
      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);

      // Draw result onto canvas for downloading
      resultCanvas = document.createElement('canvas');
      resultCanvas.width  = resultImage.naturalWidth;
      resultCanvas.height = resultImage.naturalHeight;
      resultCanvas.getContext('2d').drawImage(resultImage, 0, 0);
      resultCanvas.style.cssText = 'max-width:100%;max-height:380px;border-radius:7px;object-fit:contain;display:block';

      // Show result
      procUI.style.display = 'none';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%';
      wrap.appendChild(resultCanvas);
      resPanel.appendChild(wrap);

      resBadge.textContent = 'DONE';
      resBadge.className   = 'badge b-done';
      bgRow.style.display  = 'flex';
      dlBtn.disabled       = false;

      document.getElementById('stOut').textContent    = resultCanvas.width + ' × ' + resultCanvas.height + 'px';
      document.getElementById('stTime').textContent   = elapsed + 's';
      document.getElementById('stStatus').textContent = '✓ Complete';
    };
    resultImage.src = resultUrl;

  } catch (e) {
    showErr(e.message || 'Processing failed');
  }
}

// ── Download ─────────────────────────────────────────────────────────────────
dlBtn.addEventListener('click', () => {
  if (!resultCanvas) return;
  const out = document.createElement('canvas');
  out.width  = resultCanvas.width;
  out.height = resultCanvas.height;
  const ctx  = out.getContext('2d');
  if (currentBg !== 'transparent') { ctx.fillStyle = currentBg; ctx.fillRect(0,0,out.width,out.height); }
  ctx.drawImage(resultCanvas, 0, 0);
  out.toBlob(blob => {
    const a = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'snapcut-result.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
});

// ── Background colour swatches ────────────────────────────────────────────────
document.querySelectorAll('.sw').forEach(sw => {
  sw.addEventListener('click', () => {
    document.querySelectorAll('.sw').forEach(s => s.classList.remove('on'));
    sw.classList.add('on');
    currentBg = sw.dataset.bg;
    if (currentBg === 'transparent') {
      resPanel.style.background = '';
      resPanel.className = 'pb checker';
    } else {
      resPanel.style.background = currentBg;
      resPanel.className = 'pb';
    }
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(title, sub) {
  procTitle.textContent = title;
  if (sub !== undefined) procSub.textContent = sub;
}
function setProgress(pct) {
  progFill.style.width  = pct + '%';
  progPct.textContent   = pct + '%';
}
function showErr(msg) {
  procUI.innerHTML = `<div class="err"><div class="err-icon">⚠️</div><div class="err-title">Something went wrong</div><div class="err-msg">${msg}</div></div>`;
  resBadge.textContent = 'ERROR';
  resBadge.className   = 'badge b-err';
}
