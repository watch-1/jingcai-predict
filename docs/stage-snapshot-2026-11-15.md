# Current-stage source backup — 2026-11-15 (Asia/Shanghai, UTC+8)

This branch is a source snapshot, **not a deployment approval or a release**.
It preserves accumulated local work since main: lineup selection/layout and assets,
club/player names, match squad values, odds refresh, prefetching, player radar,
form-window xG (surface SCHEMA 5), popup UI, source tools and regression tests.

## Deployment boundaries
- National-team ruler (`lib/unl-ruler.js` and related radar/UI/tests) and fixed-club
  scale/ruler drafts are **local-only, NOT approved for deployment**. Their presence
  here must not be interpreted as permission to enable or publish them.
- Parent reported production website 2.1.6 / 333; local `VERSION.txt` and package
  version intentionally remain 2.1.5 / 332. Android manifest is preserved as found
  (2.1.5 / 347), not synchronized to a release. APK355 work is separate.
- Parent reported form-xG deployed at 15:51 CST (Asia/Shanghai); source includes
  SCHEMA 5 and website cache token `216lu6`. No deployment/restart/build was done
  for this snapshot. Existing PRs #166 and #148 remain unmerged.

## Exclusions / security
No .env credentials, JPUSH values, keystores, keys, APKs, node_modules, generated
warehouse/radar data, SQLite DBs, Android build output, previews or Python bytecode
are added. Previously tracked `android/release.keystore`, `android/build.log` and
`data/player-match.sqlite` are removed from this branch tip's index only; their
local files are preserved. Existing ancestor history is not rewritten, so an old
tracked signing key remains a historical security concern requiring separate
owner review/rotation. Changed squad-name cache JSON stays local.

## Lightweight verification
Passed: `node test/sm-surface-form-xg-test.js`, `node test/sm-surface-xg-test.js`,
`node test/sm-surface-test.js`, `node test/lineup-select-test.js`,
`node test/match-squad-value-test.js`, `node test/unl-ruler-test.js`,
`node test/match-radar-xg-draft-test.js`.
No full release build or full historical test suite was attempted.
