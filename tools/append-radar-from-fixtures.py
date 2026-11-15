#!/usr/bin/env python3
"""Append club-league fixtures from a SportMonks fixture-cache dir into
data/radar/player-match-rich.sqlite. Does not invent stats: missing types stay
NULL, except through-balls which follow the existing has_tb convention.

Example (on the box, after copying new fixture JSON):
  python3 tools/append-radar-from-fixtures.py \
    --fixtures /path/to/fixtures --sqlite data/radar/player-match-rich.sqlite \
    --leagues 600,208

  # After SportMonks xG has been written into already-ingested packs,
  # only fill xg / xgot (and team xg) on existing rows. Does not rewrite
  # other stats, and does not change production until you run this on
  # a chosen sqlite and rebuild an asof index.
  python3 tools/append-radar-from-fixtures.py \
    --fixtures /path/to/fixtures --sqlite data/radar/player-match-rich.sqlite \
    --update-xg --leagues 8,564
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

LEAGUE_ID_ZH = {
    600: "土超",
    208: "比甲",
    271: "丹超",
    501: "苏超",
    486: "俄超",
    393: "哈萨克超",
    426: "摩尔多瓦联赛",
    609: "乌超",
    474: "罗甲",
    325: "希超",
    244: "克甲",
    531: "塞超",
    253: "塞浦路斯甲",
    175: "亚美尼亚超",
}

# SportMonks type.code -> player_match column. First non-null wins.
CODE_TO_COL = {
    "minutes-played": "minutes",
    "goals": "goals",
    "shots-total": "shots_total",
    "shots-on-target": "shots_on",
    "yellowcards": "yellowcards",
    "yellow-cards": "yellowcards",
    "through-balls": "through_balls",
    "through-balls-won": "through_balls_won",
    "assists": "assists",
    "key-passes": "kp",
    "chances-created": "cc",
    "big-chances-created": "bcc",
    "touches": "touches",
    "total-duels": "total_duels",
    "duels-won": "duels_won",
    "duels-lost": "duels_lost",
    "successful-dribbles": "successful_dribbles",
    "dispossessed": "dispossessed",
    "aeriels-won": "aer_w",
    "aeriels-lost": "aer_l",
    "tackles": "tackles",
    "interceptions": "interceptions",
    "dribbled-past": "dribbled_past",
    "ball-recovery": "ball_recovery",
    "clearances": "clearances",
    "blocked-shots": "blocked_shots",
    "shots-blocked": "blocked_shots",
    "fouls": "fouls",
    "passes": "passes",
    "accurate-passes": "acc_passes",
    "long-balls": "long_balls",
    "long-balls-won": "long_balls_won",
    "passes-in-final-third": "passes_in_final_third",
    "saves": "saves",
    "saves-insidebox": "saves_insidebox",
    "goalkeeper-goals-conceded": "gk_goals_conceded",
    "goals-conceded": "goals_conceded",
    "good-high-claim": "good_high_claim",
    "punches": "punches",
}

PM_COLS = [
    "fid", "player_id", "team_id", "pos_id", "dpos", "minutes", "name", "date",
    "competition", "is_club_league", "has_tb", "goals", "shots_total", "shots_on",
    "yellowcards", "through_balls", "through_balls_won", "assists", "kp", "cc",
    "bcc", "touches", "total_duels", "duels_won", "duels_lost", "successful_dribbles",
    "dispossessed", "aer_w", "aer_l", "tackles", "interceptions", "dribbled_past",
    "ball_recovery", "clearances", "blocked_shots", "fouls", "passes", "acc_passes",
    "long_balls", "long_balls_won", "passes_in_final_third", "saves", "saves_insidebox",
    "gk_goals_conceded", "goals_conceded", "good_high_claim", "punches",
    "xg", "xgot",
]

TB_CODES = ("through-balls", "through-balls-won", "accurate-through-balls")

# SportMonks xG lineup / fixture types (xG Basic). Missing stays NULL, never 0.
TYPE_ID_XG = 5304
TYPE_ID_XGOT = 5305

TEAM_CODES = {
    "goals": "goals",
    "shots-on-target": "shots_on_target",
    "shots-insidebox": "shots_insidebox",
    "shots-total": "shots_total",
    "key-passes": "key_passes",
    "big-chances-created": "big_chances_created",
    "corners": "corners",
    "ball-possession": "ball_possession",
    "successful-passes-percentage": "successful_passes_percentage",
    "successful-dribbles": "successful_dribbles",
    "tackles": "tackles",
    "interceptions": "interceptions",
    "duels-won": "duels_won",
}
# team xg / xgot are filled from xGFixture, not from statistics.type codes


def typ_code(obj):
    t = obj.get("type") or {}
    return t.get("code") or t.get("name") or t.get("developer_name") or str(obj.get("type_id") or "")


def num(v):
    if v is None:
        return None
    if isinstance(v, dict):
        v = v.get("value")
        if isinstance(v, dict):
            v = v.get("value")
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def loc_of_participant(p):
    if isinstance(p.get("meta"), dict):
        return p["meta"].get("location")
    if isinstance(p.get("location"), str):
        return p.get("location")
    return None


def ft_goals(scores, participant_id, loc):
    if not scores:
        return None
    current = second = None
    for s in scores:
        desc = (s.get("description") or "").upper()
        pid = s.get("participant_id")
        sc = s.get("score") or {}
        g = sc.get("goals")
        part = sc.get("participant")
        ok = (pid == participant_id) or (part == loc)
        if not ok or g is None:
            continue
        if desc == "CURRENT":
            current = g
        elif desc in ("2ND_HALF", "FULL_TIME", "FT"):
            second = g
    return current if current is not None else second


def fx_date(fx):
    s = str(fx.get("starting_at") or "")
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10]
    ts = fx.get("starting_at_timestamp")
    if ts:
        try:
            n = float(ts)
            if n > 1e12:
                n /= 1000.0
            from datetime import datetime, timezone
            return datetime.fromtimestamp(n, tz=timezone.utc).date().isoformat()
        except (TypeError, ValueError, OSError):
            return None
    return None


def details_map(lu):
    det = {}
    for d in lu.get("details") or []:
        code = typ_code(d)
        v = num(d.get("data"))
        if code and v is not None and code not in det:
            det[code] = v
    return det


def xg_from_rows(rows, type_id):
    """First numeric data.value for type_id in an xG include array."""
    for x in rows or []:
        if not isinstance(x, dict):
            continue
        if x.get("type_id") == type_id:
            v = num(x.get("data"))
            if v is not None:
                return v
    return None


def lineup_xg(lu):
    rows = lu.get("xglineup") or lu.get("xGLineup") or []
    return {
        "xg": xg_from_rows(rows, TYPE_ID_XG),
        "xgot": xg_from_rows(rows, TYPE_ID_XGOT),
    }


def fixture_team_xg(fx):
    """Official team xG from xgfixture, keyed by participant_id."""
    rows = fx.get("xgfixture") or fx.get("xGFixture") or []
    out = {}
    for x in rows or []:
        if not isinstance(x, dict):
            continue
        pid = x.get("participant_id")
        if pid is None:
            continue
        bag = out.setdefault(int(pid), {"xg": None, "xgot": None})
        tid = x.get("type_id")
        v = num(x.get("data"))
        if v is None:
            continue
        if tid == TYPE_ID_XG and bag["xg"] is None:
            bag["xg"] = v
        elif tid == TYPE_ID_XGOT and bag["xgot"] is None:
            bag["xgot"] = v
    return out


def ensure_xg_columns(con):
    for table, cols in (
        ("player_match", ("xg", "xgot")),
        ("team_match", ("xg", "xgot")),
    ):
        have = {r[1] for r in con.execute(f"PRAGMA table_info({table})")}
        for col in cols:
            if col not in have:
                con.execute(f"ALTER TABLE {table} ADD COLUMN {col} REAL")


def parse_fixture(raw, league_zh):
    fx = raw.get("fixture") or raw
    if not isinstance(fx, dict) or fx.get("id") is None:
        return None
    fid = int(fx["id"])
    lid = fx.get("league_id")
    competition = league_zh.get(int(lid)) if lid is not None else None
    if not competition:
        return None
    date = fx_date(fx)
    loc_for = {}
    home_sm = away_sm = None
    team_names = {}
    for p in fx.get("participants") or []:
        loc = loc_of_participant(p)
        pid = p.get("id")
        if loc:
            loc_for[pid] = loc
        if loc == "home":
            home_sm = pid
        elif loc == "away":
            away_sm = pid
        name = p.get("name") or p.get("short_code") or ""
        if pid is not None and name:
            team_names[int(pid)] = name

    scores = fx.get("scores") or []
    ft_h = ft_goals(scores, home_sm, "home")
    ft_a = ft_goals(scores, away_sm, "away")

    by_part, by_loc = {}, {}
    for s in fx.get("statistics") or []:
        code = typ_code(s)
        v = num(s.get("data"))
        loc = s.get("location")
        pid = s.get("participant_id")
        if loc:
            by_loc.setdefault(loc, {})[code] = v
        if pid is not None:
            by_part.setdefault(pid, {})[code] = v

    def side_st(sm, loc):
        if sm in by_part:
            return by_part[sm]
        return by_loc.get(loc) or {}

    hst = side_st(home_sm, "home")
    ast = side_st(away_sm, "away")

    def team_row(sm, loc, st, opp):
        row = {
            "fid": fid,
            "team_sm": sm,
            "loc": loc,
            "competition": competition,
            "is_club_league": 1,
            "date": date,
        }
        for code, col in TEAM_CODES.items():
            row[col] = st.get(code)
        if row.get("goals") is None:
            row["goals"] = ft_h if loc == "home" else ft_a
        opp_goals = opp.get("goals")
        if opp_goals is None:
            opp_goals = ft_a if loc == "home" else ft_h
        row["goals_conceded"] = opp_goals
        row["sot_against"] = opp.get("shots-on-target")
        return row

    teams = [
        team_row(home_sm, "home", hst, ast),
        team_row(away_sm, "away", ast, hst),
    ]
    team_xg = fixture_team_xg(fx)
    for row in teams:
        bag = team_xg.get(int(row["team_sm"])) if row.get("team_sm") is not None else None
        row["xg"] = bag["xg"] if bag else None
        row["xgot"] = bag["xgot"] if bag else None

    lineups = fx.get("lineups") or []
    parsed = [(lu, details_map(lu)) for lu in lineups]
    has_tb = any(any(c in det for c in TB_CODES) for _, det in parsed)

    players = []
    for lu, det in parsed:
        mins = det.get("minutes-played")
        if mins is None or mins <= 0:
            continue
        pl = lu.get("player") or {}
        name = pl.get("display_name") or pl.get("name") or lu.get("player_name") or ""
        row = {k: None for k in PM_COLS}
        row.update({
            "fid": fid,
            "player_id": lu.get("player_id") or pl.get("id"),
            "team_id": lu.get("team_id"),
            "pos_id": lu.get("position_id") if lu.get("position_id") is not None else pl.get("position_id"),
            "dpos": pl.get("detailed_position_id"),
            "minutes": mins,
            "name": name,
            "date": date,
            "competition": competition,
            "is_club_league": 1,
            "has_tb": 1 if has_tb else 0,
        })
        for code, col in CODE_TO_COL.items():
            if col in ("minutes", "through_balls", "through_balls_won"):
                continue
            if det.get(code) is not None and row.get(col) is None:
                row[col] = det[code]
        if has_tb:
            row["through_balls"] = det.get("through-balls") or 0.0
            row["through_balls_won"] = det.get("through-balls-won") or 0.0
        xg = lineup_xg(lu)
        row["xg"] = xg["xg"]
        row["xgot"] = xg["xgot"]
        if row["player_id"] is None:
            continue
        players.append(row)

    fixture = {
        "fid": fid,
        "league_id": int(lid) if lid is not None else None,
        "season_id": fx.get("season_id"),
        "starting_at": fx.get("starting_at"),
        "date": date,
        "name": fx.get("name") or "",
        "competition": competition,
        "is_club_league": 1,
        "home_sm": home_sm,
        "away_sm": away_sm,
        "ft_home": ft_h,
        "ft_away": ft_a,
        "has_tb": 1 if has_tb else 0,
        "n_lineups": len(players),
        "jc_match_id": None,
    }
    return {"fixture": fixture, "teams": teams, "players": players, "team_names": team_names}


def apply_xg_update(con, raw):
    """Write xg/xgot onto existing rows for this fixture. Other stats untouched."""
    fx = raw.get("fixture") or raw
    if not isinstance(fx, dict) or fx.get("id") is None:
        return 0, 0
    fid = int(fx["id"])
    n_pl = n_tm = 0
    for lu in fx.get("lineups") or []:
        pl = lu.get("player") or {}
        pid = lu.get("player_id") or pl.get("id")
        if pid is None:
            continue
        bag = lineup_xg(lu)
        if bag["xg"] is None and bag["xgot"] is None:
            continue
        cur = con.execute(
            "UPDATE player_match SET xg=?, xgot=? WHERE fid=? AND player_id=?",
            (bag["xg"], bag["xgot"], fid, int(pid)),
        )
        n_pl += cur.rowcount or 0
    for pid, bag in fixture_team_xg(fx).items():
        if bag["xg"] is None and bag["xgot"] is None:
            continue
        cur = con.execute(
            "UPDATE team_match SET xg=?, xgot=? WHERE fid=? AND team_sm=?",
            (bag["xg"], bag["xgot"], fid, int(pid)),
        )
        n_tm += cur.rowcount or 0
    return n_pl, n_tm


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixtures", required=True)
    ap.add_argument("--sqlite", required=True)
    ap.add_argument("--leagues", default="600,208")
    ap.add_argument("--zh", default="", help="extra maps like 453:俄超,326:塞浦路斯甲")
    ap.add_argument("--update-xg", action="store_true",
                    help="only write xg/xgot onto existing player_match and team_match rows")
    ap.add_argument("--all-leagues", action="store_true",
                    help="do not filter by --leagues (useful with --update-xg)")
    args = ap.parse_args()

    league_zh = dict(LEAGUE_ID_ZH)
    if args.zh:
        for part in args.zh.split(","):
            if ":" not in part:
                continue
            k, v = part.split(":", 1)
            league_zh[int(k.strip())] = v.strip()
    want = {int(x) for x in args.leagues.split(",") if x.strip()}
    if not args.all_leagues:
        # keep names for wanted ids only
        league_zh = {k: v for k, v in league_zh.items() if k in want}

    fxdir = Path(args.fixtures)
    files = sorted(fxdir.glob("*.json"))
    con = sqlite3.connect(args.sqlite)
    ensure_xg_columns(con)
    existing = {r[0] for r in con.execute("SELECT fid FROM fixtures")}
    n_new = n_skip = n_bad = n_pl = 0
    n_xg_pl = n_xg_tm = 0
    fx_rows, tm_rows, pl_rows = [], [], []
    team_names = {}
    for i, path in enumerate(files, 1):
        try:
            raw = json.loads(path.read_text())
        except Exception as e:
            n_bad += 1
            print(f"BAD {path.name} {e}", file=sys.stderr)
            continue
        fx = raw.get("fixture") or raw
        lid = fx.get("league_id") if isinstance(fx, dict) else None
        if (not args.all_leagues) and (lid is None or int(lid) not in want):
            n_skip += 1
            continue
        fid = fx.get("id")
        if args.update_xg:
            if fid is None or int(fid) not in existing:
                n_skip += 1
                continue
            n_pl_u, n_tm_u = apply_xg_update(con, raw)
            if n_pl_u or n_tm_u:
                n_xg_pl += n_pl_u
                n_xg_tm += n_tm_u
                n_new += 1
            else:
                n_skip += 1
            continue
        if fid is not None and int(fid) in existing:
            n_skip += 1
            continue
        parsed = parse_fixture(raw, league_zh)
        if not parsed:
            n_bad += 1
            continue
        fx_rows.append(parsed["fixture"])
        tm_rows.extend(parsed["teams"])
        pl_rows.extend(parsed["players"])
        n_pl += len(parsed["players"])
        for sm, name in parsed["team_names"].items():
            team_names.setdefault(sm, set()).add(name)
        n_new += 1
        if i % 400 == 0:
            print(f"scan {i}/{len(files)} new={n_new} players={n_pl}", file=sys.stderr, flush=True)

    def tup(row, cols):
        return tuple(row.get(c) for c in cols)

    FX_COLS = [
        "fid", "league_id", "season_id", "starting_at", "date", "name",
        "competition", "is_club_league", "home_sm", "away_sm", "ft_home",
        "ft_away", "has_tb", "n_lineups", "jc_match_id",
    ]
    TM_COLS = [
        "fid", "team_sm", "loc", "competition", "is_club_league", "date",
        "goals", "shots_on_target", "shots_insidebox", "shots_total", "key_passes",
        "big_chances_created", "corners", "ball_possession",
        "successful_passes_percentage", "successful_dribbles", "tackles",
        "interceptions", "duels_won", "goals_conceded", "sot_against",
        "xg", "xgot",
    ]

    if not args.update_xg:
        con.executemany(
            "INSERT OR REPLACE INTO fixtures (" + ",".join(FX_COLS) + ") VALUES (" + ",".join("?" * len(FX_COLS)) + ")",
            [tup(r, FX_COLS) for r in fx_rows],
        )
        con.executemany(
            "INSERT OR REPLACE INTO team_match (" + ",".join(TM_COLS) + ") VALUES (" + ",".join("?" * len(TM_COLS)) + ")",
            [tup(r, TM_COLS) for r in tm_rows],
        )
        con.executemany(
            "INSERT OR REPLACE INTO player_match (" + ",".join(PM_COLS) + ") VALUES (" + ",".join("?" * len(PM_COLS)) + ")",
            [tup(r, PM_COLS) for r in pl_rows],
        )
    for sm, names in team_names.items():
        prev = con.execute("SELECT names FROM teams WHERE sm_id=?", (sm,)).fetchone()
        merged = " | ".join(sorted(names))
        if prev and prev[0]:
            have = {x.strip() for x in prev[0].split("|") if x.strip()}
            have.update(names)
            merged = " | ".join(sorted(have))
        con.execute("INSERT OR REPLACE INTO teams(sm_id, names) VALUES (?,?)", (sm, merged))
    con.commit()
    n_club = con.execute("SELECT COUNT(*) FROM fixtures WHERE is_club_league=1").fetchone()[0]
    by = list(con.execute(
        "SELECT competition, COUNT(*) FROM fixtures WHERE competition IN ({}) GROUP BY 1".format(
            ",".join("?" * len(league_zh))
        ),
        list(league_zh.values()),
    ))
    print(json.dumps({
        "new_fixtures": n_new,
        "skipped": n_skip,
        "bad": n_bad,
        "new_players": n_pl,
        "club_fixtures": n_club,
        "by_competition": by,
        "update_xg": bool(args.update_xg),
        "player_xg_updates": n_xg_pl,
        "team_xg_updates": n_xg_tm,
    }, ensure_ascii=False))
    con.close()


if __name__ == "__main__":
    main()
