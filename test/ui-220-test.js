'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'public/app.js'), 'utf8');

assert.ok(/function softPatchScheduleLiveRows/.test(appJs), 'schedule: in-place ls-row live patch');
assert.ok(/function afterScheduleLiveScoresLoaded/.test(appJs), 'schedule: live-scores reload handler');
assert.ok(/function scheduleNeedLivePoll/.test(appJs), 'schedule: kickoff-aware live poll gate');
assert.ok(/function resumeScheduleLivePoll/.test(appJs), 'schedule: resume poll on tab restore');

const pollBlock = appJs.match(/function ensureLiveScorePoll[\s\S]*?^}/m)?.[0] || '';
assert.ok(/afterScheduleLiveScoresLoaded\(\)/.test(pollBlock), 'live poll: patch list after fetch, not bare render()');

const renderTail = appJs.match(/if \(r\.name === 'schedule'\) resumeScheduleLivePoll\(\);[\s\S]*?else stopLiveScorePoll\(\);/)?.[0] || '';
assert.ok(renderTail.length > 0, 'render: resume schedule live poll when on 赛程 tab');

const sigBlock = appJs.match(/if \(name === 'schedule'\)[\s\S]*?return 's:'/)?.[0] || '';
assert.ok(!/liveScoresAt/.test(sigBlock), 'schedule tabContentSig must not include live (poll uses soft patch)');

console.log('ui-220-test OK');
