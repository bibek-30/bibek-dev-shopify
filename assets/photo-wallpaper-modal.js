/**
 * Photo Wallpaper Configurator Modal
 * - Opens fullscreen on "Add to Cart" click
 * - Width / Height sliders directly resize the image preview
 * - Padding slider adds real white matte space between photo and frame border
 * - No zoom, no drag — simple static preview
 * - Debounced "final render" fires ~600ms after user stops interacting
 * - On confirm: uploads to imgBB (or falls back to base64 thumbnail),
 *   stored as a line-item property.
 */

(function () {
  'use strict';

  // ── Configuration ─────────────────────────────────────────────────────────
  var IMGBB_API_KEY = 'bf4f91c9d10fb4be1e9c1f88d07a91d0';

  var MODAL_ID = 'photo-wallpaper-modal';
  var modal    = null;

  var state = {
    imgNatW: 0, imgNatH: 0,
    imgDispW: 0, imgDispH: 0,
    widthCm: 300, heightCm: 240,
    paddingPx: 0,
    variantId: null, price: '', productTitle: '',
  };

  // ── Debug / debounce state ─────────────────────────────────────────────────
  var debugRenderCount    = 0;
  var renderDebounceTimer = null;
  var currentAbortController = null;

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

  function updateDebugUrl() {
    if (!modal) return;
    var urlRow  = modal.querySelector('#pwm-debug-url');
    var urlText = modal.querySelector('#pwm-debug-url-text');
    if (!urlRow || !urlText) return;

    urlText.textContent =
      'https://image-service.com/render' +
      '?width='  + (state.widthCm  || 0) +
      '&height=' + (state.heightCm || 0) +
      '&pad='    + (state.paddingPx || 0);

    urlRow.hidden = false;
  }

  // ─── Debounced "final render" (600 ms) ────────────────────────────────────

  function scheduleRender() {
    setDebugStatus('loading');
    if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
    renderDebounceTimer = setTimeout(function () {
      debugRenderCount++;
      setDebugStatus('ready');
      updateDebugUrl();
    }, 600);
  }

  // ─── Frame matte (padding) ────────────────────────────────────────────────

  // Padding is real CSS padding on #pwm-image-wrapper, creating visible space
  // between the photo and the frame border. Background fills the matte area.
  function applyFrameMatte() {
    if (!modal) return;
    var wrapper  = modal.querySelector('#pwm-image-wrapper');
    var badgeEl  = modal.querySelector('#pwm-pad-val');
    var sliderEl = modal.querySelector('#pwm-pad-slider');
    var p = state.paddingPx;

    if (wrapper) {
      wrapper.style.padding = p + 'px';
    }
    if (badgeEl) badgeEl.textContent = p + ' px';
    if (sliderEl) {
      var pct = (p / parseFloat(sliderEl.max)) * 100;
      sliderEl.style.setProperty('--slider-pct', pct.toFixed(1) + '%');
    }
  }

  // ─── Build modal HTML ──────────────────────────────────────────────────────

  function buildModal() {
    var el = document.createElement('div');
    el.id  = MODAL_ID;
    el.className = 'photo-modal';
    el.setAttribute('hidden', '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Wallpaper configurator');

    el.innerHTML = [
      '<div class="photo-modal__overlay" aria-hidden="true"></div>',
      '<div class="photo-modal__container">',

        // ── Header ────────────────────────────────────────────────────────
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

        // ── Body ──────────────────────────────────────────────────────────
        '<div class="photo-modal__body">',

          // ── Left: image ───────────────────────────────────────────────
          '<div class="photo-modal__image-side">',
            '<div class="photo-modal__image-viewport" id="pwm-viewport">',

              // Frame wrapper: border = frame, padding = matte, contains image
              '<div class="photo-modal__image-wrapper" id="pwm-image-wrapper" hidden>',
                '<img class="photo-modal__image" id="pwm-image" src="" alt=""',
                '  crossorigin="anonymous" draggable="false">',
              '</div>',

            '</div>',
          '</div>',

          // ── Right: info panel ────────────────────────────────────────────
          '<div class="photo-modal__info-side">',
            '<h2 class="photo-modal__product-title" id="pwm-title"></h2>',

            '<p class="photo-modal__description">',
              'We produce your wallpaper to measure. Use the sliders below to set',
              ' your wall size and matte padding.',
            '</p>',

            // Dimension + Padding sliders
            '<div class="photo-modal__dimensions-group">',
              '<p class="photo-modal__section-label">Frame configuration</p>',

              // Width
              '<div class="photo-modal__field">',
                '<div class="photo-modal__field-label-row">',
                  '<span class="photo-modal__field-label">Width</span>',
                  '<span class="photo-modal__dim-badge" id="pwm-width-val">300 cm</span>',
                '</div>',
                '<input type="range" id="pwm-width" class="photo-modal__dim-slider"',
                '  min="300" max="1000" step="10" value="300">',
                '<div class="photo-modal__slider-range-row">',
                  '<span>300 cm</span><span>1000 cm</span>',
                '</div>',
              '</div>',

              // Height
              '<div class="photo-modal__field">',
                '<div class="photo-modal__field-label-row">',
                  '<span class="photo-modal__field-label">Height</span>',
                  '<span class="photo-modal__dim-badge" id="pwm-height-val">300 cm</span>',
                '</div>',
                '<input type="range" id="pwm-height" class="photo-modal__dim-slider"',
                '  min="300" max="1000" step="10" value="300">',
                '<div class="photo-modal__slider-range-row">',
                  '<span>300 cm</span><span>1000 cm</span>',
                '</div>',
              '</div>',

              // Padding (matte)
              '<div class="photo-modal__field">',
                '<div class="photo-modal__field-label-row">',
                  '<span class="photo-modal__field-label">Padding</span>',
                  '<span class="photo-modal__dim-badge photo-modal__dim-badge--pad" id="pwm-pad-val">0 px</span>',
                '</div>',
                '<input type="range" id="pwm-pad-slider"',
                '  class="photo-modal__dim-slider photo-modal__dim-slider--pad"',
                '  min="0" max="100" step="2" value="0">',
                '<div class="photo-modal__slider-range-row">',
                  '<span>0 px</span><span>100 px</span>',
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
              '<div class="photo-modal__debug-row">',
                '<span class="photo-modal__debug-label">Debug</span>',
                '<span class="photo-modal__debug-item" id="pwm-debug-count">Renders: 0</span>',
                '<span class="photo-modal__debug-status pwm-debug-idle" id="pwm-debug-status">● idle</span>',
              '</div>',
              '<div class="photo-modal__debug-url" id="pwm-debug-url" hidden>',
                '<span class="photo-modal__debug-url-arrow">&#x21B3;</span>',
                '<code class="photo-modal__debug-url-text" id="pwm-debug-url-text"></code>',
              '</div>',
            '</div>',

          '</div>',

        '</div>',

        // ── Footer ────────────────────────────────────────────────────────
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

  // ─── Image sizing ──────────────────────────────────────────────────────────

  // Sizes the image to exactly the pixel values from the sliders.
  // If the values exceed the viewport, both are scaled down proportionally.
  function computeImageDisplaySize() {
    var vp  = modal.querySelector('#pwm-viewport');
    var img = modal.querySelector('#pwm-image');
    if (!state.imgNatW || !state.imgNatH || !vp) return;

    var frameBorder = 16; // matches CSS border-width
    var pad = state.paddingPx;
    var margin = 48;
    var maxW = Math.max(vp.clientWidth  - margin - (frameBorder + pad) * 2, 80);
    var maxH = Math.max(vp.clientHeight - margin - (frameBorder + pad) * 2, 80);

    // Use literal pixel values from sliders
    var w = state.widthCm;
    var h = state.heightCm;

    // Scale down proportionally only if they exceed the viewport
    if (w > maxW || h > maxH) {
      var scale = Math.min(maxW / w, maxH / h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    state.imgDispW = w;
    state.imgDispH = h;

    img.style.width  = w + 'px';
    img.style.height = h + 'px';
    img.style.display = 'block';

    var wrapper = modal.querySelector('#pwm-image-wrapper');
    if (wrapper) wrapper.removeAttribute('hidden');
  }

  // ─── Canvas export ────────────────────────────────────────────────────────

  function cropToBlob() {
    var img = modal.querySelector('#pwm-image');
    var wallAspect = (state.widthCm || state.imgNatW) / (state.heightCm || state.imgNatH);
    var outW = Math.min(state.imgNatW, 1200);
    var outH = Math.round(outW / wallAspect);
    if (outH > 1200) { outH = 1200; outW = Math.round(outH * wallAspect); }

    var canvas = document.createElement('canvas');
    canvas.width  = outW;
    canvas.height = outH;
    canvas.getContext('2d').drawImage(img, 0, 0, outW, outH);

    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error('Could not generate image.'));
      }, 'image/jpeg', 0.88);
    });
  }

  // ─── Stale-request-safe upload ────────────────────────────────────────────

  async function uploadToImgBB(blob, signal) {
    var fd = new FormData();
    fd.append('image', blob, 'wallpaper-crop.jpg');
    var res = await fetch('https://api.imgbb.com/1/upload?key=' + IMGBB_API_KEY, {
      method: 'POST', body: fd, signal: signal,
    });
    if (!res.ok) throw new Error('imgBB upload failed (' + res.status + ')');
    return (await res.json()).data.display_url;
  }

  function blobToThumbnailDataUrl(blob) {
    return new Promise(function (resolve) {
      var tempImg   = new Image();
      var objectUrl = URL.createObjectURL(blob);
      tempImg.onload = function () {
        var maxPx  = 300;
        var aspect = tempImg.width / tempImg.height;
        var tw = tempImg.width > tempImg.height ? maxPx : Math.round(maxPx * aspect);
        var th = tempImg.height >= tempImg.width ? maxPx : Math.round(maxPx / aspect);
        var canvas = document.createElement('canvas');
        canvas.width = tw; canvas.height = th;
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
    if (IMGBB_API_KEY) return await uploadToImgBB(blob, signal);
    return await blobToThumbnailDataUrl(blob);
  }

  // ─── Add to cart ──────────────────────────────────────────────────────────

  async function addToCart() {
    var widthCm   = state.widthCm;
    var heightCm  = state.heightCm;
    var variantId = state.variantId;

    if (!widthCm || !heightCm) {
      alert('Please set width and height dimensions before adding to cart.');
      return;
    }

    if (currentAbortController) currentAbortController.abort();
    currentAbortController = new AbortController();
    var signal = currentAbortController.signal;

    var btn = modal.querySelector('#pwm-next-btn');
    btn.classList.add('loading');
    btn.disabled = true;
    setDebugStatus('loading');

    try {
      var croppedImageValue = await prepareCroppedImageValue(signal);
      if (signal.aborted) return;

      var response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          id: variantId,
          quantity: 1,
          properties: {
            'Width (cm)':    widthCm,
            'Height (cm)':   heightCm,
            'Padding (px)':  state.paddingPx,
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
      if (cartDrawer && typeof cartDrawer.open === 'function') cartDrawer.open();

    } catch (e) {
      if (e.name === 'AbortError') return;
      alert(e.message || 'An error occurred. Please try again.');
      setDebugStatus('error');
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }

  // ─── Open / close ──────────────────────────────────────────────────────────

  function openModal(opts) {
    if (!modal) modal = buildModal();

    debugRenderCount = 0;

    Object.assign(state, {
      widthCm: 300, heightCm: 240, paddingPx: 0,
      imgNatW: 0, imgNatH: 0, imgDispW: 0, imgDispH: 0,
      variantId: opts.variantId,
      price: opts.price || '',
      productTitle: opts.productTitle || '',
    });

    modal.querySelector('#pwm-title').textContent = state.productTitle;
    modal.querySelector('#pwm-price').textContent = state.price;

    modal.querySelector('#pwm-width').value         = 300;
    modal.querySelector('#pwm-height').value        = 240;
    modal.querySelector('#pwm-pad-slider').value    = 0;
    modal.querySelector('#pwm-width-val').textContent  = '300 cm';
    modal.querySelector('#pwm-height-val').textContent = '240 cm';
    modal.querySelector('#pwm-pad-val').textContent    = '0 px';
    modal.querySelector('#pwm-debug-url').hidden       = true;
    modal.querySelector('#pwm-image-wrapper').setAttribute('hidden', '');

    setDebugStatus('idle');
    applyFrameMatte();

    var img = modal.querySelector('#pwm-image');
    img.removeAttribute('style');
    img.src = '';

    requestAnimationFrame(function () {
      img.onload = function () {
        state.imgNatW = img.naturalWidth;
        state.imgNatH = img.naturalHeight;
        computeImageDisplaySize();
        applyFrameMatte();
        scheduleRender();
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
    if (renderDebounceTimer)    clearTimeout(renderDebounceTimer);
    if (currentAbortController) currentAbortController.abort();
    modal.setAttribute('hidden', '');
    document.body.style.overflow = '';
    detachModalEvents();
  }

  // ─── Events ────────────────────────────────────────────────────────────────

  var _h = {};

  function attachModalEvents() {
    detachModalEvents();

    var overlay      = modal.querySelector('.photo-modal__overlay');
    var closeBtn     = modal.querySelector('.photo-modal__close');
    var padSlider    = modal.querySelector('#pwm-pad-slider');
    var widthSlider  = modal.querySelector('#pwm-width');
    var heightSlider = modal.querySelector('#pwm-height');
    var nextBtn      = modal.querySelector('#pwm-next-btn');

    _h.closeOverlay = function () { closeModal(); };
    _h.closeBtn     = function () { closeModal(); };
    _h.esc = function (e) { if (e.key === 'Escape') closeModal(); };

    function syncFill(slider, min, max) {
      var pct = ((parseFloat(slider.value) - min) / (max - min)) * 100;
      slider.style.setProperty('--slider-pct', pct.toFixed(1) + '%');
    }

    _h.pad = function (e) {
      state.paddingPx = parseInt(e.target.value, 10) || 0;
      applyFrameMatte();
      computeImageDisplaySize(); // recompute image size to account for new padding space
      scheduleRender();
    };

    _h.dimChange = function () {
      state.widthCm  = parseInt(widthSlider.value,  10) || 0;
      state.heightCm = parseInt(heightSlider.value, 10) || 0;

      var wVal = modal.querySelector('#pwm-width-val');
      var hVal = modal.querySelector('#pwm-height-val');
      if (wVal) wVal.textContent = state.widthCm  + ' cm';
      if (hVal) hVal.textContent = state.heightCm + ' cm';

      syncFill(widthSlider,  50, 1000);
      syncFill(heightSlider, 50, 1000);

      computeImageDisplaySize();
      scheduleRender();
    };

    _h.next = function () { addToCart(); };

    overlay.addEventListener('click',      _h.closeOverlay);
    closeBtn.addEventListener('click',     _h.closeBtn);
    document.addEventListener('keydown',   _h.esc);
    padSlider.addEventListener('input',    _h.pad);
    widthSlider.addEventListener('input',  _h.dimChange);
    heightSlider.addEventListener('input', _h.dimChange);
    nextBtn.addEventListener('click',      _h.next);

    // Sync initial gradient fills
    syncFill(widthSlider,  50, 1000);
    syncFill(heightSlider, 50, 1000);
    syncFill(padSlider,    0,  100);
  }

  function detachModalEvents() {
    if (!_h.closeOverlay) return;
    var overlay      = modal.querySelector('.photo-modal__overlay');
    var closeBtn     = modal.querySelector('.photo-modal__close');
    var padSlider    = modal.querySelector('#pwm-pad-slider');
    var widthSlider  = modal.querySelector('#pwm-width');
    var heightSlider = modal.querySelector('#pwm-height');
    var nextBtn      = modal.querySelector('#pwm-next-btn');

    overlay.removeEventListener('click',      _h.closeOverlay);
    closeBtn.removeEventListener('click',     _h.closeBtn);
    document.removeEventListener('keydown',   _h.esc);
    padSlider.removeEventListener('input',    _h.pad);
    widthSlider.removeEventListener('input',  _h.dimChange);
    heightSlider.removeEventListener('input', _h.dimChange);
    nextBtn.removeEventListener('click',      _h.next);
    _h = {};
  }

  // ─── Hook Add to Cart button ───────────────────────────────────────────────

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

      openModal({ variantId, imageUrl, productTitle, price });
    }, true); // capture — fires before Dawn's product-form.js
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hookButtons);
  } else {
    hookButtons();
  }
})();
