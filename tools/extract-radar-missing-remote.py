#!/usr/bin/env python3
"""Read-only extract of missing radar fields from the production SM fixture cache.
Writes nothing under /opt/jingcai. Prints three CSV sections to stdout,
separated by '###SECTION name' markers. Progress on stderr.
"""
from __future__ import annotations

import csv
import io
import json
import sys
from pathlib import Path

FIX = Path("/opt/jingcai/data/sm-lineups/fixtures")

PLAYER_CODES = (
    "minutes-played",
    "goals",
    "shots-total",
    "shots-on-target",
    "yellowcards",
    "through-balls",
    "through-balls-won",
    "assists",  # useful cross-check
)

TEAM_CODES = (
    "goals",
    "shots-on-target",
    "shots-insidebox",
    "shots-total",
    "key-passes",
    "big-chances-created",
    "corners",
    "ball-possession",
    "successful-passes-percentage",
    "successful-dribbles",
    "tackles",
    "interceptions",
    "duels-won",
    "sot_against",  # computed
    "goals_conceded",  # computed
)

TB_CODES = ("through-balls", "through-balls-won", "accurate-through-balls")


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


def typ_code(obj):
    t = obj.get("type") or {}
    return t.get("code") or t.get("name") or t.get("developer_name") or str(obj.get("type_id") or "")


def loc_of_participant(p):
    if isinstance(p.get("meta"), dict):
        return p["meta"].get("location")
    if isinstance(p.get("location"), str):
        return p.get("location")
    return None


def ft_goals(scores, participant_id, loc):
    """CURRENT or 2ND_HALF cumulative FT goals."""
    if not scores:
        return None
    current = None
    second = None
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
    if current is not None:
        return current
    return second


