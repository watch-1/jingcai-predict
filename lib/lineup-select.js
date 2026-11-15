/**
 * Prefer the latest official starting XI over a predicted or previous XI.
 * Does not invent players. Official 上阵 always wins if it has a full XI,
 * even if a predicted pack was fetched later.
 */
'use strict';

const TYPE_STARTER = 11;
const TYPE_BENCH = 12;

function hasXi(side) {
  return !!(side && Array.isArray(side.starters) && side.starters.length >= 11);
}

function isPredictedType(typeId, row) {
  if (row && (row.predicted === true || row.expected === true || row.kind === 'predicted')) return true;
  const id = Number(typeId);
  if (id === TYPE_STARTER || id === TYPE_BENCH) return false;
  // SportMonks official packs use 11/12 only. Any other lineup type_id is treated as predicted/expected.
  if (Number.isFinite(id) && id > 0) return true;
  return false;
}

function smPlayer(lu) {
  const player = lu.player || {};
  const image = player.image_path || lu.image || '';
  return {
    smId: lu.player_id || player.id || null,
    name: lu.player_name || player.display_name || player.name || player.common_name || '',
    number: lu.jersey_number != null ? String(lu.jersey_number) : (player.jersey_number || ''),
    pos: posAbbrev(lu, player),
    place: Number(lu.formation_position || 0) || 0,
    formationField: lu.formation_field || '',
    captain: !!(lu.captain || player.captain),
    image: image || '',
    photo: image || '',
    nameAlt: player.common_name || '',
    nationality: (typeof player.nationality === 'string' && player.nationality) || (player.nationality && player.nationality.name) || '',
  };
}

function posAbbrev(lu, player) {
  const id = Number(lu.position_id || (player && player.position_id) || (player && player.detailed_position_id));
  const map = { 24: 'GK', 25: 'D', 26: 'M', 27: 'F', 148: 'CB', 149: 'DM', 150: 'AM', 151: 'CF', 152: 'LW', 153: 'CM', 154: 'RB', 155: 'LB', 156: 'RW', 157: 'LM', 158: 'RM', 163: 'SS' };
  if (map[id]) return map[id];
  const field = String(lu.formation_field || '');
  if (field === '1:1' || Number(lu.formation_position) === 1) return 'GK';
  return (lu.position && (lu.position.developer_name || lu.position.name)) || '';
}

function formationOf(rows, meta) {
  if (meta && meta.formation) return String(meta.formation);
  const fields = (rows || []).map((r) => r.formation_field).filter(Boolean);
  // Infer e.g. 4-3-3 from formation_field "row:col" on official starters.
  const byRow = {};
  for (const f of fields) {
    const m = String(f).match(/^(\d+)\s*:\s*\d+$/);
    if (!m) continue;
    const row = Number(m[1]);
    if (row <= 1) continue; // row 1 is GK
    byRow[row] = (byRow[row] || 0) + 1;
  }
  const keys = Object.keys(byRow).map(Number).sort((a, b) => a - b);
  if (!keys.length) return '';
  return keys.map((k) => byRow[k]).join('-');
}

function sideFromSmRows(rows, extras) {
  const list = rows || [];
  const officialStarters = list.filter((r) => Number(r.type_id) === TYPE_STARTER).map(smPlayer);
  const officialBench = list.filter((r) => Number(r.type_id) === TYPE_BENCH).map(smPlayer);
  const predictedRows = list.filter((r) => isPredictedType(r.type_id, r));
  const predictedStarters = predictedRows.filter((r) => !isBenchish(r)).map(smPlayer);
  const predictedBench = predictedRows.filter(isBenchish).map(smPlayer);
  const official = officialStarters.length
    ? { starters: officialStarters, bench: officialBench, formation: formationOf(list.filter((r) => Number(r.type_id) === TYPE_STARTER), extras), kind: 'official', source: (extras && extras.source) || 'sportmonks' }
    : null;
  const predicted = predictedStarters.length
    ? { starters: predictedStarters, bench: predictedBench, formation: formationOf(predictedRows, extras), kind: 'predicted', source: (extras && extras.source) || 'sportmonks-predicted' }
    : null;
  return { official, predicted };
}

