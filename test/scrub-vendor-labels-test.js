'use strict';
const assert = require('assert');
const { scrubVendorLabels, scrubPayloadStrings, isUrlLike } = require('../lib/scrub-vendor-labels');

const URLS = [
  'https://a.espncdn.com/i/teamlogos/soccer/500/360.png',
  'https://r2.thesportsdb.com/images/media/team/badge/xyz.png',
  'https://static.sporttery.cn/res_1_0/jcw/upload/mnjc/zq/123.png',
  'https://media.api-sports.io/football/players/2165.png',
  'http://120.77.152.74:8088/api/logo?url=' + encodeURIComponent('https://a.espncdn.com/i/teamlogos/soccer/500/360.png'),
];

for (const u of URLS) {
  assert.strictEqual(scrubVendorLabels(u), u, 'must not scrub URL: ' + u);
  assert.ok(isUrlLike(u), 'isUrlLike ' + u);
}

assert.ok(!/ESPN|API-Football|sporttery\.cn/i.test(scrubVendorLabels('近期战绩来自 ESPN 公开赛程')));
assert.ok(!/ESPN/i.test(scrubVendorLabels('交锋来自 API-Football')));

const html = '说明 ESPN <img src="https://a.espncdn.com/x.png"> 完';
const scrubbed = scrubVendorLabels(html);
assert.ok(scrubbed.includes('https://a.espncdn.com/x.png'), 'html img src preserved');
assert.ok(!/ESPN/.test(scrubbed.replace('espncdn', '')), 'ESPN label scrubbed outside URL');

const o = {
  homeLogo: URLS[0],
  awayLogo: URLS[1],
  photo: URLS[3],
  noteZh: '来自 ESPN 公开名单',
};
scrubPayloadStrings(o);
assert.strictEqual(o.homeLogo, URLS[0]);
assert.strictEqual(o.awayLogo, URLS[1]);
assert.strictEqual(o.photo, URLS[3]);
assert.ok(!/ESPN/i.test(o.noteZh));

console.log('scrub-vendor-labels-test: ok');
