/* Logam: remember where a visitor came from (UTM tags, ad click ids, landing page, referrer)
   so forms can send it with their data. First touch is kept for 90 days; last touch is updated
   by every visit that carries campaign tags or comes from another site.
   Read it with window.hhAttribution(). */
(function () {
  if (window.hhAttribution) return;
  var KEY = 'hh_attrib', DAYS = 90;
  var UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id'];
  var CLICK = ['gclid', 'fbclid', 'gbraid', 'wbraid', 'msclkid'];
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }

  var now = Date.now(), data = load();
  if (data.first && now - data.first.ts > DAYS * 864e5) data = {};
  var q = new URLSearchParams(location.search), touch = { landing_page: location.href.split('#')[0], ts: now }, tagged = false;
  UTM.concat(CLICK).forEach(function (k) { var v = q.get(k); if (v) { touch[k] = v.slice(0, 200); tagged = true; } });
  var ref = '';
  try { if (document.referrer && new URL(document.referrer).host !== location.host) ref = document.referrer; } catch (e) {}
  touch.referrer = ref;
  if (!data.first) data.first = touch;
  if (tagged || ref || !data.last) data.last = touch;
  save(data);

  window.hhAttribution = function () {
    var d = load(), l = d.last || touch, f = d.first || touch, out = {};
    UTM.concat(CLICK).forEach(function (k) { out[k] = l[k] || ''; });
    out.landing_page = l.landing_page || '';
    out.referrer = l.referrer || '';
    out.first_utm_source = f.utm_source || '';
    out.first_utm_medium = f.utm_medium || '';
    out.first_utm_campaign = f.utm_campaign || '';
    out.first_landing_page = f.landing_page || '';
    out.first_referrer = f.referrer || '';
    out.first_seen = f.ts ? new Date(f.ts).toISOString() : '';
    return out;
  };
})();