function isBenchish(r) {
  if (Number(r.type_id) === TYPE_BENCH) return true;
  if (r.starter === false || r.bench === true) return true;
  if (!r.formation_field && !r.formation_position) return true;
  return false;
}

/**
 * Pick among official / predicted / previous sides.
 * official wins whenever it has a full XI, regardless of predicted freshness.
 * Among multiple official snapshots, the latest `at` wins.
 */
function chooseLineupSide(opts) {
  const bag = opts || {};
  const officials = [].concat(bag.official || bag.officials || []).filter(hasXi);
  officials.sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
  if (officials.length) {
    return Object.assign({}, officials[0], { kind: 'official' });
  }
  if (hasXi(bag.predicted)) {
    return Object.assign({}, bag.predicted, { kind: 'predicted' });
  }
  if (hasXi(bag.previous)) {
    return Object.assign({}, bag.previous, { kind: 'previous' });
  }
  return null;
}

function isOfficialState(state) {
  return state === 'announced' || state === 'live' || state === 'final';
}

/**
 * Merge ESPN assembled output with an optional SportMonks pack for this fixture.
 * SM official type_id 11 XIs replace ESPN previous/predicted; they do not replace
 * an already official ESPN announced/live/final XI unless ESPN has no full XI.
 */
function mergeLineupPack(espnOut, smPack) {
  const out = espnOut && typeof espnOut === 'object' ? Object.assign({}, espnOut) : { ok: true, home: null, away: null };
  const homeSm = smPack && sideFromSmRows(smPack.homeRows || smPack.home || [], { formation: smPack.homeFormation, source: 'sportmonks' });
  const awaySm = smPack && sideFromSmRows(smPack.awayRows || smPack.away || [], { formation: smPack.awayFormation, source: 'sportmonks' });

  const espnOfficial = isOfficialState(out.state);
  out.home = chooseLineupSide({
    official: [
      espnOfficial && hasXi(espnOut && espnOut.home) ? Object.assign({ at: espnOut.homeAt || 0, source: 'espn' }, espnOut.home) : null,
      homeSm && homeSm.official,
    ].filter(Boolean),
    predicted: (homeSm && homeSm.predicted) || (espnOut && espnOut.home && espnOut.home.kind === 'predicted' ? espnOut.home : null),
    previous: espnOut && espnOut.prevHome,
  }) || out.home || null;

  out.away = chooseLineupSide({
    official: [
      espnOfficial && hasXi(espnOut && espnOut.away) ? Object.assign({ at: espnOut.awayAt || 0, source: 'espn' }, espnOut.away) : null,
      awaySm && awaySm.official,
    ].filter(Boolean),
    predicted: (awaySm && awaySm.predicted) || (espnOut && espnOut.away && espnOut.away.kind === 'predicted' ? espnOut.away : null),
    previous: espnOut && espnOut.prevAway,
  }) || out.away || null;

  if (hasXi(out.home) && hasXi(out.away)) {
    if (out.home.kind === 'official' || out.away.kind === 'official') {
      if (!espnOfficial || out.state === 'pending' || out.state === 'no-event' || out.state === 'final-nolineup' || out.state === 'unknown') {
        out.state = 'announced';
      }
      out.noteZh = '本场首发以最新官方上阵为准。';
    } else if (out.home.kind === 'previous' || out.away.kind === 'previous') {
      // keep warning state
    }
  }
  return out;
}

function splitSidelined(list) {
  const home = [];
  const away = [];
  for (const s of list || []) {
    if (s.side === 'home') home.push(s);
    else if (s.side === 'away') away.push(s);
  }
  return { home, away };
}

function isBanReason(reason, type) {
  const s = `${reason || ''} ${type || ''}`.toLowerCase();
  return /停赛|红牌|黄牌|suspen/.test(s);
}

module.exports = {
  TYPE_STARTER,
  TYPE_BENCH,
  hasXi,
  isPredictedType,
  sideFromSmRows,
  chooseLineupSide,
  mergeLineupPack,
  isOfficialState,
  formationOf,
  smPlayer,
  splitSidelined,
  isBanReason,
};
