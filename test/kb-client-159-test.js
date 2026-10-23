// 1.9.159: KB list UI states — no infinite skeleton on error; null vs [] vs loaded.
const assert = require('assert');

function kbHomeView(kb) {
  const packs = kb && kb.packs;
  const list = packs || [];
  const packsErr = kb && kb.packsError;
  const pending = kb && (kb.loading || (packs == null && !packsErr));
  if (pending && !list.length) return 'skeleton';
  if (packsErr && !list.length) return 'error';
  if (!list.length) return 'empty';
  return 'list';
}

assert.strictEqual(kbHomeView({ packs: null, loading: false }), 'skeleton', 'null packs without error = loading');
assert.strictEqual(kbHomeView({ packs: null, loading: false, packsError: '超时' }), 'error', 'failed fetch must not skeleton forever');
assert.strictEqual(kbHomeView({ packs: [], loading: false }), 'empty', 'confirmed empty');
assert.strictEqual(kbHomeView({ packs: [{ id: 1 }], loading: false }), 'list');
assert.strictEqual(kbHomeView({ packs: [{ id: 1 }], loading: true }), 'list', 'list wins over loading');

async function loadKbPacksSim(state, apiResult) {
  if (!state.loggedIn) return [];
  if (state.kb && state.kb.packs) return state.kb.packs;
  state.kb = state.kb || {};
  try {
    const j = await apiResult();
    state.kb.packs = (j && j.packs) || [];
    state.kb.packsError = '';
    return state.kb.packs;
  } catch (e) {
    state.kb.packsError = e.message || 'fail';
    throw e;
  }
}

(async () => {
  const okState = { loggedIn: true, kb: { packs: null } };
  await loadKbPacksSim(okState, () => Promise.resolve({ packs: [{ id: 'a' }] }));
  assert.strictEqual(kbHomeView(okState.kb), 'list', 'successful packs response leaves list');

  const errState = { loggedIn: true, kb: { packs: null } };
  try {
    await loadKbPacksSim(errState, () => Promise.reject(new Error('网络超时')));
  } catch (_) {}
  assert.strictEqual(kbHomeView(errState.kb), 'error', 'no infinite skeleton after failed packs');
  assert.strictEqual(errState.kb.packs, null);
})().then(() => console.log('kb-client-159-test OK'));