def main():
    files = sorted(FIX.glob("*.json"))
    fx_buf = io.StringIO()
    pl_buf = io.StringIO()
    tm_buf = io.StringIO()
    fx_w = csv.DictWriter(
        fx_buf,
        fieldnames=[
            "fid", "league_id", "season_id", "starting_at", "name", "state_id",
            "home_sm", "away_sm", "ft_home", "ft_away", "has_tb", "n_lineups",
        ],
        lineterminator="\n",
    )
    pl_w = csv.DictWriter(
        pl_buf,
        fieldnames=[
            "fid", "player_id", "team_id", "pos_id", "dpos", "minutes",
            "name", "goals", "shots_total", "shots_on", "yellowcards",
            "through_balls", "through_balls_won",
        ],
        lineterminator="\n",
    )
    tm_w = csv.DictWriter(
        tm_buf,
        fieldnames=[
            "fid", "team_sm", "loc", "goals", "shots_on_target", "shots_insidebox",
            "shots_total", "key_passes", "big_chances_created", "corners",
            "ball_possession", "successful_passes_percentage", "successful_dribbles",
            "tackles", "interceptions", "duels_won", "goals_conceded", "sot_against",
        ],
        lineterminator="\n",
    )
    fx_w.writeheader()
    pl_w.writeheader()
    tm_w.writeheader()

    n_ok = n_bad = n_pl = 0
    for i, path in enumerate(files, 1):
        try:
            raw = json.loads(path.read_text())
        except Exception as e:
            n_bad += 1
            print(f"BAD {path.name} {e}", file=sys.stderr)
            continue
        fx = raw.get("fixture") or {}
        fid = fx.get("id")
        if fid is None:
            n_bad += 1
            continue

        loc_for = {}
        home_sm = away_sm = None
        for p in fx.get("participants") or []:
            loc = loc_of_participant(p)
            pid = p.get("id")
            if loc:
                loc_for[pid] = loc
            if loc == "home":
                home_sm = pid
            elif loc == "away":
                away_sm = pid

        scores = fx.get("scores") or []
        ft_h = ft_goals(scores, home_sm, "home")
        ft_a = ft_goals(scores, away_sm, "away")

        # team stats
        by_part = {}
        by_loc = {}
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

        def emit_team(sm, loc, st, opp):
            if not sm and not st:
                return
            tm_w.writerow({
                "fid": fid,
                "team_sm": sm if sm is not None else "",
                "loc": loc,
                "goals": st.get("goals") if st.get("goals") is not None else (ft_h if loc == "home" else ft_a),
                "shots_on_target": st.get("shots-on-target"),
                "shots_insidebox": st.get("shots-insidebox"),
                "shots_total": st.get("shots-total"),
                "key_passes": st.get("key-passes"),
                "big_chances_created": st.get("big-chances-created"),
                "corners": st.get("corners"),
                "ball_possession": st.get("ball-possession"),
                "successful_passes_percentage": st.get("successful-passes-percentage"),
                "successful_dribbles": st.get("successful-dribbles"),
                "tackles": st.get("tackles"),
                "interceptions": st.get("interceptions"),
                "duels_won": st.get("duels-won"),
                "goals_conceded": opp.get("goals") if opp.get("goals") is not None else (ft_a if loc == "home" else ft_h),
                "sot_against": opp.get("shots-on-target"),
            })

        emit_team(home_sm, "home", hst, ast)
        emit_team(away_sm, "away", ast, hst)

        lineups = fx.get("lineups") or []
        parsed = []
        has_tb = False
        for lu in lineups:
            det = {}
            for d in lu.get("details") or []:
                det[typ_code(d)] = num(d.get("data"))
            if any(c in det for c in TB_CODES):
                has_tb = True
            parsed.append((lu, det))
        n_lu = 0
        for lu, det in parsed:
            mins = det.get("minutes-played")
            if mins is None or mins <= 0:
                continue
            n_lu += 1
            pl = lu.get("player") or {}
            name = pl.get("display_name") or pl.get("name") or lu.get("player_name") or ""
            # Only emit through-ball values when this fixture has the type at all;
            # otherwise leave blank (not zero).
            tb = det.get("through-balls") if has_tb else None
            tbw = det.get("through-balls-won") if has_tb else None
            if has_tb:
                # In matches with the type, missing player values are 0 (same as research).
                if tb is None:
                    tb = 0.0
                if tbw is None:
                    tbw = 0.0
            pl_w.writerow({
                "fid": fid,
                "player_id": lu.get("player_id"),
                "team_id": lu.get("team_id"),
                "pos_id": lu.get("position_id") if lu.get("position_id") is not None else pl.get("position_id"),
                "dpos": pl.get("detailed_position_id"),
                "minutes": mins,
                "name": name,
                "goals": det.get("goals"),
                "shots_total": det.get("shots-total"),
                "shots_on": det.get("shots-on-target"),
                "yellowcards": det.get("yellowcards"),
                "through_balls": tb,
                "through_balls_won": tbw,
            })
            n_pl += 1

        fx_w.writerow({
            "fid": fid,
            "league_id": fx.get("league_id"),
            "season_id": fx.get("season_id"),
            "starting_at": fx.get("starting_at"),
            "name": fx.get("name") or "",
            "state_id": fx.get("state_id"),
            "home_sm": home_sm if home_sm is not None else "",
            "away_sm": away_sm if away_sm is not None else "",
            "ft_home": ft_h,
            "ft_away": ft_a,
            "has_tb": 1 if has_tb else 0,
            "n_lineups": n_lu,
        })
        n_ok += 1
        if i % 500 == 0:
            print(f"progress {i}/{len(files)} ok={n_ok} players={n_pl}", file=sys.stderr, flush=True)

    print(f"DONE ok={n_ok} bad={n_bad} players={n_pl} files={len(files)}", file=sys.stderr, flush=True)
    sys.stdout.write("###SECTION fixtures\n")
    sys.stdout.write(fx_buf.getvalue())
    sys.stdout.write("###SECTION players\n")
    sys.stdout.write(pl_buf.getvalue())
    sys.stdout.write("###SECTION teams\n")
    sys.stdout.write(tm_buf.getvalue())
    sys.stdout.flush()


if __name__ == "__main__":
    main()
