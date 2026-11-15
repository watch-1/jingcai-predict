#!/usr/bin/env python3
"""Merge rich SportMonks extracts into data/radar/player-match-rich.sqlite.

Inputs (read-only):
  - struct_eval_playerbase/raw_item{4,5,6,7,8,9}_*.csv
  - jingcai-predict/data/radar/{fixtures,players,teams}.csv
  - ml-baseline-wdl/data/sm-lineups/match-packs/*.json
Writes only under jingcai-predict/data/radar/.
player_match / team_match include xg and xgot columns (NULL unless the
extract already has them). Use append-radar-from-fixtures.py --update-xg
to fill official SportMonks xG after packs have xGLineup / xGFixture.
"""
from __future__ import annotations

import csv
import json
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path("/workspace/jingcai-predict")
OUT = ROOT / "data" / "radar" / "player-match-rich.sqlite"
EXTRACT = ROOT / "data" / "radar"
RAW = Path("/workspace/ml-baseline-wdl/struct_eval_playerbase")
PACKS = Path("/workspace/ml-baseline-wdl/data/sm-lineups/match-packs")

# Domestic league competitions only. Cups and continental competitions
# stay out of player peer pools.
CLUB_LEAGUES = {
    "西甲", "英超", "意甲", "德甲", "法甲", "英冠", "荷甲", "葡超", "瑞超",
    "美职", "韩职", "挪超", "日职", "德乙", "芬超", "澳超", "法乙", "荷乙",
    "日乙", "英甲", "巴甲", "沙职", "土超", "比甲", "丹超", "苏超",
    "俄超", "乌超", "哈萨克超", "罗甲", "希超", "摩尔多瓦联赛",
    "克甲", "塞超", "塞浦路斯甲", "亚美尼亚超",
    "Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1",
    "Championship", "Eredivisie", "Primeira Liga", "Super League",
    "Major League Soccer", "K League 1", "Eliteserien", "J1 League",
    "2. Bundesliga", "Veikkausliiga", "A-League", "Ligue 2",
    "Eerste Divisie", "J2 League", "League One", "Süper Lig",
    "Pro League", "Jupiler Pro League", "Allsvenskan", "Ekstraklasa",
    "Czech Liga", "Superliga", "Premiership", "HNL", "Liga I",
    "Super League 1", "Primera División", "Thai League 1", "NB I",
    "Segunda Liga", "Super Liga", "1. Division",
}

# Canonical Chinese labels for known SM league_ids (from match-packs).
LEAGUE_ID_ZH = {}  # filled from packs


def fnum(x):
    if x is None or x == "":
        return None
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def load_csv(path, key_fields):
    out = {}
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            key = tuple(str(row[k]) for k in key_fields)
            out[key] = row
    return out


