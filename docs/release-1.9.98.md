# 1.9.98 预测引擎升级（临场 / 背景 / 变盘 / 校准 / 爆冷验证）

## 新信号
- **变盘** `lib/odds-movement.js`: public sporttery odds history (`getFixedBonusV1`), opening→latest 胜平负/让球, implied-prob shift, ≥3pp = movement, ≥6pp = strong. Cached 20 min per match. Backfilled 6834 historical matches → `data/history/odds-history.jsonl`.
  - Backtest: movement direction alone hit 49.4% (market fav 52.7%) → **no lean weight**. Used as a confidence nudge: pick = favourite and favourite firmed ≥3pp → +2pp; drifted ≥3pp → −3pp (fav firmed hit 53.8% n=1706, flat 52.8% n=4483, drifted 48.4% n=645).
- **背景** `lib/signals.js buildContextSignal`: rest days (history + player DB dates), European fixture within 4 days before/after, derby table, 争冠/保级/欧战资格/无欲无求 from cached standings (only after ≥8 rounds), cup tag. Rest-edge backtest hit 31.2% → tag only (weight 0). Motivation unbacktestable (no point-in-time standings) → ±0.15.
- **临场** `buildIntelSignal`: key players = player DB (AF-keyed rows) minutes-share ≥60% ranked by rating/goal contribution; AF `/fixtures/lineups` only 0–90 min pre-KO, per-fixture cache, ≤1500 calls/day cap (`SIGNALS_AF_DAY_CAP`), reports inside 90 min refresh every 15 min until lineups land. Before lineups: injury list ∩ key players. Rotation = typical-XI overlap ≤6. Weights 0.3 / player (max 2), 0.25 rotation. Unbacktestable.
- Skipped: DeepSeek news tags (cost/latency, crawl not per-match structured); weather (no trivial free source wired).

## 校准 `tools/backtest-signals.js` → `data/history/calibration.json`
Point-in-time replica of synthesize (form/h2h/rest from strictly earlier dates; market = closing odds). Live card shows 「同类历史命中 x%（n）」 keyed by pick type × favourite implied band × movement (→ tier → coarse), hidden when n<30.

## 爆冷
1.9.97 rule (表态≠盘口) backtest: hit 22.9% n=651, ROI −23.4% (fav on same matches 52.1%). No tightened variant held out-of-sample (see report). Badge kept, shows honest history; `level=strong` = favourite drifted ≥2pp since opening (all-sample 26%, n=131, ROI −12.5%) — **not a validated edge**.

## 态度一致
Now by independent families: 盘面(赔率+变盘) and 状态(近况+过程) must both back the pick and no family leans against it.

## Misc
Removed remaining 仅供参考 / 数据来源 labels from predict UI; usefulness strip hides % when n<30; 模型体检 sheet (`/api/calibration`). ENGINE_REV 198 invalidates old report caches.
