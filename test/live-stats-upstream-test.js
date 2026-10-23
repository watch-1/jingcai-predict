'use strict';
const assert = require('assert');
const live = require('../lib/live-stats');

const zh = live.upstreamMessageZh;
assert.strictEqual(zh({ message: 'fetch failed' }), '实时数据连接失败，请稍后重试');
assert.strictEqual(zh({ message: 'Failed to fetch' }), '实时数据连接失败，请稍后重试');
assert.strictEqual(zh({ name: 'AbortError', message: 'This operation was aborted' }), '请求超时，请稍后重试');
assert.strictEqual(zh({ message: '实时技术统计暂时不可用' }), '实时技术统计暂时不可用');
assert.ok(/[\u4e00-\u9fff]/.test(zh({ message: 'ECONNRESET' })));

const appJs = require('fs').readFileSync(require('path').join(__dirname, '../public/app.js'), 'utf8');
assert.ok(/function liveStatsUserMsg\(live\)/.test(appJs), 'client maps live-stats errors to Chinese');
assert.ok(!/live\.error \|\| live\.detail \|\| live\.eventsError/.test(appJs), 'events tab must not render raw upstream fields');

console.log('live-stats-upstream-test OK');
