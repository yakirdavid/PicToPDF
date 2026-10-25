(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const els = {
    empty: $('empty'),
    gridWrap: $('gridWrap'),
    grid: $('grid'),
    count: $('count'),
    settings: $('settings'),
    actionBar: $('actionBar'),
    clearBtn: $('clearBtn'),
    galleryInput: $('galleryInput'),
    cameraInput: $('cameraInput'),
    fileName: $('fileName'),
    createBtn: $('createBtn'),
    orientationField: $('orientationField'),
    viewer: $('viewer'),
    viewerImg: $('viewerImg'),
    viewerTitle: $('viewerTitle'),
    viewerClose: $('viewerClose'),
    rotateBtn: $('rotateBtn'),
    deleteBtn: $('deleteBtn'),
    result: $('result'),
    resultName: $('resultName'),
    resultInfo: $('resultInfo'),
    resultClose: $('resultClose'),
    shareBtn: $('shareBtn'),
    downloadLink: $('downloadLink'),
    openLink: $('openLink'),
    loading: $('loading'),
    loadingText: $('loadingText'),
    toast: $('toast'),
  };

  // Page sizes in PDF points (1/72 inch)
  const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] };
  const MARGINS = { 0: 0, small: 18, large: 42 };
  const QUALITY = {
    high: { maxSide: 3200, jpeg: 0.92 },
    medium: { maxSide: 2200, jpeg: 0.82 },
    low: { maxSide: 1400, jpeg: 0.68 },
  };
  const THUMB_SIDE = 900;

  const state = {
    images: [], // { id, file, thumbUrl, rotation }
    settings: { pageSize: 'a4', orientation: 'auto', margin: 'small', quality: 'medium' },
    viewingId: null,
    pdf: null, // { blob, url, name }
  };

  let nextId = 1;

  // ---------- Settings persistence ----------
  const SETTINGS_KEY = 'pictopdf.settings';
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (saved) Object.assign(state.settings, saved);
  } catch (_) { /* storage unavailable */ }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch (_) { /* ignore */ }
  }

  // ---------- Helpers ----------
  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
  }

  function showLoading(text) {
    els.loadingText.textContent = text;
    els.loading.hidden = false;
  }
  function hideLoading() { els.loading.hidden = true; }

  function defaultFileName() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `PicToPDF-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function sanitizeName(name) {
    const clean = name.trim().replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, '-');
    return clean || defaultFileName();
  }

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Loads an image file into an <img>. Browsers apply EXIF orientation automatically.
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  // Draws an image to a canvas, rotated (multiples of 90°) and scaled so its longest side ≤ maxSide.
  function renderToCanvas(img, rotation, maxSide) {
    const w0 = img.naturalWidth;
    const h0 = img.naturalHeight;
    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    const w = Math.round(w0 * scale);
    const h = Math.round(h0 * scale);
    const swap = rotation % 180 !== 0;

    const canvas = document.createElement('canvas');
    canvas.width = swap ? h : w;
    canvas.height = swap ? w : h;
    const ctx = canvas.getContext('2d');
    // White background so transparent PNGs don't turn black in JPEG
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    return canvas;
  }

  function canvasToBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', quality);
    });
  }

  async function makeThumb(item) {
    const { img, url } = await loadImage(item.file);
    try {
      const canvas = renderToCanvas(img, item.rotation, THUMB_SIDE);
      const blob = await canvasToBlob(canvas, 0.8);
      if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
      item.thumbUrl = URL.createObjectURL(blob);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ---------- Adding images ----------
  async function addFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (!files.length) return;

    showLoading(files.length > 1 ? `מוסיף ${files.length} תמונות…` : 'מוסיף תמונה…');
    let failed = 0;
    for (const file of files) {
      const item = { id: nextId++, file, thumbUrl: null, rotation: 0 };
      try {
        await makeThumb(item);
        state.images.push(item);
      } catch (_) {
        failed++;
      }
    }
    hideLoading();
    render();

    if (failed) toast(failed === 1 ? 'לא ניתן לפתוח תמונה אחת' : `לא ניתן לפתוח ${failed} תמונות`);
    else toast(files.length === 1 ? 'התמונה נוספה' : `${files.length} תמונות נוספו`);
  }

  els.galleryInput.addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
  els.cameraInput.addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });

  // ---------- Rendering ----------
  const closeIcon = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  function render() {
    const n = state.images.length;
    const has = n > 0;

    els.empty.hidden = has;
    els.gridWrap.hidden = !has;
    els.settings.hidden = !has;
    els.actionBar.hidden = !has;
    els.clearBtn.hidden = !has;
    document.body.classList.toggle('has-images', has);

    els.count.textContent = n === 1 ? 'תמונה אחת' : `${n} תמונות`;

    els.grid.innerHTML = '';
    state.images.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = 'thumb';
      li.dataset.id = item.id;
      li.innerHTML = `
        <img src="${item.thumbUrl}" alt="תמונה ${i + 1}">
        <span class="num">${i + 1}</span>
        <button class="remove" aria-label="הסר תמונה ${i + 1}">${closeIcon}</button>`;
      els.grid.appendChild(li);
    });
  }

  function renumber() {
    els.grid.querySelectorAll('.thumb').forEach((li, i) => {
      li.querySelector('.num').textContent = i + 1;
    });
  }

  function removeImage(id) {
    const idx = state.images.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const [item] = state.images.splice(idx, 1);
    if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
    render();
  }

  // Grid interactions: tap thumbnail → viewer, tap × → remove
  els.grid.addEventListener('click', (e) => {
    const li = e.target.closest('.thumb');
    if (!li) return;
    const id = Number(li.dataset.id);
    if (e.target.closest('.remove')) removeImage(id);
    else openViewer(id);
  });

  // Drag to reorder (touch friendly)
  Sortable.create(els.grid, {
    animation: 180,
    delay: 160,
    delayOnTouchOnly: true,
    touchStartThreshold: 6,
    filter: '.remove',
    preventOnFilter: false,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    onEnd() {
      const order = Array.from(els.grid.children).map((li) => Number(li.dataset.id));
      state.images.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      renumber();
    },
  });

  els.clearBtn.addEventListener('click', () => {
    if (!confirm('להסיר את כל התמונות?')) return;
    state.images.forEach((x) => x.thumbUrl && URL.revokeObjectURL(x.thumbUrl));
    state.images = [];
    render();
  });

  // ---------- Viewer ----------
  function openViewer(id) {
    const idx = state.images.findIndex((x) => x.id === id);
    if (idx < 0) return;
    state.viewingId = id;
    els.viewerImg.src = state.images[idx].thumbUrl;
    els.viewerTitle.textContent = `${idx + 1} מתוך ${state.images.length}`;
    els.viewer.hidden = false;
  }

  function closeViewer() {
    els.viewer.hidden = true;
    state.viewingId = null;
  }

  els.viewerClose.addEventListener('click', closeViewer);

  els.rotateBtn.addEventListener('click', async () => {
    const item = state.images.find((x) => x.id === state.viewingId);
    if (!item) return;
    item.rotation = (item.rotation + 90) % 360;
    await makeThumb(item);
    els.viewerImg.src = item.thumbUrl;
    render();
  });

  els.deleteBtn.addEventListener('click', () => {
    const id = state.viewingId;
    closeViewer();
    removeImage(id);
  });

  // ---------- Settings UI ----------
  document.querySelectorAll('.segmented').forEach((group) => {
    const key = group.dataset.setting;
    const sync = () => {
      group.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.value === String(state.settings[key])));
    };
    sync();
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      state.settings[key] = btn.dataset.value;
      sync();
      saveSettings();
      updateOrientationAvailability();
    });
  });

  function updateOrientationAvailability() {
    // When the page follows the image size, orientation is implied by the image itself
    els.orientationField.querySelector('.segmented').classList.toggle('disabled', state.settings.pageSize === 'fit');
  }
  updateOrientationAvailability();

  els.fileName.value = defaultFileName();
  els.fileName.addEventListener('focus', () => els.fileName.select());

  // ---------- PDF generation ----------
  function pageLayout(imgW, imgH) {
    const { pageSize, orientation, margin } = state.settings;
    const m = MARGINS[margin] ?? 0;
    const landscapeImg = imgW > imgH;

    let pw, ph;
    if (pageSize === 'fit') {
      // Page width matches A4's short side, height follows the image ratio
      const base = PAGE_SIZES.a4[0];
      const inner = base - 2 * m;
      if (landscapeImg) {
        ph = base;
        pw = (ph - 2 * m) * (imgW / imgH) + 2 * m;
      } else {
        pw = base;
        ph = inner * (imgH / imgW) + 2 * m;
      }
    } else {
      const [sw, sh] = PAGE_SIZES[pageSize] || PAGE_SIZES.a4;
      const landscape = orientation === 'landscape' || (orientation === 'auto' && landscapeImg);
      pw = landscape ? sh : sw;
      ph = landscape ? sw : sh;
    }

    const boxW = pw - 2 * m;
    const boxH = ph - 2 * m;
    const scale = Math.min(boxW / imgW, boxH / imgH);
    const w = imgW * scale;
    const h = imgH * scale;
    return { pw, ph, x: (pw - w) / 2, y: (ph - h) / 2, w, h };
  }

  async function createPdf() {
    if (!state.images.length) return;
    const { jsPDF } = window.jspdf;
    const q = QUALITY[state.settings.quality] || QUALITY.medium;
    const name = sanitizeName(els.fileName.value);
    els.fileName.value = name;

    showLoading('מכין את הקובץ…');
    let doc = null;
    try {
      for (let i = 0; i < state.images.length; i++) {
        els.loadingText.textContent = `מעבד תמונה ${i + 1} מתוך ${state.images.length}…`;
        const item = state.images[i];
        const { img, url } = await loadImage(item.file);
        let canvas;
        try {
          canvas = renderToCanvas(img, item.rotation, q.maxSide);
        } finally {
          URL.revokeObjectURL(url);
        }
        const blob = await canvasToBlob(canvas, q.jpeg);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const L = pageLayout(canvas.width, canvas.height);
        // Release canvas memory early (important on iOS)
        canvas.width = canvas.height = 0;

        const orient = L.pw > L.ph ? 'landscape' : 'portrait';
        if (!doc) {
          doc = new jsPDF({ unit: 'pt', format: [L.pw, L.ph], orientation: orient, compress: true });
        } else {
          doc.addPage([L.pw, L.ph], orient);
        }
        doc.addImage(bytes, 'JPEG', L.x, L.y, L.w, L.h, `img${item.id}_${i}`, 'NONE');

        // Yield so the UI can update between pages
        await new Promise((r) => setTimeout(r, 0));
      }

      doc.setProperties({ title: name, creator: 'PicToPDF' });
      const blob = doc.output('blob');
      if (state.pdf) URL.revokeObjectURL(state.pdf.url);
      state.pdf = { blob, url: URL.createObjectURL(blob), name: `${name}.pdf` };
      showResult();
    } catch (err) {
      console.error(err);
      toast('משהו השתבש ביצירת הקובץ. נסו שוב.');
    } finally {
      hideLoading();
    }
  }

  els.createBtn.addEventListener('click', createPdf);

  // ---------- Result sheet ----------
  function canShareFile() {
    if (!navigator.canShare || !state.pdf) return false;
    try {
      return navigator.canShare({ files: [new File([state.pdf.blob], state.pdf.name, { type: 'application/pdf' })] });
    } catch (_) {
      return false;
    }
  }

  function showResult() {
    const pages = state.images.length;
    els.resultName.textContent = state.pdf.name;
    els.resultInfo.innerHTML = `${pages === 1 ? 'עמוד אחד' : `${pages} עמודים`} · <bdi>${formatBytes(state.pdf.blob.size)}</bdi>`;
    els.downloadLink.href = state.pdf.url;
    els.downloadLink.download = state.pdf.name;
    els.openLink.href = state.pdf.url;
    els.shareBtn.hidden = !canShareFile();
    els.toast.classList.remove('show');
    els.result.hidden = false;
  }

  els.shareBtn.addEventListener('click', async () => {
    const file = new File([state.pdf.blob], state.pdf.name, { type: 'application/pdf' });
    try {
      await navigator.share({ files: [file], title: state.pdf.name });
    } catch (err) {
      if (err && err.name !== 'AbortError') toast('השיתוף נכשל – נסו "הורדה"');
    }
  });

  function closeResult() { els.result.hidden = true; }
  els.resultClose.addEventListener('click', closeResult);
  els.result.addEventListener('click', (e) => { if (e.target === els.result) closeResult(); });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!els.viewer.hidden) closeViewer();
    else if (!els.result.hidden) closeResult();
  });

  // ---------- PWA ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  render();
})();
