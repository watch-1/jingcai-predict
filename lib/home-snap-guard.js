/** Home snap accept/persist rules (1.9.158 cold-start). Kept in lib/ for node tests; mirrored in public/app.js. */
const HOME_SNAP_VER = 2;

function rejectHomeSnapRecord(s) {
  if (!s || !s.html || s.html.length < 200) return true;
  if ((s.ver || 0) < HOME_SNAP_VER) return true;
  if (s.html.indexOf('网络不可用') >= 0) return true;
  if (s.html.indexOf('ha-skel') >= 0) return true;
  return false;
}

function homeSnapPersistBlocked(html) {
  if (!html || html.indexOf('home-hero') < 0) return true;
  if (html.indexOf('focus-card skel') >= 0 || html.indexOf('focus-bar skel') >= 0) return true;
  if (html.indexOf('sk-line') >= 0 && html.indexOf('hc-item') < 0) return true;
  if (html.indexOf('ha-skel') >= 0) return true;
  if (html.indexOf('网络不可用') >= 0) return true;
  return false;
}

function stripLegacyHomeSnapWarn(html) {
  if (!html || html.indexOf('网络不可用') < 0) return html;
  return html.replace(/<div class="warn-bar">[^<]*网络不可用[\s\S]*?<\/div>/gi, '');
}

module.exports = { HOME_SNAP_VER, rejectHomeSnapRecord, homeSnapPersistBlocked, stripLegacyHomeSnapWarn };
