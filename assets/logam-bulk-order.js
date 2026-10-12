/* Logam-Bulk Order form (sections/logam-bulk-order.liquid). No dependencies.
   Price tiers + quantity, language, live back cover, logo upload, validation, then:
   1. the details, the logo file and the visitor's source (UTM) go to the Google Sheet webhook,
   2. the order goes into the real cart with line item properties, and the cart drawer opens
      (its checkout button is the standard one, so Razorpay Magic Checkout takes over).
   Without a product the form only sends the details to the sheet and shows a thank-you note. */
(function () {
  if (window.__lbOrder) return;
  window.__lbOrder = true;

  var ROOT = (window.Shopify && Shopify.routes && Shopify.routes.root) || '/';
  var active = null; // the form whose drawer answers the header cart icon

  function num(n) { return Math.round(n).toLocaleString('en-IN'); }
  function inr(n) { return '₹' + num(n); }
  function fill(tpl, map) { return String(tpl || '').replace(/\[(\w+)\]/g, function (m, k) { return k in map ? map[k] : m; }); }
  function smooth() { return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'; }
  function phoneDigits(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
    if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
    return d;
  }
  function json(r) { return r.json(); }
  function cartPost(path, body) {
    return fetch(ROOT + path, {
      method: 'POST', body: body,
      headers: body instanceof FormData ? { Accept: 'application/json' } : { 'Content-Type': 'application/json', Accept: 'application/json' }
    }).then(json).then(function (res) {
      if (res && res.status && res.description) throw new Error(res.description);
      return res;
    });
  }
  function getCart() { return fetch(ROOT + 'cart.js', { headers: { Accept: 'application/json' } }).then(json); }

  function init(root) {
    if (!root || root.dataset.lbReady) return;
    root.dataset.lbReady = '1';
    var cfg;
    try { cfg = JSON.parse(root.querySelector('[data-lb-config]').textContent); } catch (e) { return; }
    var sectionId = root.dataset.section;
    var $ = function (s) { return root.querySelector(s); };
    var $$ = function (s) { return Array.prototype.slice.call(root.querySelectorAll(s)); };
    var tiers = (cfg.tiers || []).filter(function (t) { return t.min > 0; }).sort(function (a, b) { return a.min - b.min; });
    var MIN = tiers.length ? tiers[0].min : 1;
    var st = { qty: MIN, lang: cfg.langs[0] || { code: 'en', value: 'English', label: 'English', chalisa: '' }, logo: null, later: false };

    /* ---------- prices ---------- */
    function tierIdx(q) { var k = 0; tiers.forEach(function (t, i) { if (q >= t.min) k = i; }); return k; }
    function calc(q) {
      var k = tierIdx(q), unit = tiers.length ? tiers[k].price : 0, total = q * unit, now = Math.round(total * cfg.advance / 100);
      return { k: k, unit: unit, total: total, now: now, rest: total - now, next: tiers[k + 1] };
    }
    // Bulk variant for q books: the one named like the pack ("120", "500 books"), else by tier position.
    // A variant priced like the whole pack is added once; a per-book variant q times.
    function bulkItem(q) {
      var vs = cfg.bulkVariants, k = tierIdx(q);
      var v = vs.filter(function (x) { return parseInt(String(x.title).replace(/\D/g, ''), 10) === q; })[0] || vs[k] || vs[0];
      var pack = tiers[k] && v.price > tiers[k].price * 100 * 2;
      return { id: v.id, qty: pack ? 1 : q };
    }
    function demoAmount() { return parseFloat(String(cfg.demoPrice || '').replace(/[^\d.]/g, '')) || 0; }

    function renderPrice() {
      if (cfg.mode !== 'bulk' || !tiers.length) return;
      var c = calc(st.qty);
      var vals = { unit: String(c.unit), qty: num(st.qty), total: inr(c.total), now: inr(c.now), rest: inr(c.rest), half: inr(c.now) };
      document.querySelectorAll('[data-lb-bind]').forEach(function (el) { var v = vals[el.dataset.lbBind]; if (v != null) el.textContent = v; });
      $$('[data-lb-tier]').forEach(function (b) { var on = +b.dataset.lbTier === tiers[c.k].min; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on); });
      $$('[data-lb-set]').forEach(function (b) { var on = +b.dataset.lbSet === st.qty; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on); });
      var chip = $('[data-lb-nudge-chip]'), txt = $('[data-lb-nudge-text]'), jump = $('[data-lb-jump]');
      if (!chip) return;
      if (c.next) {
        chip.textContent = '₹' + c.next.price;
        txt.innerHTML = fill(cfg.t.nudge, { n: num(c.next.min - st.qty), price: c.next.price });
        jump.hidden = false;
        jump.textContent = fill(cfg.t.jump, { qty: num(c.next.min) });
      } else {
        chip.textContent = '₹' + c.unit;
        txt.innerHTML = fill(cfg.t.max, { price: c.unit });
        jump.hidden = true;
      }
    }
    function setQty(n) { st.qty = Math.max(MIN, Math.round(n) || MIN); renderPrice(); }

    /* ---------- back cover preview ---------- */
    var coverWrap = $('[data-lb-cover-main]');
    var cover = coverWrap && coverWrap.querySelector('[data-lb-cover]');
    function val(k) { var f = $('[data-lb-f="' + k + '"]'); return f ? f.value.trim() : ''; }
    function renderPreview() {
      if (!cover) return;
      var pv = function (k) { return cover.querySelector('[data-lb-pv="' + k + '"]'); };
      var brand = val('brand'), slogan = val('slogan'), hasImg = !!(st.logo && !st.logo.pdf);
      if (hasImg) pv('logo').src = st.logo.url;
      pv('logo').hidden = !hasImg;
      pv('box').hidden = hasImg;
      pv('boxText').textContent = st.logo && st.logo.pdf ? fill(cfg.t.pdfLogo, { brand: brand || cfg.pv.brand }) : (brand || cfg.pv.brand);
      pv('brandLine').hidden = !(hasImg && brand);
      pv('brandLine').textContent = brand;
      pv('chalisa').textContent = st.lang.chalisa;
      pv('chalisa').setAttribute('lang', st.lang.code);
      pv('slogan').textContent = slogan || cfg.pv.slogan;
      pv('slogan').classList.toggle('is-empty', !slogan);
      pv('phone').textContent = val('phone') || cfg.pv.phone;
      pv('address').textContent = val('address') || cfg.pv.address;
    }
    // Desktop: the preview moves next to the summary so it stays in view while typing.
    var wide = matchMedia('(min-width: 990px)');
    function placeCover() {
      var slot = $('[data-lb-slot="' + (wide.matches ? 'desktop' : 'mobile') + '"]');
      if (slot && coverWrap && coverWrap.parentNode !== slot) slot.appendChild(coverWrap);
    }
    if (wide.addEventListener) wide.addEventListener('change', placeCover); else if (wide.addListener) wide.addListener(placeCover);
    placeCover();

    function setLang(code) {
      var l = cfg.langs.filter(function (x) { return x.code === code; })[0];
      if (!l) return;
      st.lang = l;
      $$('[data-lb-lang]').forEach(function (b) { var on = b.dataset.lbLang === code; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on); });
      renderPreview();
    }

    /* ---------- toast ---------- */
    var toastEl = $('[data-lb-toast]'), toastT = 0;
    function toast(msg) {
      if (!toastEl || !msg) return;
      toastEl.textContent = msg;
      toastEl.classList.add('is-on');
      clearTimeout(toastT);
      toastT = setTimeout(function () { toastEl.classList.remove('is-on'); }, 3500);
    }

    /* ---------- validation ---------- */
    function showErr(k, on) {
      var p = $('[data-lb-err="' + k + '"]');
      if (p) p.hidden = !on;
      var f = k === 'logo' ? $('[data-lb-drop]') : $('[data-lb-f="' + k + '"]');
      if (!f) return;
      f.classList.toggle('is-bad', on);
      if (k !== 'logo') f.setAttribute('aria-invalid', on ? 'true' : 'false');
    }
    function validate() {
      var bad = [];
      if (val('brand').length < 2) bad.push('brand');
      if (!/^[6-9]\d{9}$/.test(phoneDigits(val('phone')))) bad.push('phone');
      if (!st.logo && !st.later) bad.push('logo');
      ['brand', 'phone', 'logo'].forEach(function (k) { showErr(k, bad.indexOf(k) > -1); });
      if (!bad.length) return true;
      var first = bad[0] === 'logo' ? $('[data-lb-drop]') : $('[data-lb-f="' + bad[0] + '"]');
      first.scrollIntoView({ behavior: smooth(), block: 'center' });
      setTimeout(function () { (bad[0] === 'logo' ? $('[data-lb-file]') : first).focus({ preventScroll: true }); }, 350);
      toast(bad.length === 1 ? cfg.t.missingOne : cfg.t.missingMany);
      return false;
    }

    /* ---------- logo upload ---------- */
    var fileIn = $('[data-lb-file]'), drop = $('[data-lb-drop]'), later = $('[data-lb-later]');
    function setFile(file) {
      if (!file) return;
      var okType = /\.(jpe?g|png|pdf)$/i.test(file.name) || ['image/jpeg', 'image/png', 'application/pdf'].indexOf(file.type) > -1;
      if (!okType) { fileIn.value = ''; toast(cfg.t.fileType); return; }
      if (file.size > cfg.maxMb * 1048576) { fileIn.value = ''; toast(fill(cfg.t.fileSize, { mb: cfg.maxMb })); return; }
      if (st.logo && st.logo.url) URL.revokeObjectURL(st.logo.url);
      var pdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
      st.logo = { file: file, name: file.name, pdf: pdf, url: pdf ? '' : URL.createObjectURL(file) };
      st.later = false;
      if (later) later.checked = false;
      var size = file.size >= 1048576 ? (file.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(file.size / 1024)) + ' KB';
      $('[data-lb-filename]').textContent = file.name;
      $('[data-lb-filemeta]').textContent = fill(cfg.t.fileAdded, { size: size });
      $('[data-lb-choose]').textContent = cfg.t.change;
      showErr('logo', false);
      renderPreview();
    }
    if (fileIn) fileIn.addEventListener('change', function () { setFile(fileIn.files && fileIn.files[0]); });
    if (drop) {
      ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
      ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('is-over'); }); });
      drop.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) setFile(f); });
    }
    if (later) later.addEventListener('change', function () { st.later = later.checked; if (later.checked) showErr('logo', false); });

    /* ---------- what gets sent ---------- */
    function rid(kind) {
      var key = 'lb_rid_' + kind, id = '';
      try { id = sessionStorage.getItem(key) || ''; } catch (e) {}
      if (!id) {
        id = 'HH-' + Date.now().toString(36).slice(-5).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
        try { sessionStorage.setItem(key, id); } catch (e) {}
      }
      return id;
    }
    function attribution() { try { return window.hhAttribution ? window.hhAttribution() : {}; } catch (e) { return {}; } }
    function sourceLine(a) {
      var parts = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].filter(function (k) { return a[k]; })
        .map(function (k) { return k.replace('utm_', '') + '=' + a[k]; });
      ['gclid', 'fbclid'].forEach(function (k) { if (a[k]) parts.push(k); });
      if (!parts.length && a.referrer) parts.push('referrer=' + a.referrer);
      return parts.join(' | ') || 'direct';
    }
    function details(kind) {
      var c = calc(st.qty), bulk = kind === 'bulk';
      return {
        form: kind,
        request_id: rid(kind),
        submitted_at: new Date().toISOString(),
        language: st.lang.value,
        quantity: bulk ? st.qty : 1,
        price_per_book: bulk ? c.unit : 0,
        order_total: bulk ? c.total : demoAmount(),
        pay_now: bulk ? c.now : demoAmount(),
        brand: val('brand'),
        slogan: val('slogan'),
        phone: phoneDigits(val('phone')),
        address: val('address'),
        gstin: bulk ? val('gstin').toUpperCase() : '',
        notes: val('notes'),
        logo_on_whatsapp: !!st.later
      };
    }
    // One flat record per event, named like the sheet columns, for the Pabbly webhook.
    function payload(d, status, logoUrl) {
      var a = attribution(), pdf = /\.pdf(\?|$)/i.test(logoUrl || '');
      return {
        received_ist: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        request_id: d.request_id,
        form: d.form,
        status: status,
        language: d.language,
        books: d.quantity,
        price_per_book: d.price_per_book,
        order_total: d.order_total,
        pay_now: d.pay_now,
        brand: d.brand,
        slogan: d.slogan,
        phone: d.phone,
        address: d.address,
        gstin: d.gstin,
        notes: d.notes,
        logo_preview: logoUrl && !pdf ? '=IMAGE("' + logoUrl + '")' : '',
        logo_file: logoUrl || (st.logo && !d.logo_on_whatsapp ? 'Not stored (no product chosen yet): ' + st.logo.name : ''),
        logo_on_whatsapp: d.logo_on_whatsapp ? 'Yes' : 'No',
        utm_source: a.utm_source || '',
        utm_medium: a.utm_medium || '',
        utm_campaign: a.utm_campaign || '',
        utm_term: a.utm_term || '',
        utm_content: a.utm_content || '',
        page_url: location.href.split('#')[0],
        device: matchMedia('(max-width: 749px)').matches ? 'mobile' : 'desktop'
      };
    }
    function post(body) {
      var hp = $('[data-lb-hp]');
      if (hp && hp.value) return Promise.resolve(); // a bot filled the hidden field
      var ctl = window.AbortController ? new AbortController() : null;
      var timer = ctl ? setTimeout(function () { ctl.abort(); }, 30000) : 0;
      return fetch(cfg.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
        .then(function (r) { if (!r.ok) throw new Error('webhook ' + r.status); })
        .finally(function () { clearTimeout(timer); });
    }
    function lineProps(kind, d) {
      var c = calc(st.qty), p = { 'Language': d.language };
      if (kind === 'bulk') {
        p['Books'] = num(st.qty);
        p['Price per book'] = inr(c.unit);
        p['Order total'] = inr(c.total);
        if (cfg.advance < 100) { p['Paid now (' + cfg.advance + '%)'] = inr(c.now); p['Balance before dispatch'] = inr(c.rest); }
      }
      p['Brand name'] = d.brand;
      p['Slogan'] = d.slogan;
      p['Phone'] = d.phone;
      p['Address or website'] = d.address;
      p['GSTIN'] = d.gstin;
      p['Notes'] = d.notes;
      p['Logo'] = st.logo ? st.logo.name : cfg.t.logoLater;
      p['_lb'] = kind;
      p['_Request ID'] = d.request_id;
      p['_Source'] = sourceLine(attribution());
      return p;
    }

    /* ---------- cart + drawer ---------- */
    var drawer = $('[data-lb-drawer]'), lastFocus = null;
    function sectionsUrl() { return location.pathname + location.search; }
    function isKind(item, kind) {
      var pid = kind === 'bulk' ? cfg.bulkProduct : cfg.demoProduct;
      return (pid && item.product_id === pid) || (item.properties && item.properties._lb === kind);
    }
    function swapDrawer(sections) {
      if (!drawer || !sections || !sections[sectionId]) return false;
      var fresh = new DOMParser().parseFromString(sections[sectionId], 'text/html').querySelector('[data-lb-drawer-in]');
      var cur = drawer.querySelector('[data-lb-drawer-in]');
      if (!fresh || !cur) return false;
      var oldRun = cur.querySelector('.hh-runner'), oldFill = cur.querySelector('.hh-fill');
      fresh = document.importNode(fresh, true);
      cur.parentNode.replaceChild(fresh, cur);
      // Hanuman ji runs from the old price to the new one
      var run = fresh.querySelector('.hh-runner'), bar = fresh.querySelector('.hh-fill');
      if (oldRun && run && oldFill && bar) {
        var to = run.style.left, tw = bar.style.width;
        run.style.left = oldRun.style.left; bar.style.width = oldFill.style.width;
        void run.offsetWidth;
        run.style.left = to; bar.style.width = tw;
      }
      document.documentElement.dispatchEvent(new CustomEvent('cart:updated', {
        bubbles: true, detail: { cart: { item_count: +fresh.dataset.count || 0, total_price: +fresh.dataset.total || 0 } }
      }));
      return true;
    }
    function refreshDrawer() {
      return fetch(sectionsUrl() + (location.search ? '&' : '?') + 'sections=' + encodeURIComponent(sectionId))
        .then(json).then(swapDrawer).catch(function () {});
    }
    function openDrawer() {
      if (!drawer) return;
      lastFocus = document.activeElement;
      drawer.hidden = false;
      document.documentElement.classList.add('hh-lock');
      var x = drawer.querySelector('.hh-x');
      if (x) x.focus({ preventScroll: true });
    }
    function closeDrawer() {
      if (!drawer || drawer.hidden) return;
      drawer.hidden = true;
      document.documentElement.classList.remove('hh-lock');
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
    function drawerBusy(on) { if (drawer) drawer.classList.toggle('is-busy', on); }
    function drawerError(msg) {
      var el = drawer && drawer.querySelector('[data-lb-cart-err]');
      if (!el) { toast(msg); return; }
      el.textContent = msg; el.hidden = false;
      setTimeout(function () { el.hidden = true; }, 5000);
    }
    function add(variant, qty, props) {
      var fd = new FormData();
      fd.append('id', variant);
      fd.append('quantity', qty);
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v !== '' && v != null) fd.append('properties[' + k + ']', v);
      });
      fd.append('sections', sectionId);
      fd.append('sections_url', sectionsUrl());
      return cartPost('cart/add.js', fd);
    }
    function removeLine(key) {
      return cartPost('cart/change.js', JSON.stringify({ id: key, quantity: 0, sections: sectionId, sections_url: sectionsUrl() }));
    }
    // Replace the old line first: the same variant with the same details would otherwise merge into it.
    // The logo goes up with the cart line; Shopify stores it and returns its link.
    function putInCart(kind, d, existing) {
      var item = kind === 'bulk' ? bulkItem(st.qty) : { id: cfg.demoVariant, qty: 1 };
      var props = lineProps(kind, d);
      if (st.logo) props['Logo file'] = st.logo.file;
      var first = existing ? removeLine(existing.key) : Promise.resolve();
      return first.then(function () { return add(item.id, item.qty, props); })
        .then(function (res) {
          if (!swapDrawer(res.sections)) refreshDrawer();
          return (res.properties && res.properties['Logo file']) || '';
        });
    }

    /* ---------- submit ---------- */
    var busy = false;
    function setLoading(btn, label) {
      if (!btn) return;
      if (label) {
        if (!btn.dataset.lbLabel) btn.dataset.lbLabel = btn.innerHTML;
        btn.textContent = label;
        btn.classList.add('is-loading');
        btn.setAttribute('aria-busy', 'true');
      } else {
        if (btn.dataset.lbLabel) btn.innerHTML = btn.dataset.lbLabel;
        delete btn.dataset.lbLabel;
        btn.classList.remove('is-loading');
        btn.removeAttribute('aria-busy');
        renderPrice();
      }
    }
    function showDone(d) {
      var box = $('[data-lb-done]');
      if (!box) { toast(cfg.t.updated); return; }
      box.hidden = false;
      var wa = box.querySelector('[data-lb-wa]');
      if (wa && cfg.whatsapp) wa.href = 'https://wa.me/' + cfg.whatsapp + '?text=' + encodeURIComponent(fill(cfg.t.waText, { id: d.request_id }));
      box.scrollIntoView({ behavior: smooth(), block: 'center' });
    }
    function submit(kind, btn) {
      if (busy) return;
      if (!validate()) return;
      var hasProduct = kind === 'bulk' ? cfg.bulkVariants.length > 0 : cfg.demoVariant > 0;
      if (!hasProduct && !cfg.webhook) { toast(cfg.t.notSetUp); return; }
      busy = true;
      setLoading(btn, st.logo && hasProduct ? cfg.t.uploading : cfg.t.sending);
      var d = details(kind), existing = null;
      (hasProduct ? getCart() : Promise.resolve(null))
        .then(function (cart) {
          existing = cart ? cart.items.filter(function (i) { return isKind(i, kind); })[0] : null;
          if (kind === 'demo' && existing && (existing.properties || {})['_Request ID'] !== d.request_id) {
            toast(cfg.t.demoDupe);
            openDrawer();
            return 'stop';
          }
          var status = hasProduct ? (existing ? 'Cart updated' : 'Added to cart') : 'Lead';
          if (!hasProduct) {
            return post(payload(d, status, '')).then(function () { showDone(d); }, function () { toast(cfg.t.sendError); });
          }
          // Cart first (it stores the logo), then the sheet. A sheet failure never blocks the order.
          return putInCart(kind, d, existing).then(function (logoUrl) {
            if (cfg.webhook) post(payload(d, status, logoUrl)).catch(function (e) { console.warn('Order sheet:', e); });
            if (existing) toast(cfg.t.updated);
            openDrawer();
          });
        })
        .catch(function (e) { toast((e && e.message && e.message.length < 140 && e.message) || cfg.t.sendError); })
        .finally(function () { busy = false; setLoading(btn, null); });
    }

    /* ---------- drawer actions ---------- */
    function changeBulk(key, qty) {
      qty = Math.max(MIN, qty);
      drawerBusy(true);
      getCart().then(function (cart) {
        var line = cart.items.filter(function (i) { return i.key === key; })[0];
        if (!line) return refreshDrawer();
        if ((parseInt(String((line.properties || {})['Books'] || '').replace(/\D/g, ''), 10) || line.quantity) === qty) return;
        var c = calc(qty), p = Object.assign({}, line.properties);
        p['Books'] = num(qty);
        p['Price per book'] = inr(c.unit);
        p['Order total'] = inr(c.total);
        Object.keys(p).forEach(function (k) { if (k.indexOf('Paid now') === 0) p[k] = inr(c.now); });
        if (p['Balance before dispatch']) p['Balance before dispatch'] = inr(c.rest);
        var item = bulkItem(qty);
        return removeLine(key)
          .then(function () { return add(item.id, item.qty, p); })
          .then(function (res) {
            if (!swapDrawer(res.sections)) refreshDrawer();
            var mine = p['_Request ID'] === rid('bulk');
            if (mine) setQty(qty); // keep the page in step with the cart
            if (cfg.webhook && p['_Request ID']) {
              post(payload({
                form: 'bulk', request_id: p['_Request ID'], language: p['Language'] || '',
                quantity: qty, price_per_book: c.unit, order_total: c.total, pay_now: c.now,
                brand: p['Brand name'] || '', slogan: p['Slogan'] || '', phone: p['Phone'] || '', address: p['Address or website'] || '',
                gstin: p['GSTIN'] || '', notes: p['Notes'] || '', logo_on_whatsapp: p['Logo'] === cfg.t.logoLater
              }, 'Cart updated', p['Logo file'] || '')).catch(function () {});
            }
          });
      }).catch(function (e) { drawerError((e && e.message) || cfg.t.sendError); refreshDrawer(); })
        .finally(function () { drawerBusy(false); });
    }

    /* ---------- events ---------- */
    root.addEventListener('submit', function (e) { e.preventDefault(); });
    root.addEventListener('input', function (e) {
      var f = e.target.closest('[data-lb-f]');
      if (f) { showErr(f.dataset.lbF, false); renderPreview(); return; }
    });
    root.addEventListener('click', function (e) {
      var el = e.target.closest('button, a');
      if (!el || !root.contains(el)) return;
      if (drawer && drawer.contains(el)) {
        if (el.matches('[data-lb-close]')) { closeDrawer(); return; }
        if (el.matches('[data-lb-cart-jump]')) { changeBulk(el.dataset.key, parseInt(el.dataset.lbCartJump, 10)); return; }
        if (el.matches('[data-lb-cart-remove]')) {
          drawerBusy(true);
          removeLine(el.dataset.key).then(function (res) { if (!swapDrawer(res.sections)) refreshDrawer(); })
            .catch(function (er) { drawerError(er.message); }).finally(function () { drawerBusy(false); });
          return;
        }
        if (el.matches('[data-lb-edit]')) {
          closeDrawer();
          var brand = $('[data-lb-f="brand"]');
          if (brand) { brand.scrollIntoView({ behavior: smooth(), block: 'center' }); setTimeout(function () { brand.focus({ preventScroll: true }); }, 350); }
          return;
        }
        return;
      }
      if (el.matches('[data-lb-submit]')) { e.preventDefault(); submit(el.dataset.lbSubmit, el); return; }
      if (el.matches('[data-lb-tier]')) { setQty(+el.dataset.lbTier); return; }
      if (el.matches('[data-lb-set]')) { setQty(+el.dataset.lbSet); return; }
      if (el.matches('[data-lb-jump]')) { var nx = calc(st.qty).next; if (nx) setQty(nx.min); return; }
      if (el.matches('[data-lb-lang]')) { setLang(el.dataset.lbLang); return; }
    });

    /* sticky bar: shows once the main button has scrolled away */
    var mainBtn = $('[data-lb-main]'), bar = $('[data-lb-sticky]');
    if (mainBtn && bar && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        bar.classList.toggle('is-visible', !en[0].isIntersecting && en[0].boundingClientRect.top < 0);
      }).observe(mainBtn);
    }

    var me = { root: root, drawer: drawer, open: function () { openDrawer(); refreshDrawer(); }, close: closeDrawer };
    if (drawer) active = me;
    root.__lb = me;
    renderPrice();
    renderPreview();
  }

  // The header cart icon opens this page's drawer instead of the site-wide one
  // (window capture runs before logam-hindi.js's document listener).
  window.addEventListener('click', function (e) {
    if (!active || !active.drawer || !document.body.contains(active.root)) return;
    var a = e.target.closest && e.target.closest('a[href$="/cart"], [ap-controlsaria="mini-cart"]');
    if (!a || active.drawer.contains(a)) return;
    e.preventDefault();
    e.stopPropagation();
    active.open();
  }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && active) active.close(); });

  function initAll(scope) { (scope || document).querySelectorAll('[data-lb-order]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { initAll(); });
  else initAll();
  document.addEventListener('shopify:section:load', function (e) { initAll(e.target); });
  document.addEventListener('shopify:section:unload', function (e) { if (active && e.target.contains(active.root)) active = null; });
})();
