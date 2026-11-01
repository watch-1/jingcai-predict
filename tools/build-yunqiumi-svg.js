#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const BALL = { x: 512, y: 430, r: 162 };

function polar(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function poly(cx, cy, r, n, rot) {
  return Array.from({ length: n }, (_, i) =>
    polar(cx, cy, r, rot + (i * 360) / n).map((n) => n.toFixed(1)).join(',')
  ).join(' ');
}

const pentR = BALL.r * 0.34;
const centerPent = poly(BALL.x, BALL.y, pentR, 5, -90);

const outerPents = [];
for (let i = 0; i < 5; i++) {
  const th = -90 + i * 72;
  const [ox, oy] = polar(BALL.x, BALL.y, BALL.r * 0.86, th);
  outerPents.push(poly(ox, oy, BALL.r * 0.20, 5, th + 180));
}

// C-wrap: left-up → left → bottom → right → right-up (open at the top).
// polar() uses y-down, so decreasing angle is the bottom path; large-arc because span > 180°.
const wrapR = BALL.r + 54;
const [sx, sy] = polar(BALL.x, BALL.y, wrapR, 205);
const [ex, ey] = polar(BALL.x, BALL.y, wrapR, 340);
const wrapD = `M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${wrapR} ${wrapR} 0 1 0 ${ex.toFixed(1)} ${ey.toFixed(1)}`;

const goldR = wrapR + 46;
const [gsx, gsy] = polar(BALL.x, BALL.y, goldR, 145);
const [gex, gey] = polar(BALL.x, BALL.y, goldR, 35);
const goldD = `M ${gsx.toFixed(1)} ${gsy.toFixed(1)} A ${goldR} ${goldR} 0 0 0 ${gex.toFixed(1)} ${gey.toFixed(1)}`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="navy" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1E2C3C"/>
      <stop offset="1" stop-color="#121A26"/>
    </linearGradient>
    <radialGradient id="teal" cx="46%" cy="38%" r="64%">
      <stop offset="0" stop-color="#2AA392"/>
      <stop offset="0.48" stop-color="#1A7A70"/>
      <stop offset="1" stop-color="#0C534C"/>
    </radialGradient>
    <radialGradient id="ballLit" cx="34%" cy="30%" r="70%">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="0.55" stop-color="#F1F2F4"/>
      <stop offset="1" stop-color="#C5CAD0"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F6E4A8"/>
      <stop offset="0.4" stop-color="#D4AF37"/>
      <stop offset="1" stop-color="#8A6414"/>
    </linearGradient>
    <linearGradient id="goldHi" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#B8860B"/>
      <stop offset="1" stop-color="#F8E7B0"/>
    </linearGradient>
    <filter id="cloudShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="2" dy="8" stdDeviation="10" flood-color="#071614" flood-opacity="0.30"/>
    </filter>
    <clipPath id="ballClip">
      <circle cx="${BALL.x}" cy="${BALL.y}" r="${BALL.r}"/>
    </clipPath>
  </defs>

  <rect width="1024" height="1024" fill="url(#navy)"/>
  <circle cx="512" cy="512" r="400" fill="url(#teal)"/>
  <circle cx="470" cy="450" r="240" fill="#3EC4B0" opacity="0.11"/>

  <g filter="url(#cloudShadow)" fill="#FFFFFF" stroke="none">
    <path d="${wrapD}" fill="none" stroke="#FFFFFF" stroke-width="108" stroke-linecap="round"/>
    <!-- organic puffs along the wrap, kept tight to the ball -->
    <ellipse cx="328" cy="510" rx="78" ry="62"/>
    <ellipse cx="400" cy="585" rx="72" ry="52"/>
    <ellipse cx="512" cy="605" rx="128" ry="72"/>
    <ellipse cx="632" cy="575" rx="76" ry="56"/>
    <ellipse cx="692" cy="470" rx="70" ry="64"/>
    <ellipse cx="668" cy="405" rx="52" ry="44"/>
    <ellipse cx="300" cy="455" rx="58" ry="48"/>
  </g>
  <ellipse cx="360" cy="478" rx="44" ry="20" fill="#fff" opacity="0.65"/>
  <ellipse cx="668" cy="410" rx="36" ry="16" fill="#fff" opacity="0.65"/>

  <path d="${goldD}" fill="none" stroke="url(#gold)" stroke-width="22" stroke-linecap="round"/>
  <path d="${goldD}" fill="none" stroke="url(#goldHi)" stroke-width="8" stroke-linecap="round" opacity="0.65"/>

  <circle cx="${BALL.x}" cy="${BALL.y + 6}" r="${BALL.r + 6}" fill="#0E2A28" opacity="0.16"/>
  <circle cx="${BALL.x}" cy="${BALL.y}" r="${BALL.r}" fill="url(#ballLit)"/>
  <g clip-path="url(#ballClip)">
    <polygon points="${centerPent}" fill="#1B1D20"/>
    ${outerPents.map((p) => `<polygon points="${p}" fill="#1B1D20"/>`).join('\n    ')}
  </g>
  <circle cx="${BALL.x}" cy="${BALL.y}" r="${BALL.r}" fill="none" stroke="#E4E7EB" stroke-width="5" opacity="0.45"/>
  <ellipse cx="${BALL.x - 46}" cy="${BALL.y - 54}" rx="40" ry="22" fill="#fff" opacity="0.26"/>
</svg>
`;

fs.writeFileSync(path.join(__dirname, 'yunqiumi-icon.svg'), svg);
console.log('wrote tools/yunqiumi-icon.svg');
