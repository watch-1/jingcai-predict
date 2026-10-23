'use strict';
const assert = require('assert');
const lt = require('../lib/league-tables');

(async () => {
  const st = await lt.prefetchDataCenter({ reason: 'test', leagues: ['epl'] });
  assert.ok(st.ok >= 1, 'prefetch should warm at least one kind, got ' + JSON.stringify(st));

  const r1 = await lt.getStandings({ league: 'epl' });
  assert.ok(r1 && r1.ok !== false, 'standings epl');
  const r2 = await lt.getStandings({ league: 'epl' });
  assert.ok(r2 && r2.ok !== false, 'standings epl repeat');
  assert.ok(r2.cached || r2.cacheLayer === 'mem' || r2.cacheLayer === 'disk', 'second standings should hit cache path');

  const cv1 = await lt.getClubMarketValues({ league: 'epl' });
  assert.ok(cv1 && cv1.ok, 'club values epl');
  const cv2 = await lt.getClubMarketValues({ league: 'epl' });
  assert.ok(cv2.cacheLayer === 'mem' || cv2.cacheLayer === 'disk', 'club values should be mem/disk on repeat, got ' + cv2.cacheLayer);

  const pv = await lt.getPlayerMarketValues({ league: 'epl' });
  if (pv && pv.ok && (pv.rows || []).length) {
    const withPh = (pv.rows || []).filter((r) => r && r.photo).length;
    assert.ok(withPh >= 1, 'player values rows should include photos when MV index present, got ' + withPh);
  } else {
    console.log('data-center-prefetch-test: skip playervalues photo assert (no MV index in env)');
  }

  const ps = lt.prefetchStatus();
  assert.ok(ps.leagueKeys && ps.leagueKeys.includes('epl'), 'prefetch status lists leagues');
  console.log('data-center-prefetch-test ok', { prefetch: st, cacheLayer: cv2.cacheLayer });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
