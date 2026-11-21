# Local-only patches (2026-11-18): radar mem cap + AF fail-fast + quota persist

Do **not** ship these to production until reviewed. They were not applied to `/opt/jingcai` and were not applied to the live checkout copies of the matching prod files (so md5s stay comparable).

Apply later, if approved, from the repo root:

```
patch -p1 < patches/2026-11-18-oom-af/01-match-radar-mem-cap.patch
patch -p1 < patches/2026-11-18-oom-af/02-af-failfast-and-quota-persist.patch
```

What they do:

1. `lib/match-radar.js`: cache the slim index by **source file path**, not by every match date; keep at most 2 parsed indexes; evict the oldest.
2. `lib/live-stats.js`: persist `lastQuota` under `data/live-stats/af-quota.json` and reload it on startup; treat network/timeout/rate-limit as typed errors (`e.code`).
3. `lib/match-stats.js` and `lib/next-fixtures.js`: stop the season loop on the first network / timeout / rate-limit / upstream error; only continue when the **raw** (pre-translation) error is a season-access problem. Fall back to local / stale disk form immediately.
4. `lib/process-stats.js`: same raw-error classification (it already breaks on many errors; this makes season-access detection work after message translation).

Not included (still recommended later): prefetch throttling, MemoryMax, other map caps, DeepSeek balance.
