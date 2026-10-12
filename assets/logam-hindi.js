/* Logam sections: gallery, cart drawer, buy now, sticky bar, reels. No dependencies. */
(function () {
  if (window.__logamHindi) return;
  window.__logamHindi = true;

  var cartAddUrl = (window.routes && window.routes.cart_add_url) || '/cart/add';

  /* ---------- Logam cart drawer (snippets/logam-book-cart.liquid) ----------
     Present only on the Logam templates. Re-rendered through the Section
     Rendering API; only the [data-hh-part] pieces are swapped so the journey
     card stays in place and Hanuman ji animates between the two states. */
  function hhEl() { return document.querySelector('[data-hh-drawer]'); }
  function hhRoot() { var o = hhEl(); return o && o.querySelector('[data-hh-root]'); }
  var hhLastFocus = null;

  function hhOpen() {
    var o = hhEl(), root = hhRoot();
    if (!o || !root || !o.hidden) return;
    hhLastFocus = document.activeElement;
    o.hidden = false;
    document.documentElement.classList.add('hh-lock');
    root.classList.remove('hh-play'); void root.offsetWidth; root.classList.add('hh-play');
    var c = root.querySelector('.hh-x');
    if (c) c.focus({ preventScroll: true });
  }
  function hhClose() {
    var o = hhEl();
    document.documentElement.classList.remove('hh-lock');
    if (!o || o.hidden) return;
    o.hidden = true;
    if (hhLastFocus && hhLastFocus.focus) hhLastFocus.focus({ preventScroll: true });
  }
  function hhError(msg) {
    var root = hhRoot(), el = root && root.querySelector('[data-hh-err]');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(hhError.t);
    hhError.t = setTimeout(function () { el.hidden = true; }, 5000);
  }
  // Unlock buttons on the page follow the cart: "added" while the product is in it
  function hhSyncButtons(ids) {
    document.querySelectorAll('[data-lh-upsell][data-lh-done]').forEach(function (b) {
      var inCart = ids.indexOf(String(b.dataset.lhUpsell)) > -1;
      if (!b.dataset.lhLabel) b.dataset.lhLabel = b.textContent;
      b.textContent = inCart ? b.dataset.lhDone : b.dataset.lhLabel;
      b.disabled = inCart;
      b.classList.toggle('is-done', inCart);
    });
  }
  function hhApply(sections) {
    var o = hhEl(), root = hhRoot();
    if (!o || !root || !sections || !sections[o.dataset.section]) return false;
    var fresh = new DOMParser().parseFromString(sections[o.dataset.section], 'text/html').querySelector('[data-hh-root]');
    if (!fresh) return false;
    root.querySelectorAll('[data-hh-part]').forEach(function (part) {
      var next = fresh.querySelector('[data-hh-part="' + part.dataset.hhPart + '"]');
      if (next) part.innerHTML = next.innerHTML;
    });
    root.classList.toggle('is-added', fresh.classList.contains('is-added'));
    root.classList.toggle('is-empty', fresh.classList.contains('is-empty'));
    root.dataset.variants = fresh.dataset.variants || '';
    // header cart badge (the theme's <ap-cartcount> listens for cart:updated)
    document.documentElement.dispatchEvent(new CustomEvent('cart:updated', {
      bubbles: true,
      detail: { cart: { item_count: parseInt(fresh.dataset.count, 10) || 0, total_price: parseInt(fresh.dataset.total, 10) || 0 } }
    }));
    hhSyncButtons((fresh.dataset.variants || '').split(','));
    return true;
  }
  function hhRefresh() {
    var o = hhEl();
    if (!o) return Promise.resolve();
    return fetch(location.pathname + '?sections=' + encodeURIComponent(o.dataset.section))
      .then(function (r) { return r.json(); })
      .then(hhApply)
      .catch(function () {});
  }
  function hhChange(key, quantity) {
    var o = hhEl(), root = hhRoot();
    root.classList.add('is-busy');
    return fetch((window.routes && window.routes.cart_change_url) || '/cart/change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id: key, quantity: quantity, sections: o.dataset.section, sections_url: location.pathname })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.status) { hhError(res.description || res.message); return; }
        if (!hhApply(res.sections)) return hhRefresh();
      })
      .catch(hhRefresh)
      .finally(function () { root.classList.remove('is-busy'); });
  }

  // AJAX add. On Logam pages the Logam cart drawer opens; elsewhere the
  // theme's cart notification/drawer is used, as in assets/product-form.js.
  function addToCart(formData, btn, errorEl) {
    var hh = hhEl();
    var root = hh && hhRoot();
    var cart = hh ? null : (document.querySelector('ap-cartnotification') || document.querySelector('ap-cartdrawer'));
    if (hh) {
      formData.append('sections', hh.dataset.section);
      formData.append('sections_url', location.pathname);
      if (!hh.hidden) root.classList.add('is-busy');
    } else if (cart && cart.getSectionsToRender) {
      formData.append('sections', cart.getSectionsToRender().map(function (s) { return s.id; }));
      formData.append('sections_url', location.pathname);
      if (cart.setActiveElement) cart.setActiveElement(document.activeElement);
    }
    if (errorEl) errorEl.hidden = true;
    if (btn) {
      btn.classList.add('is-loading');
      // the theme's <button is="loader-button"> shows its spinner on this attribute
      if (btn.dataset.hhTheme) btn.setAttribute('ap-ariabusy', 'true');
    }
    return fetch(cartAddUrl, { method: 'POST', body: formData, headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/javascript' } })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.status) {
          var msg = res.description || res.message;
          if (errorEl) { errorEl.textContent = msg; errorEl.hidden = false; }
          else if (hh && (!hh.hidden || !btn || btn.dataset.hhTheme)) { hhOpen(); hhError(msg); }
          else if (btn) {
            var label = btn.textContent;
            btn.textContent = msg;
            setTimeout(function () { btn.textContent = label; }, 3000);
          }
          return false;
        }
        if (hh) {
          if (!hhApply(res.sections)) hhRefresh();
          hhOpen();
          return true;
        }
        if (!cart || !cart.renderContents) { location.href = (window.routes && window.routes.cart_url) || '/cart'; return true; }
        cart.renderContents(res);
        cart.classList.remove('is-empty');
        return true;
      })
      .catch(function () { location.href = (window.routes && window.routes.cart_url) || '/cart'; })
      .finally(function () {
        if (btn) {
          btn.classList.remove('is-loading');
          if (btn.dataset.hhTheme) btn.removeAttribute('ap-ariabusy');
        }
        if (root) root.classList.remove('is-busy');
      });
  }

  // Whole site: every product form's "Add to cart" opens the Logam drawer.
  // Capture phase runs before the theme's own form handlers, which then never
  // fire (no theme mini cart / popup). Logam forms have their own handler;
  // Buy now forms (return_to /checkout) and the cart page are left alone.
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!hhEl() || !form || !form.matches || !form.matches('form[action*="/cart/add"]')) return;
    if (form.matches('[data-lh-form]')) return;
    var back = form.querySelector('[name="return_to"]');
    if ((back && /checkout/.test(back.value)) || /return_to=[^&]*checkout/.test(form.getAttribute('action') || '')) return;
    if (form.checkValidity && !form.checkValidity()) return;
    e.preventDefault();
    e.stopPropagation();
    var btn = e.submitter || form.querySelector('[type="submit"]');
    if (btn) btn.dataset.hhTheme = '1';
    var fd = new FormData(form);
    // the theme's option pickers post option1-3; Shopify only needs the variant id
    ['option1', 'option2', 'option3'].forEach(function (k) { fd.delete(k); });
    addToCart(fd, btn, null);
  }, true);

  // Drawer clicks (delegated: its contents are re-rendered) + header cart icon
  document.addEventListener('click', function (e) {
    var t = e.target, o = hhEl();
    if (!o || !t || !t.closest) return;
    if (!o.contains(t)) {
      // the header cart icon opens this drawer instead of the theme's mini cart
      if (t.closest('a[href$="/cart"], [ap-controlsaria="mini-cart"]')) {
        e.preventDefault();
        e.stopPropagation();
        hhOpen();
        hhRefresh();
      }
      return;
    }
    if (t.closest('[data-hh-close]')) { hhClose(); return; }
    var add = t.closest('[data-hh-add]');
    if (add) {
      var fd = new FormData();
      fd.append('id', add.dataset.hhAdd);
      fd.append('quantity', 1);
      addToCart(fd, add, null);
      return;
    }
    var line = t.closest('[data-hh-key]');
    if (line) hhChange(line.dataset.hhKey, parseInt(line.dataset.hhQ, 10) || 0);
  }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hhClose(); });
  // The drawer opens only on Add to cart / the cart icon (also in the theme editor).
  // If the editor re-renders it while open (settings changed), keep it open.
  function hhOwns(e) { return e.target && e.target.querySelector && e.target.querySelector('[data-hh-drawer]'); }
  document.addEventListener('shopify:section:load', function (e) {
    if (hhOwns(e) && document.documentElement.classList.contains('hh-lock')) {
      document.documentElement.classList.remove('hh-lock');
      hhOpen();
    }
  });

  function initMain(root) {
    if (root.dataset.lhReady) return;
    root.dataset.lhReady = '1';
    var form = root.querySelector('[data-lh-form]');
    var idInput = form && form.querySelector('[name="id"]');
    var qty = root.querySelector('[data-lh-qty]');
    var errorEl = root.querySelector('[data-lh-error]');

    /* gallery */
    var track = root.querySelector('[data-lh-track]');
    var count = root.querySelector('[data-lh-count]');
    var thumbs = root.querySelectorAll('[data-lh-thumb]');
    function goTo(i) { if (track) track.scrollTo({ left: track.clientWidth * i, behavior: 'smooth' }); }
    if (track) {
      var total = track.children.length, raf;
      track.addEventListener('scroll', function () {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          var i = Math.round(track.scrollLeft / track.clientWidth);
          if (count) count.textContent = (i + 1) + ' / ' + total;
          thumbs.forEach(function (t, n) { t.classList.toggle('is-active', n === i); });
        });
      }, { passive: true });
      thumbs.forEach(function (t, n) { t.addEventListener('click', function () { goTo(n); }); });
    }

    /* quantity: digits only, never below 1 */
    if (qty) {
      qty.addEventListener('input', function () { qty.value = qty.value.replace(/\D/g, ''); });
      qty.addEventListener('blur', function () { qty.value = Math.max(1, parseInt(qty.value, 10) || 1); });
    }
    root.querySelectorAll('[data-lh-step]').forEach(function (b) {
      b.addEventListener('click', function () {
        qty.value = Math.max(1, (parseInt(qty.value, 10) || 1) + Number(b.dataset.lhStep));
      });
    });

    /* variant select (only rendered when the product has variants) */
    var variantSel = root.querySelector('[data-lh-variant]');
    var variants = [];
    try { variants = JSON.parse(root.querySelector('[data-lh-variants]').textContent); } catch (e) {}
    function money(c) {
      var fmt = root.dataset.moneyFormat || '₹{{amount_no_decimals}}';
      var n = (c / 100).toLocaleString('en-IN', { maximumFractionDigits: c % 100 ? 2 : 0 });
      return fmt.replace(/\{\{\s*\w+\s*\}\}/, n).replace(/Rs\.\s?/, '₹');
    }
    if (variantSel) variantSel.addEventListener('change', function () {
      var v = variants.find(function (x) { return String(x.id) === variantSel.value; });
      if (!v) return;
      idInput.value = v.id;
      root.querySelectorAll('[data-lh-price]').forEach(function (el) { el.textContent = money(v.price); });
      root.querySelectorAll('[data-lh-was]').forEach(function (el) {
        el.hidden = !(v.compare_at_price > v.price);
        el.textContent = money(v.compare_at_price || 0);
      });
      root.querySelectorAll('[data-lh-buy], [data-lh-add]').forEach(function (b) { b.disabled = !v.available; });
      if (v.featured_media) {
        var idx = Array.prototype.findIndex.call(track.children, function (s) { return s.dataset.mediaId == v.featured_media.id; });
        if (idx > -1) goTo(idx);
      }
    });

    /* add to cart */
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      addToCart(new FormData(form), form.querySelector('[data-lh-add]'), errorEl);
    });

    /* buy now: the main button has Shopify's Buy-now class, so Razorpay Magic Checkout
       (a document click listener) takes it and stops the event. A click nothing took
       reaches window: fall back to the cart permalink. The sticky bar presses the main button. */
    var mainBuy = form && form.querySelector('[data-lh-buy]');
    function buyPermalink(b) {
      b.classList.add('is-loading');
      location.href = '/cart/' + idInput.value + ':' + (parseInt(qty.value, 10) || 1);
    }
    root.querySelectorAll('[data-lh-buy]').forEach(function (b) {
      if (b !== mainBuy) b.addEventListener('click', function () { mainBuy ? mainBuy.click() : buyPermalink(b); });
    });
    if (mainBuy) window.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-lh-buy]') === mainBuy) buyPermalink(mainBuy);
    });

    /* sticky bar: visible once the main buttons scroll away */
    var sticky = root.querySelector('[data-lh-sticky]');
    var anchor = root.querySelector('[data-lh-buy-area]');
    if (sticky && anchor && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        var gone = !en[0].isIntersecting && en[0].boundingClientRect.top < 0;
        sticky.classList.toggle('is-visible', gone);
      }).observe(anchor);
    }
  }

  function initUpsell(root) {
    root.querySelectorAll('[data-lh-upsell]').forEach(function (b) {
      if (b.dataset.lhReady) return;
      b.dataset.lhReady = '1';
      b.addEventListener('click', function () {
        var fd = new FormData();
        fd.append('id', b.dataset.lhUpsell);
        fd.append('quantity', 1);
        addToCart(fd, b, null).then(function (ok) {
          // Unlock buttons add once, then confirm (like the design)
          if (!ok || !b.dataset.lhDone) return;
          b.textContent = b.dataset.lhDone;
          b.disabled = true;
          b.classList.add('is-done');
        });
      });
    });
  }

  /* reels: video loads only on tap; one plays at a time */
  function initReels(root) {
    root.querySelectorAll('[data-lh-reel]').forEach(function (reel) {
      if (reel.dataset.lhReady) return;
      reel.dataset.lhReady = '1';
      var btn = reel.querySelector('.lh-reel__play');
      var tpl = reel.querySelector('template');
      if (!btn || !tpl) return;
      btn.addEventListener('click', function () {
        document.querySelectorAll('[data-lh-reel] video').forEach(function (v) { v.pause(); });
        var video = reel.querySelector('video');
        if (!video) {
          reel.querySelectorAll(':scope > img, :scope > svg').forEach(function (n) { n.remove(); });
          reel.insertBefore(tpl.content.firstElementChild.cloneNode(true), reel.firstChild);
          video = reel.querySelector('video');
          video.addEventListener('pause', function () { reel.classList.remove('is-playing'); });
          video.addEventListener('play', function () { reel.classList.add('is-playing'); });
        }
        video.play().catch(function () {});
        // 128px cards are too small to watch: go full screen on phones.
        if (window.innerWidth < 750) {
          if (video.requestFullscreen) video.requestFullscreen().catch(function () {});
          else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
        }
      });
    });
  }

  function init(scope) {
    scope = scope || document;
    scope.querySelectorAll('[data-lh-main]').forEach(initMain);
    initUpsell(scope);
    initReels(scope);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
  else init();
  document.addEventListener('shopify:section:load', function (e) { init(e.target); });
})();