def main():
    print("loading match-packs…", flush=True)
    fid_pack = {}
    lid_comp = defaultdict(Counter)
    team_names = defaultdict(set)  # sm_id -> names
    for p in PACKS.glob("*.json"):
        o = json.loads(p.read_text())
        fid = str(o.get("smFixtureId") or "")
        fid_pack[fid] = o
        comp = o.get("competition") or ""
        # league_id comes later from fixtures.csv
        for loc, smk, zhk, enk in (
            ("home", "homeSmId", "homeZh", None),
            ("away", "awaySmId", "awayZh", None),
        ):
            sm = o.get(smk)
            zh = o.get(zhk)
            if sm and zh:
                team_names[int(sm)].add(zh)
        for part in o.get("participants") or []:
            sid = part.get("id")
            nm = part.get("name")
            if sid and nm:
                team_names[int(sid)].add(nm)

    print("loading extract fixtures/teams/players…", flush=True)
    fixtures = list(csv.DictReader(open(EXTRACT / "fixtures.csv")))
    teams = list(csv.DictReader(open(EXTRACT / "teams.csv")))
    # players extract is the base (goals/shots/yellow/tb + name)
    # Join raw item CSVs by (fid, player_id)

    print("loading raw item CSVs (this is the slow bit)…", flush=True)
    item4 = load_csv(RAW / "raw_item4_cc_players.csv", ("fid", "player_id"))
    item5 = load_csv(RAW / "raw_item5_holdup_players.csv", ("fid", "player_id"))
    item6 = load_csv(RAW / "raw_item6_defense_players.csv", ("fid", "player_id"))
    item7 = load_csv(RAW / "raw_item7_buildup_players.csv", ("fid", "player_id"))
    item8 = load_csv(RAW / "raw_item8_gk_players.csv", ("fid", "player_id"))
    item9 = load_csv(RAW / "raw_item9_press_players.csv", ("fid", "player_id"))
    print(
        f"  item4={len(item4)} item5={len(item5)} item6={len(item6)} "
        f"item7={len(item7)} item8={len(item8)} item9={len(item9)}",
        flush=True,
    )

    # league_id -> competition from packs
    for fr in fixtures:
        p = fid_pack.get(str(fr["fid"]))
        if p and p.get("competition"):
            lid_comp[str(fr["league_id"])][p["competition"]] += 1
    league_zh = {}
    for lid, c in lid_comp.items():
        league_zh[lid] = c.most_common(1)[0][0]

    fx_meta = {}
    for fr in fixtures:
        fid = str(fr["fid"])
        pack = fid_pack.get(fid) or {}
        lid = str(fr.get("league_id") or "")
        comp = pack.get("competition") or league_zh.get(lid) or ""
        date = (fr.get("starting_at") or "")[:10]
        # jingcai pack date is preferred when present (Asia/Shanghai business date)
        if pack.get("date"):
            date = pack["date"]
        fx_meta[fid] = {
            "fid": int(fid),
            "league_id": int(lid) if lid else None,
            "season_id": int(fr["season_id"]) if fr.get("season_id") else None,
            "starting_at": fr.get("starting_at") or "",
            "date": date,
            "name": fr.get("name") or pack.get("homeZh", "") + " vs " + pack.get("awayZh", ""),
            "competition": comp,
            "is_club_league": 1 if comp in CLUB_LEAGUES else 0,
            "home_sm": int(fr["home_sm"]) if fr.get("home_sm") else None,
            "away_sm": int(fr["away_sm"]) if fr.get("away_sm") else None,
            "ft_home": fnum(fr.get("ft_home")),
            "ft_away": fnum(fr.get("ft_away")),
            "has_tb": 1 if str(fr.get("has_tb")) == "1" else 0,
            "n_lineups": int(fr["n_lineups"]) if fr.get("n_lineups") else 0,
            "jc_match_id": Path(next(iter([]), "")).stem if False else (None),
        }
        # jc match id from pack filename — store if we have the pack object
        # We didn't keep the path; look at matchId field
        if pack.get("matchId"):
            fx_meta[fid]["jc_match_id"] = str(pack["matchId"])

    print(f"fixtures {len(fx_meta)} club-league "
          f"{sum(1 for v in fx_meta.values() if v['is_club_league'])}", flush=True)
    print("competitions:", Counter(v["competition"] or "?" for v in fx_meta.values()).most_common(15))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        OUT.unlink()
    con = sqlite3.connect(str(OUT))
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=OFF")
    con.execute(
        """
        CREATE TABLE fixtures (
          fid INTEGER PRIMARY KEY,
          league_id INTEGER,
          season_id INTEGER,
          starting_at TEXT,
          date TEXT,
          name TEXT,
          competition TEXT,
          is_club_league INTEGER,
          home_sm INTEGER,
          away_sm INTEGER,
          ft_home REAL,
          ft_away REAL,
          has_tb INTEGER,
          n_lineups INTEGER,
          jc_match_id TEXT
        )
        """
    )
    con.execute(
        """
        CREATE TABLE team_match (
          fid INTEGER,
          team_sm INTEGER,
          loc TEXT,
          competition TEXT,
          is_club_league INTEGER,
          date TEXT,
          goals REAL,
          shots_on_target REAL,
          shots_insidebox REAL,
          shots_total REAL,
          key_passes REAL,
          big_chances_created REAL,
          corners REAL,
          ball_possession REAL,
          successful_passes_percentage REAL,
          successful_dribbles REAL,
          tackles REAL,
          interceptions REAL,
          duels_won REAL,
          goals_conceded REAL,
          sot_against REAL,
          xg REAL,
          xgot REAL,
          PRIMARY KEY (fid, loc)
        )
        """
    )
    con.execute(
        """
        CREATE TABLE player_match (
          fid INTEGER,
          player_id INTEGER,
          team_id INTEGER,
          pos_id INTEGER,
          dpos INTEGER,
          minutes REAL,
          name TEXT,
          date TEXT,
          competition TEXT,
          is_club_league INTEGER,
          has_tb INTEGER,
          goals REAL,
          shots_total REAL,
          shots_on REAL,
          yellowcards REAL,
          through_balls REAL,
          through_balls_won REAL,
          assists REAL,
          kp REAL,
          cc REAL,
          bcc REAL,
          touches REAL,
          total_duels REAL,
          duels_won REAL,
          duels_lost REAL,
          successful_dribbles REAL,
          dispossessed REAL,
          aer_w REAL,
          aer_l REAL,
          tackles REAL,
          interceptions REAL,
          dribbled_past REAL,
          ball_recovery REAL,
          clearances REAL,
          blocked_shots REAL,
          fouls REAL,
          passes REAL,
          acc_passes REAL,
          long_balls REAL,
          long_balls_won REAL,
          passes_in_final_third REAL,
          saves REAL,
          saves_insidebox REAL,
          gk_goals_conceded REAL,
          goals_conceded REAL,
          good_high_claim REAL,
          punches REAL,
          xg REAL,
          xgot REAL,
          PRIMARY KEY (fid, player_id)
        )
        """
    )
    con.execute(
        """
        CREATE TABLE teams (
          sm_id INTEGER PRIMARY KEY,
          names TEXT
        )
        """
    )

    con.executemany(
        "INSERT INTO fixtures VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
            (
                v["fid"], v["league_id"], v["season_id"], v["starting_at"], v["date"],
                v["name"], v["competition"], v["is_club_league"], v["home_sm"],
                v["away_sm"], v["ft_home"], v["ft_away"], v["has_tb"],
                v["n_lineups"], v.get("jc_match_id"),
            )
            for v in fx_meta.values()
        ],
    )

    tm_rows = []
    for r in teams:
        fid = str(r["fid"])
        meta = fx_meta.get(fid) or {}
        tm_rows.append((
            int(fid),
            int(r["team_sm"]) if r.get("team_sm") else None,
            r.get("loc"),
            meta.get("competition"),
            meta.get("is_club_league", 0),
            meta.get("date"),
            fnum(r.get("goals")),
            fnum(r.get("shots_on_target")),
            fnum(r.get("shots_insidebox")),
            fnum(r.get("shots_total")),
            fnum(r.get("key_passes")),
            fnum(r.get("big_chances_created")),
            fnum(r.get("corners")),
            fnum(r.get("ball_possession")),
            fnum(r.get("successful_passes_percentage")),
            fnum(r.get("successful_dribbles")),
            fnum(r.get("tackles")),
            fnum(r.get("interceptions")),
            fnum(r.get("duels_won")),
            fnum(r.get("goals_conceded")),
            fnum(r.get("sot_against")),
            fnum(r.get("xg")),
            fnum(r.get("xgot")),
        ))
        if r.get("team_sm"):
            # already have names from packs
            pass
    con.executemany(
        "INSERT INTO team_match VALUES (" + ",".join("?" * 23) + ")",
        tm_rows,
    )

    def g(row, *keys):
        if not row:
            return None
        for k in keys:
            if k in row and row[k] not in (None, ""):
                return fnum(row[k])
        return None

    print("merging player rows…", flush=True)
    pl_rows = []
    with open(EXTRACT / "players.csv", newline="") as f:
        for r in csv.DictReader(f):
            fid = str(r["fid"])
            pid = str(r["player_id"])
            key = (fid, pid)
            a4, a5, a6, a7, a8, a9 = (
                item4.get(key), item5.get(key), item6.get(key),
                item7.get(key), item8.get(key), item9.get(key),
            )
            meta = fx_meta.get(fid) or {}
            # aeriels-won/lost (research used these, not the messy aerials totals)
            aer_w = g(a5, "aer_w")
            aer_l = g(a5, "aer_l")
            blocked = g(a6, "blocked_shots")
            if blocked is None:
                blocked = g(a6, "shots_blocked")
            recov = g(a6, "ball_recovery")
            if recov is None:
                recov = g(a9, "ball_recovery")
            tackles = g(a6, "tackles")
            if tackles is None:
                tackles = g(a9, "tackles")
            interceptions = g(a6, "interceptions")
            if interceptions is None:
                interceptions = g(a9, "interceptions")
            fouls = g(a6, "fouls")
            if fouls is None:
                fouls = g(a9, "fouls")
            dispossessed = g(a5, "dispossessed")
            if dispossessed is None:
                dispossessed = g(a7, "dispossessed")
            if dispossessed is None:
                dispossessed = g(a9, "dispossessed")
            passes = g(a7, "passes")
            if passes is None:
                passes = g(a5, "passes")
            pl_rows.append((
                int(fid),
                int(pid) if pid else None,
                int(r["team_id"]) if r.get("team_id") else None,
                int(float(r["pos_id"])) if r.get("pos_id") else None,
                int(float(r["dpos"])) if r.get("dpos") else None,
                fnum(r.get("minutes")),
                r.get("name") or "",
                meta.get("date"),
                meta.get("competition"),
                meta.get("is_club_league", 0),
                meta.get("has_tb", 0),
                fnum(r.get("goals")),
                fnum(r.get("shots_total")),
                fnum(r.get("shots_on")),
                fnum(r.get("yellowcards")),
                fnum(r.get("through_balls")),  # already blank when fixture has no TB
                fnum(r.get("through_balls_won")),
                g(a4, "assists"),
                g(a4, "kp"),
                g(a4, "cc"),
                g(a4, "bcc"),
                g(a5, "touches"),
                g(a5, "total_duels"),
                g(a5, "duels_won"),
                g(a5, "duels_lost"),
                g(a5, "successful_dribbles"),
                dispossessed,
                aer_w,
                aer_l,
                tackles,
                interceptions,
                g(a6, "dribbled_past"),
                recov,
                g(a6, "clearances"),
                blocked,
                fouls,
                passes,
                g(a7, "acc_passes"),
                g(a7, "long_balls"),
                g(a7, "long_balls_won"),
                g(a9, "passes_in_final_third"),
                g(a8, "saves"),
                g(a8, "saves_insidebox"),
                g(a8, "gk_goals_conceded"),
                g(a8, "goals_conceded"),
                g(a8, "good_high_claim"),
                g(a8, "punches"),
                None,  # xg: filled by append-radar-from-fixtures.py --update-xg
                None,  # xgot
            ))
    con.executemany(
        "INSERT OR REPLACE INTO player_match VALUES (" + ",".join("?" * 49) + ")",
        pl_rows,
    )

    con.executemany(
        "INSERT INTO teams VALUES (?,?)",
        [(sid, " | ".join(sorted(names))) for sid, names in team_names.items()],
    )

    con.execute("CREATE INDEX idx_pm_player ON player_match(player_id, date)")
    con.execute("CREATE INDEX idx_pm_comp ON player_match(competition, is_club_league, date)")
    con.execute("CREATE INDEX idx_tm_comp ON team_match(competition, is_club_league, date)")
    con.execute("CREATE INDEX idx_fx_date ON fixtures(date, competition)")
    con.commit()

    n_pm = con.execute("SELECT COUNT(*) FROM player_match").fetchone()[0]
    n_club = con.execute("SELECT COUNT(*) FROM player_match WHERE is_club_league=1").fetchone()[0]
    guler = con.execute(
        "SELECT COUNT(*), SUM(minutes), SUM(COALESCE(goals,0)), SUM(CASE WHEN is_club_league=1 THEN minutes ELSE 0 END) "
        "FROM player_match WHERE player_id=37547467"
    ).fetchone()
    doku = con.execute(
        "SELECT COUNT(*), SUM(minutes), SUM(COALESCE(goals,0)), SUM(CASE WHEN is_club_league=1 THEN minutes ELSE 0 END), "
        "SUM(CASE WHEN competition='英超' THEN minutes ELSE 0 END) "
        "FROM player_match WHERE player_id=23697990"
    ).fetchone()
    print(f"wrote {OUT} pm={n_pm} club_rows={n_club}")
    print(f"Güler apps={guler[0]} mins={guler[1]} goals={guler[2]} club_mins={guler[3]}")
    print(f"Doku apps={doku[0]} mins={doku[1]} goals={doku[2]} club_mins={doku[3]} PL_mins={doku[4]}")
    # Güler 西甲 minutes
    print("Güler by comp:", list(con.execute(
        "SELECT competition, COUNT(*), SUM(minutes), SUM(COALESCE(goals,0)) FROM player_match "
        "WHERE player_id=37547467 GROUP BY 1"
    )))
    print("Doku by comp:", list(con.execute(
        "SELECT competition, COUNT(*), SUM(minutes), SUM(COALESCE(goals,0)) FROM player_match "
        "WHERE player_id=23697990 GROUP BY 1"
    )))
    con.close()
    print("done")


if __name__ == "__main__":
    main()
