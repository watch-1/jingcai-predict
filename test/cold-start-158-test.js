// 1.9.158: home snap guard + KB list pending semantics (unit, no browser).
const assert = require('assert');
const { rejectHomeSnapRecord, homeSnapPersistBlocked, stripLegacyHomeSnapWarn, HOME_SNAP_VER } = require('../lib/home-snap-guard');

assert.strictEqual(HOME_SNAP_VER, 2);
assert.ok(rejectHomeSnapRecord({ html: 'x'.repeat(200), ver: 1 }), 'reject legacy ver');
assert.ok(rejectHomeSnapRecord({ html: 'a'.repeat(200) + '网络不可用', ver: 2 }), 'reject offline bar in snap');
assert.ok(rejectHomeSnapRecord({ html: 'a'.repeat(200) + 'ha-skel', ver: 2 }), 'reject attitude skeleton snap');
assert.ok(!rejectHomeSnapRecord({ html: 'home-hero ' + 'a'.repeat(200), ver: 2 }), 'accept fresh snap');

assert.ok(homeSnapPersistBlocked('<div class="home-hero"></div>ha-skel'), 'block persist with attitude skel');
assert.ok(!homeSnapPersistBlocked('<div class="home-hero"></div><div class="hc-item"></div>ok'), 'allow persist with column loaded');

const stripped = stripLegacyHomeSnapWarn('<div class="warn-bar">网络不可用，显示上次缓存</div><div class="home-hero">');
assert.ok(stripped.indexOf('网络不可用') < 0, 'strip legacy warn');

function kbShowsEmptyNotLoading(kb) {
  const packs = kb && kb.packs;
  const pending = kb && (kb.loading || packs == null);
  const list = packs || [];
  if (pending && !list.length) return 'skeleton';
  if (!list.length) return 'empty';
  return 'list';
}
assert.strictEqual(kbShowsEmptyNotLoading({ packs: null, loading: false }), 'skeleton', 'null packs = pending');
assert.strictEqual(kbShowsEmptyNotLoading({ packs: [], loading: false }), 'empty', 'confirmed empty');
assert.strictEqual(kbShowsEmptyNotLoading({ packs: [{ id: 1 }], loading: false }), 'list');

console.log('cold-start-158-test OK');
