/**
 * Photo Wallpaper Configurator Modal
 * - Opens fullscreen on "Add to Cart" click
 * - Image shown full (contain) initially
 * - Width/height sliders reveal a fixed crop selection box (centered)
 * - Dragging / zoom pans & scales the IMAGE under the fixed crop box
 * - Debounced "final render" fires ~600ms after user stops interacting
 * - Stale request cancellation via AbortController (latest state wins)
 * - Debug panel shows render count + current load status
 * - On confirm: Canvas API crops the exact selected region, uploads it to
 *   imgBB (permanent URL) or falls back to a compressed base64 thumbnail,
 *   and stores it as a single "Cropped Image" line-item property.
 */

(function () {
  'use strict';

  // ── Configuration ─────────────────────────────────────────────────────────
  var IMGBB_API_KEY = 'bf4f91c9d10fb4be1e9c1f88d07a91d0';

  var MODAL_ID = 'photo-wallpaper-modal';
  var MAX_ZOOM = 4;
  var MIN_ZOOM = 1;
  var modal = null;

  var state = {
    imgNatW: 0, imgNatH: 0,
    imgDispW: 0, imgDispH: 0,
    zoom: 1, panX: 0, panY: 0,
    cropX: 0, cropY: 0,
    cropW: 0, cropH: 0,
    widthCm: 300, heightCm: 240,
    isDragging: false,
    dragStartX: 0, dragStartY: 0,
    dragStartPanX: 0, dragStartPanY: 0,
    variantId: null, price: '', productTitle: '',
  };

  // ── Debug / debounce state ────────────────────────────────────────────────
  var debugRenderCount = 0;
  var renderDebounceTimer = null;
  var currentAbortController = null;

  // ─── helpers ───────────────────────────────────────────────────────────────

  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

  // ─── Debug panel ──────────────────────────────────────────────────────────

  function setDebugStatus(status) {
    if (!modal) return;
    var countEl  = modal.querySelector('#pwm-debug-count');
    var statusEl = modal.querySelector('#pwm-debug-status');
    if (countEl)  countEl.textContent = 'Renders: ' + debugRenderCount;
    if (statusEl) {
      statusEl.className = 'photo-modal__debug-status pwm-debug-' + status;
      var labels = { idle: '● idle', loading: '◌ loading…', ready: '● ready', error: '● error' };
      statusEl.textContent = labels[status] || status;
    }
  }

  // ─── Debounced "final render" ──────────────────────────────────────────────

  function scheduleRender() {
    setDebugStatus('loading');
    if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
    renderDebounceTimer = setTimeout(function () {
      debugRenderCount++;
      setDebugStatus('ready');
    }, 600);
  }

  // ─── build modal HTML ──────────────────────────────────────────────────────

  function buildModal() {
    var el = document.createElement('div');
    el.id = MODAL_ID;
    el.className = 'photo-modal';
    el.setAttribute('hidden', '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Wallpaper configurator');

    el.innerHTML = [
      '<div class="photo-modal__overlay" aria-hidden="true"></div>',
      '<div class="photo-modal__container">',

        // ── Header ──────────────────────────────────────────────────────────
        '<div class="photo-modal__header">',
          '<span class="photo-modal__step">',
            '<span class="photo-modal__step-dots">',
              '<span class="photo-modal__step-dot photo-modal__step-dot--active"></span>',
              '<span class="photo-modal__step-dot"></span>',
              '<span class="photo-modal__step-dot"></span>',
            '</span>',
            'Step 1 of 3',
          '</span>',
          '<button class="photo-modal__close" type="button" aria-label="Close">&times;</button>',
        '</div>',

        // ── Body ────────────────────────────────────────────────────────────
        '<div class="photo-modal__body">',

          // Image side
          '<div class="photo-modal__image-side">',
            '<div class="photo-modal__image-viewport" id="pwm-viewport">',

              '<div class="photo-modal__image-wrapper" id="pwm-image-wrapper">',
                '<img class="photo-modal__image" id="pwm-image" src="" alt=""',
                '  crossorigin="anonymous" draggable="false">',
              '</div>',

              '<div class="photo-modal__crop-overlay" id="pwm-crop-overlay" hidden aria-hidden="true">',
                '<div class="photo-modal__dim" id="pwm-dim-top"></div>',
                '<div class="photo-modal__dim" id="pwm-dim-bottom"></div>',
                '<div class="photo-modal__dim" id="pwm-dim-left"></div>',
                '<div class="photo-modal__dim" id="pwm-dim-right"></div>',
                '<div class="photo-modal__crop-box" id="pwm-crop-box">',
                  '<span class="photo-modal__crop-corner photo-modal__crop-corner--tl"></span>',
                  '<span class="photo-modal__crop-corner photo-modal__crop-corner--tr"></span>',
                  '<span class="photo-modal__crop-corner photo-modal__crop-corner--bl"></span>',
                  '<span class="photo-modal__crop-corner photo-modal__crop-corner--br"></span>',
                  '<span class="photo-modal__crop-hint">&#x2725; Drag to reposition</span>',
                '</div>',
              '</div>',

            '</div>',

            // Zoom bar
            '<div class="photo-modal__controls-bar">',
              '<div class="photo-modal__zoom-bar">',
                '<label for="pwm-zoom-slider">Zoom</label>',
                '<span class="photo-modal__zoom-icon" aria-hidden="true">\u2212</span>',
                '<input type="range" id="pwm-zoom-slider" class="photo-modal__range-slider"',
                '  min="' + MIN_ZOOM + '" max="' + MAX_ZOOM + '" step="0.05" value="1">',
                '<span class="photo-modal__zoom-icon" aria-hidden="true">+</span>',
              '</div>',
            '</div>',
          '</div>',

          // Info panel
          '<div class="photo-modal__info-side">',
            '<h2 class="photo-modal__product-title" id="pwm-title"></h2>',

            '<p class="photo-modal__description">',
              'We produce your wallpaper to measure. Drag the sliders to set your',
              ' wall dimensions and we\'ll prepare your custom print.',
            '</p>',

            // Dimension sliders
            '<div class="photo-modal__dimensions-group">',
              '<p class="photo-modal__section-label">Wall dimensions</p>',

              '<div class="photo-modal__field">',
                '<div class="photo-modal__field-label-row">',
                  '<span class="photo-modal__field-label">Width</span>',
                  '<span class="photo-modal__dim-badge" id="pwm-width-val">300 cm</span>',
                '</div>',
                '<input type="range" id="pwm-width" class="photo-modal__dim-slider"',
                '  min="50" max="1000" step="10" value="300">',
                '<div class="photo-modal__slider-range-row">',
                  '<span>50 cm</span><span>1000 cm</span>',
                '</div>',
              '</div>',

              '<div class="photo-modal__field">',
                '<div class="photo-modal__field-label-row">',
                  '<span class="photo-modal__field-label">Height</span>',
                  '<span class="photo-modal__dim-badge" id="pwm-height-val">240 cm</span>',
                '</div>',
                '<input type="range" id="pwm-height" class="photo-modal__dim-slider"',
                '  min="50" max="1000" step="10" value="240">',
                '<div class="photo-modal__slider-range-row">',
                  '<span>50 cm</span><span>1000 cm</span>',
                '</div>',
              '</div>',

              '<p class="photo-modal__max-warning" id="pwm-max-warning" hidden>',
                '\u26a0 Maximum dimension reached.',
              '</p>',
            '</div>',

            '<div class="photo-modal__note">',
              '<strong>Tip:</strong> Add 10 cm to both width and height to account for overlap and margins.',
            '</div>',

            // Debug panel
            '<div class="photo-modal__debug" id="pwm-debug">',
              '<span class="photo-modal__debug-label">Debug</span>',
              '<span class="photo-modal__debug-item" id="pwm-debug-count">Renders: 0</span>',
              '<span class="photo-modal__debug-status pwm-debug-idle" id="pwm-debug-status">● idle</span>',
            '</div>',

          '</div>',

        '</div>',

        // ── Footer ──────────────────────────────────────────────────────────
        '<div class="photo-modal__footer">',
          '<div class="photo-modal__price-block">',
            '<span class="photo-modal__price" id="pwm-price"></span>',
            '<span class="photo-modal__price-note">Incl. VAT</span>',
          '</div>',
          '<button class="photo-modal__next-btn" id="pwm-next-btn" type="button">',
            '<span class="btn-text">Add to Cart</span>',
            '<span class="btn-arrow" aria-hidden="true">',
              '<svg width="16" height="16" viewBox="0 0 16 16" fill="none">',
                '<path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.8"',
                '  stroke-linecap="round" stroke-linejoin="round"/>',
              '</svg>',
            '</span>',
            '<span class="loading-spinner" aria-hidden="true">',
              '<svg width="18" height="18" viewBox="0 0 18 18" fill="none">',
                '<circle cx="9" cy="9" r="7" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>',
                '<path d="M9 2a7 7 0 0 1 7 7" stroke="#fff" stroke-width="2" stroke-linecap="round">',
                  '<animateTransform attributeName="transform" type="rotate"',
                  '  from="0 9 9" to="360 9 9" dur="0.7s" repeatCount="indefinite"/>',
                '</path>',
              '</svg>',
            '</span>',
          '</button>',
        '</div>',

      '</div>',
    ].join('');

    document.body.appendChild(el);
    return el;
  }

  // ─── image sizing (contain logic) ─────────────────────────────────────────

  function computeImageDisplaySize() {
    var vp = modal.querySelector('#pwm-viewport');
    var img = modal.querySelector('#pwm-image');
    if (!state.imgNatW || !state.imgNatH || !vp) return;

    var vw = vp.clientWidth;
    var vh = vp.clientHeight;
    var imgAspect = state.imgNatW / state.imgNatH;
    var vpAspect = vw / vh;

    if (imgAspect > vpAspect) {
      state.imgDispW = vw;
      state.imgDispH = vw / imgAspect;
    } else {
      state.imgDispH = vh;
      state.imgDispW = vh * imgAspect;
    }

    img.style.width  = state.imgDispW + 'px';
    img.style.height = state.imgDispH + 'px';
  }

  function applyTransform() {
    var wrapper = modal.querySelector('#pwm-image-wrapper');
    if (!wrapper) return;
    wrapper.style.transform =
      'translate(' + state.panX + 'px, ' + state.panY + 'px) scale(' + state.zoom + ')';
  }

  function clampPan() {
    if (!state.imgDispW) return;
    var maxX, maxY;
    if (state.cropW && state.cropH) {
      maxX = Math.max(0, (state.imgDispW * state.zoom - state.cropW) / 2);
      maxY = Math.max(0, (state.imgDispH * state.zoom - state.cropH) / 2);
    } else {
      var vp = modal.querySelector('#pwm-viewport');
      if (!vp) return;
      maxX = Math.max(0, (state.imgDispW * state.zoom - vp.clientWidth)  / 2);
      maxY = Math.max(0, (state.imgDispH * state.zoom - vp.clientHeight) / 2);
    }
    state.panX = clamp(state.panX, -maxX, maxX);
    state.panY = clamp(state.panY, -maxY, maxY);
  }

  // ─── crop box (always centered; image moves underneath) ───────────────────

  function updateCropBox() {
    var overlay = modal.querySelector('#pwm-crop-overlay');

    if (!state.widthCm || !state.heightCm) {
      overlay.hidden = true;
      return;
    }

    overlay.hidden = false;

    var vp = modal.querySelector('#pwm-viewport');
    var vw = vp.clientWidth;
    var vh = vp.clientHeight;
    var aspect = state.widthCm / state.heightCm;

    var cw = vw * 0.8;
    var ch = cw / aspect;
    if (ch > vh * 0.8) {
      ch = vh * 0.8;
      cw = ch * aspect;
    }

    state.cropW = cw;
    state.cropH = ch;
    state.cropX = (vw - cw) / 2;
    state.cropY = (vh - ch) / 2;

    renderCropOverlay();
  }

  function renderCropOverlay() {
    var cx = state.cropX, cy = state.cropY, cw = state.cropW, ch = state.cropH;

    modal.querySelector('#pwm-dim-top').style.cssText =
      'top:0;left:0;right:0;height:' + cy + 'px';
    modal.querySelector('#pwm-dim-bottom').style.cssText =
      'top:' + (cy + ch) + 'px;left:0;right:0;bottom:0';
    modal.querySelector('#pwm-dim-left').style.cssText =
      'top:' + cy + 'px;left:0;width:' + cx + 'px;height:' + ch + 'px';
    modal.querySelector('#pwm-dim-right').style.cssText =
      'top:' + cy + 'px;left:' + (cx + cw) + 'px;right:0;height:' + ch + 'px';
    modal.querySelector('#pwm-crop-box').style.cssText =
      'left:' + cx + 'px;top:' + cy + 'px;width:' + cw + 'px;height:' + ch + 'px';
  }

  // ─── canvas crop ──────────────────────────────────────────────────────────

  function cropToBlob() {
    var img = modal.querySelector('#pwm-image');
    var vp  = modal.querySelector('#pwm-viewport');
    var vw  = vp.clientWidth;
    var vh  = vp.clientHeight;

    var scaledW = state.imgDispW * state.zoom;
    var scaledH = state.imgDispH * state.zoom;
    var imgLeft = (vw - scaledW) / 2 + state.panX;
    var imgTop  = (vh - scaledH) / 2 + state.panY;

    var cropInDispX = (state.cropX - imgLeft) / state.zoom;
    var cropInDispY = (state.cropY - imgTop)  / state.zoom;
    var cropInDispW = state.cropW / state.zoom;
    var cropInDispH = state.cropH / state.zoom;

    var scaleX = state.imgNatW / state.imgDispW;
    var scaleY = state.imgNatH / state.imgDispH;
    var srcX = clamp(Math.round(cropInDispX * scaleX), 0, state.imgNatW);
    var srcY = clamp(Math.round(cropInDispY * scaleY), 0, state.imgNatH);
    var srcW = clamp(Math.round(cropInDispW * scaleX), 1, state.imgNatW - srcX);
    var srcH = clamp(Math.round(cropInDispH * scaleY), 1, state.imgNatH - srcY);

    var maxPx  = 1200;
    var aspect = srcW / srcH;
    var outW   = Math.round(Math.min(srcW, maxPx));
    var outH   = Math.round(outW / aspect);
    if (outH > maxPx) { outH = maxPx; outW = Math.round(outH * aspect); }

    var canvas = document.createElement('canvas');
    canvas.width  = outW;
    canvas.height = outH;
    canvas.getContext('2d').drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);

    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error('Could not generate image crop.'));
      }, 'image/jpeg', 0.88);
    });
  }

  // ─── stale-request-safe upload ────────────────────────────────────────────

  async function uploadToImgBB(blob, signal) {
    var formData = new FormData();
    formData.append('image', blob, 'wallpaper-crop.jpg');
    var res = await fetch('https://api.imgbb.com/1/upload?key=' + IMGBB_API_KEY, {
      method: 'POST',
      body: formData,
      signal: signal,
    });
    if (!res.ok) throw new Error('imgBB upload failed (' + res.status + ')');
    var data = await res.json();
    return data.data.display_url;
  }

  function blobToThumbnailDataUrl(blob) {
    return new Promise(function (resolve) {
      var tempImg = new Image();
      var objectUrl = URL.createObjectURL(blob);
      tempImg.onload = function () {
        var maxPx  = 300;
        var aspect = tempImg.width / tempImg.height;
        var tw = tempImg.width > tempImg.height ? maxPx : Math.round(maxPx * aspect);
        var th = tempImg.height >= tempImg.width ? maxPx : Math.round(maxPx / aspect);
        var canvas = document.createElement('canvas');
        canvas.width  = tw;
        canvas.height = th;
        canvas.getContext('2d').drawImage(tempImg, 0, 0, tw, th);
        URL.revokeObjectURL(objectUrl);
        canvas.toBlob(function (small) {
          var reader = new FileReader();
          reader.onload = function (e) { resolve(e.target.result); };
          reader.readAsDataURL(small);
        }, 'image/jpeg', 0.70);
      };
      tempImg.src = objectUrl;
    });
  }

  async function prepareCroppedImageValue(signal) {
    var blob = await cropToBlob();
    if (signal && signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (IMGBB_API_KEY) {
      return await uploadToImgBB(blob, signal);
    }
    return await blobToThumbnailDataUrl(blob);
  }

  // ─── add to cart ──────────────────────────────────────────────────────────

  async function addToCart() {
    var widthCm   = state.widthCm;
    var heightCm  = state.heightCm;
    var variantId = state.variantId;

    if (!widthCm || !heightCm) {
      alert('Please set width and height dimensions before adding to cart.');
      return;
    }

    // Cancel any previous in-flight request
    if (currentAbortController) currentAbortController.abort();
    currentAbortController = new AbortController();
    var signal = currentAbortController.signal;

    var btn = modal.querySelector('#pwm-next-btn');
    btn.classList.add('loading');
    btn.disabled = true;
    setDebugStatus('loading');

    try {
      var croppedImageValue = await prepareCroppedImageValue(signal);
      if (signal.aborted) return; // stale — silently drop

      var response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          id: variantId,
          quantity: 1,
          properties: {
            'Width (cm)':    widthCm,
            'Height (cm)':   heightCm,
            'Cropped Image': croppedImageValue,
          },
        }),
        signal: signal,
      });

      if (!response.ok) {
        var err = await response.json().catch(function () { return {}; });
        throw new Error(err.description || 'Could not add product to cart.');
      }

      debugRenderCount++;
      setDebugStatus('ready');
      closeModal();

      document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
      var cartRes = await fetch('/cart.js').then(function (r) { return r.json(); });
      document.dispatchEvent(
        new CustomEvent('cart:updated', { detail: { cart: cartRes }, bubbles: true })
      );

      var cartDrawer = document.querySelector('cart-drawer');
      if (cartDrawer && typeof cartDrawer.open === 'function') {
        cartDrawer.open();
      }

    } catch (e) {
      if (e.name === 'AbortError') return; // stale request — do nothing
      alert(e.message || 'An error occurred. Please try again.');
      setDebugStatus('error');
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }

  // ─── open / close ─────────────────────────────────────────────────────────

  function openModal(opts) {
    if (!modal) modal = buildModal();

    // Reset debug counters per-session
    debugRenderCount = 0;

    Object.assign(state, {
      zoom: 1, panX: 0, panY: 0,
      cropX: 0, cropY: 0, cropW: 0, cropH: 0,
      widthCm: 300, heightCm: 240,
      imgNatW: 0, imgNatH: 0, imgDispW: 0, imgDispH: 0,
      variantId: opts.variantId,
      price: opts.price || '',
      productTitle: opts.productTitle || '',
    });

    modal.querySelector('#pwm-title').textContent = state.productTitle;
    modal.querySelector('#pwm-price').textContent = state.price;

    // Reset sliders and badges
    modal.querySelector('#pwm-width').value          = 300;
    modal.querySelector('#pwm-height').value         = 240;
    modal.querySelector('#pwm-zoom-slider').value    = 1;
    modal.querySelector('#pwm-width-val').textContent  = '300 cm';
    modal.querySelector('#pwm-height-val').textContent = '240 cm';
    modal.querySelector('#pwm-crop-overlay').hidden    = true;

    setDebugStatus('idle');

    var img = modal.querySelector('#pwm-image');
    img.removeAttribute('style');
    applyTransform();

    img.src = '';
    requestAnimationFrame(function () {
      img.onload = function () {
        state.imgNatW = img.naturalWidth;
        state.imgNatH = img.naturalHeight;
        computeImageDisplaySize();
        updateCropBox();
        applyTransform();
        scheduleRender(); // initial load counts as first render
      };
      img.src = opts.imageUrl || '';
    });

    modal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    modal.querySelector('.photo-modal__close').focus();
    attachModalEvents();
  }

  function closeModal() {
    if (!modal) return;
    if (renderDebounceTimer)   clearTimeout(renderDebounceTimer);
    if (currentAbortController) currentAbortController.abort();
    modal.setAttribute('hidden', '');
    document.body.style.overflow = '';
    detachModalEvents();
  }

  // ─── events ───────────────────────────────────────────────────────────────

  var _h = {};

  function attachModalEvents() {
    detachModalEvents();

    var vp           = modal.querySelector('#pwm-viewport');
    var overlay      = modal.querySelector('.photo-modal__overlay');
    var closeBtn     = modal.querySelector('.photo-modal__close');
    var zoomSlider   = modal.querySelector('#pwm-zoom-slider');

    var widthSlider  = modal.querySelector('#pwm-width');
    var heightSlider = modal.querySelector('#pwm-height');
    var nextBtn      = modal.querySelector('#pwm-next-btn');

    _h.closeOverlay = function () { closeModal(); };
    _h.closeBtn     = function () { closeModal(); };
    _h.esc = function (e) { if (e.key === 'Escape') closeModal(); };

    // Sync gradient fill on range slider using --slider-pct CSS var
    function syncSliderFill(slider, min, max) {
      var pct = ((parseFloat(slider.value) - min) / (max - min)) * 100;
      slider.style.setProperty('--slider-pct', pct.toFixed(1) + '%');
    }

    _h.zoom = function (e) {
      state.zoom = parseFloat(e.target.value);
      syncSliderFill(zoomSlider, MIN_ZOOM, MAX_ZOOM);
      clampPan();
      applyTransform();
      scheduleRender();
    };

    _h.wheel = function (e) {
      e.preventDefault();
      state.zoom = clamp(state.zoom + (e.deltaY > 0 ? -0.15 : 0.15), MIN_ZOOM, MAX_ZOOM);
      zoomSlider.value = state.zoom;
      syncSliderFill(zoomSlider, MIN_ZOOM, MAX_ZOOM);
      clampPan();
      applyTransform();
      scheduleRender();
    };

    _h.dimChange = function () {
      state.widthCm  = parseInt(widthSlider.value,  10) || 0;
      state.heightCm = parseInt(heightSlider.value, 10) || 0;

      var wVal = modal.querySelector('#pwm-width-val');
      var hVal = modal.querySelector('#pwm-height-val');
      if (wVal) wVal.textContent = state.widthCm  + ' cm';
      if (hVal) hVal.textContent = state.heightCm + ' cm';

      syncSliderFill(widthSlider,  50, 1000);
      syncSliderFill(heightSlider, 50, 1000);

      updateCropBox();
      clampPan();
      scheduleRender();
    };

    _h.next = function () { addToCart(); };

    // ── Drag: pans the IMAGE (crop box stays fixed at center) ──

    _h.mousedown = function (e) {
      if (e.button !== 0) return;
      state.isDragging    = true;
      state.dragStartX    = e.clientX;
      state.dragStartY    = e.clientY;
      state.dragStartPanX = state.panX;
      state.dragStartPanY = state.panY;
      vp.classList.add('dragging');
      e.preventDefault();
    };

    _h.mousemove = function (e) {
      if (!state.isDragging) return;
      state.panX = state.dragStartPanX + (e.clientX - state.dragStartX);
      state.panY = state.dragStartPanY + (e.clientY - state.dragStartY);
      clampPan();
      applyTransform();
      scheduleRender();
    };

    _h.mouseup = function () {
      state.isDragging = false;
      vp.classList.remove('dragging');
    };

    // Touch
    _h.touchstart = function (e) {
      if (e.touches.length !== 1) return;
      var t = e.touches[0];
      state.isDragging    = true;
      state.dragStartX    = t.clientX;
      state.dragStartY    = t.clientY;
      state.dragStartPanX = state.panX;
      state.dragStartPanY = state.panY;
    };

    _h.touchmove = function (e) {
      if (!state.isDragging || e.touches.length !== 1) return;
      var t = e.touches[0];
      state.panX = state.dragStartPanX + (t.clientX - state.dragStartX);
      state.panY = state.dragStartPanY + (t.clientY - state.dragStartY);
      clampPan();
      applyTransform();
      scheduleRender();
      e.preventDefault();
    };

    _h.touchend = function () { state.isDragging = false; };

    overlay.addEventListener('click',      _h.closeOverlay);
    closeBtn.addEventListener('click',     _h.closeBtn);
    document.addEventListener('keydown',   _h.esc);
    zoomSlider.addEventListener('input',   _h.zoom);
    widthSlider.addEventListener('input',  _h.dimChange);
    heightSlider.addEventListener('input', _h.dimChange);
    nextBtn.addEventListener('click',      _h.next);
    vp.addEventListener('mousedown',       _h.mousedown);
    document.addEventListener('mousemove', _h.mousemove);
    document.addEventListener('mouseup',   _h.mouseup);
    vp.addEventListener('touchstart',      _h.touchstart, { passive: true });
    vp.addEventListener('touchmove',       _h.touchmove,  { passive: false });
    vp.addEventListener('touchend',        _h.touchend);
    vp.addEventListener('wheel',           _h.wheel, { passive: false });

    // Sync initial slider fills
    syncSliderFill(zoomSlider,   MIN_ZOOM, MAX_ZOOM);
    syncSliderFill(widthSlider,  50, 1000);
    syncSliderFill(heightSlider, 50, 1000);
  }

  function detachModalEvents() {
    if (!_h.closeOverlay) return;
    var vp           = modal.querySelector('#pwm-viewport');
    var overlay      = modal.querySelector('.photo-modal__overlay');
    var closeBtn     = modal.querySelector('.photo-modal__close');
    var zoomSlider   = modal.querySelector('#pwm-zoom-slider');

    var widthSlider  = modal.querySelector('#pwm-width');
    var heightSlider = modal.querySelector('#pwm-height');
    var nextBtn      = modal.querySelector('#pwm-next-btn');

    overlay.removeEventListener('click',      _h.closeOverlay);
    closeBtn.removeEventListener('click',     _h.closeBtn);
    document.removeEventListener('keydown',   _h.esc);
    zoomSlider.removeEventListener('input',   _h.zoom);
    widthSlider.removeEventListener('input',  _h.dimChange);
    heightSlider.removeEventListener('input', _h.dimChange);
    nextBtn.removeEventListener('click',      _h.next);
    vp.removeEventListener('mousedown',       _h.mousedown);
    document.removeEventListener('mousemove', _h.mousemove);
    document.removeEventListener('mouseup',   _h.mouseup);
    vp.removeEventListener('touchstart',      _h.touchstart);
    vp.removeEventListener('touchmove',       _h.touchmove);
    vp.removeEventListener('touchend',        _h.touchend);
    vp.removeEventListener('wheel',           _h.wheel);
    _h = {};
  }

  // ─── hook Add to Cart button ──────────────────────────────────────────────

  function hookButtons() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.product-form__submit[name="add"]');
      if (!btn) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      var form = btn.closest('form[data-type="add-to-cart-form"]');
      if (!form) return;

      var variantInput = form.querySelector('input.product-variant-id');
      var variantId = variantInput ? parseInt(variantInput.value, 10) : null;
      if (!variantId) return;

      var imageUrl = '';
      var selectors = [
        '.product__media-item--active img',
        '.product__main-photos .is-active img',
        '.product__media img',
        '.product__thumbnail img',
        '.product-media-container img',
      ];
      for (var i = 0; i < selectors.length; i++) {
        var found = document.querySelector(selectors[i]);
        if (found) {
          imageUrl = (found.dataset.src || found.src).replace(/(_\d+x\d+)(\.\w+)$/, '$2');
          if (imageUrl) break;
        }
      }

      var titleEl = document.querySelector('.product__title h1, .product__title');
      var productTitle = titleEl ? titleEl.textContent.trim() : document.title;

      var priceEl = document.querySelector(
        '.price__regular .price-item--regular, .price .price-item'
      );
      var price = priceEl ? priceEl.textContent.trim() : '';

      openModal({ variantId: variantId, imageUrl: imageUrl, productTitle: productTitle, price: price });
    }, true); // capture — fires before Dawn's product-form.js
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hookButtons);
  } else {
    hookButtons();
  }
})();
