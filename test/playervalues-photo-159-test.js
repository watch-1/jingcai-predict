'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jc-pv-photo-'));
const { DATA_DIR } = require('../lib/db');
const et = require('../lib/espn-tables');

const dir = path.join(DATA_DIR, 'live-stats', 'espn', 'tables');
fs.mkdirSync(dir, { recursive: true });
const payload = {
  at: Date.now(),
  payload: {
    rows: [
      {
        rank: 1,
        player: 'Erling Haaland',
        team: 'Manchester City',
        photo: 'https://r2.thesportsdb.com/images/media/player/cutout/test.png',
      },
      {
        rank: 2,
        player: 'Declan Rice',
        team: 'Arsenal',
        photo: 'https://r2.thesportsdb.com/images/media/player/cutout/rice.png',
      },
    ],
  },
};
fs.writeFileSync(path.join(dir, 'scorers-eng.1.json'), JSON.stringify(payload));

const rows = [
  { player: 'Erling Haaland', team: 'Manchester City', photo: '', rank: 1 },
  { player: 'Declan Rice', team: 'Arsenal', photo: '', rank: 2 },
  { player: 'Unknown Player', team: 'Arsenal', photo: '', tmId: '999001', rank: 3 },
];

const { leaders } = et.enrichPlayervaluePhotos(rows, 'epl');
assert.ok(rows[0].photo && rows[0].photo.includes('thesportsdb'), 'Haaland photo from leader disk');
assert.ok(rows[1].photo, 'Rice photo from leader disk');
assert.ok(rows[2].photo && rows[2].photo.includes('transfermarkt'), 'tmId fallback portrait URL');
assert.ok(leaders >= 3, 'leader merge count');

function renderHasPhoto(r) {
  return !!(r.photo && /^https?:\/\//.test(r.photo));
}
assert.ok(rows.every(renderHasPhoto), 'render path would show <img> for each row');

console.log('playervalues-photo-159-test OK');
