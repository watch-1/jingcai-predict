#!/usr/bin/env node
/** Smoke: match detail hero must not render the standalone 「赛果」 card below the scoreboard. */
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const fnMatch = appJs.match(/function matchHero\([^)]*\)\s*\{[\s\S]*?\n\}/);
if (!fnMatch) {
  console.error('smoke-match-detail-no-saiguo: matchHero not found');
  process.exit(1);
}
const body = fnMatch[0];
if (/<h3>赛果<\/h3>/.test(body) || body.includes('resultTags(r)')) {
  console.error('smoke-match-detail-no-saiguo: matchHero still contains 赛果 card markup');
  process.exit(1);
}
console.log('smoke-match-detail-no-saiguo: ok');
