'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const pitch = require('../public/js/pitch-live.js');

assert.ok(typeof pitch.simulatedPlayersAt === 'function');
assert.strictEqual(pitch.HOME_SHAPE.length, 11);
const mid = pitch.simulatedPlayersAt(0, { ball: { x: 0.5, y: 0.5 }, attackingSide: null });
assert.strictEqual(mid.length, 22);
assert.strictEqual(mid.filter((p) => p.side === 'home').length, 11);
assert.strictEqual(mid.filter((p) => p.side === 'away').length, 11);
assert.ok(mid.every((p) => p.simulated === true));
assert.ok(mid.every((p) => p.x > 0.02 && p.x < 0.98 && p.y > 0.05 && p.y < 0.95));

const homeAtk = pitch.simulatedPlayersAt(0, { ball: { x: 0.82, y: 0.50 }, attackingSide: 'home' });
const homeFwd = homeAtk.filter((p) => p.side === 'home' && p.role === 'f');
const awayDef = homeAtk.filter((p) => p.side === 'away' && p.role === 'd');
const midFwd = mid.filter((p) => p.side === 'home' && p.role === 'f');
const avg = (arr) => arr.reduce((s, p) => s + p.x, 0) / arr.length;
assert.ok(avg(homeFwd) > avg(midFwd), 'possessing forwards push up toward the real ball');
assert.ok(avg(awayDef) > 0.5, 'defending back line stays between the ball and their goal (x=1)');
assert.ok(homeAtk.every((p) => Math.hypot(p.x - 0.82, p.y - 0.50) >= 0.024), 'players do not sit on the real ball');

const a = pitch.simulatedPlayersAt(0, { ball: { x: 0.7, y: 0.4 }, attackingSide: 'home' });
const b = pitch.simulatedPlayersAt(8, { ball: { x: 0.7, y: 0.4 }, attackingSide: 'home' });
assert.ok(a.some((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y) > 0.002), 'gentle jogging over time');

const stepped = pitch.stepSimulatedPlayers(a, b, 0.016);
assert.strictEqual(stepped.length, 22);
const jumped = a.filter((p, i) => Math.hypot(p.x - stepped[i].x, p.y - stepped[i].y) > 0.05);
assert.strictEqual(jumped.length, 0, 'step does not teleport');

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
assert.ok(app.includes("js/pitch-live.js?v=pitch409"));

console.log('pitch-sim-players-1388-test ok');
