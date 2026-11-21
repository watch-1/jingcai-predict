/**
 * Hard switch for outbound API-Football HTTP (v3.football.api-sports.io).
 * Fail closed: live request paths must not call AF unless ALLOW_AF_HTTP=1.
 * Warehouse / backfill scripts may set that env explicitly; they must not
 * run automatically. Tokens stay on the server and are never logged.
 */
'use strict';

const AF_HOST = 'v3.football.api-sports.io';

function afHttpAllowed() {
  return process.env.ALLOW_AF_HTTP === '1';
}

function afDisabledError(label) {
  const e = new Error('af_disabled');
  e.code = 'af_disabled';
  if (label) e.label = String(label);
  return e;
}

function assertAfHttpAllowed(label) {
  if (!afHttpAllowed()) throw afDisabledError(label);
}

function isAfApiUrl(url) {
  const s = String(url || '');
  return s.includes(AF_HOST);
}

module.exports = {
  AF_HOST,
  afHttpAllowed,
  afDisabledError,
  assertAfHttpAllowed,
  isAfApiUrl,
};
