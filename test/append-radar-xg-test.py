#!/usr/bin/env python3
import importlib.util
import json
import sqlite3
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "append_radar", ROOT / "tools" / "append-radar-from-fixtures.py"
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

fx = {
    "fixture": {
        "id": 19134980,
        "league_id": 8,
        "starting_at": "2025-08-20 19:00:00",
        "name": "Arsenal vs Brentford",
        "participants": [
            {"id": 19, "name": "Arsenal", "meta": {"location": "home"}},
            {"id": 236, "name": "Brentford", "meta": {"location": "away"}},
        ],
        "scores": [
            {"description": "CURRENT", "participant_id": 19, "score": {"goals": 2, "participant": "home"}},
            {"description": "CURRENT", "participant_id": 236, "score": {"goals": 0, "participant": "away"}},
        ],
        "statistics": [],
        "lineups": [
            {
                "player_id": 19,
                "team_id": 19,
                "position_id": 27,
                "player_name": "Saka",
                "player": {"id": 19, "display_name": "Saka", "detailed_position_id": 156, "position_id": 27},
                "details": [
                    {"type": {"code": "minutes-played"}, "data": {"value": 90}},
                    {"type": {"code": "goals"}, "data": {"value": 1}},
                    {"type": {"code": "shots-on-target"}, "data": {"value": 2}},
                ],
                "xglineup": [
                    {"type_id": 5304, "data": {"value": 0.41}},
                    {"type_id": 5305, "data": {"value": 0.55}},
                ],
            },
            {
                "player_id": 20,
                "team_id": 236,
                "position_id": 25,
                "player_name": "Defender",
                "player": {"id": 20, "display_name": "Defender", "detailed_position_id": 148, "position_id": 25},
                "details": [
                    {"type": {"code": "minutes-played"}, "data": {"value": 90}},
                ],
                "xglineup": [],
            },
        ],
        "xgfixture": [
            {"type_id": 5304, "participant_id": 19, "location": "home", "data": {"value": 0.9776}},
            {"type_id": 5304, "participant_id": 236, "location": "away", "data": {"value": 0.4033}},
            {"type_id": 5305, "participant_id": 19, "location": "home", "data": {"value": 1.2}},
        ],
    }
}

parsed = mod.parse_fixture(fx, {8: "英超"})
assert parsed, "parse failed"
saka = next(p for p in parsed["players"] if p["player_id"] == 19)
assert saka["xg"] == 0.41, saka
assert saka["xgot"] == 0.55, saka
defender = next(p for p in parsed["players"] if p["player_id"] == 20)
assert defender["xg"] is None and defender["xgot"] is None
ars = next(t for t in parsed["teams"] if t["team_sm"] == 19)
assert ars["xg"] == 0.9776 and ars["xgot"] == 1.2
print("parse_fixture player + team xG OK")

# sqlite update path
td = tempfile.TemporaryDirectory()
db = Path(td.name) / "t.sqlite"
con = sqlite3.connect(db)
con.execute("CREATE TABLE fixtures (fid INTEGER PRIMARY KEY)")
con.execute("CREATE TABLE player_match (fid INTEGER, player_id INTEGER, minutes REAL)")
con.execute("CREATE TABLE team_match (fid INTEGER, team_sm INTEGER)")
con.execute("INSERT INTO fixtures(fid) VALUES (19134980)")
con.execute("INSERT INTO player_match(fid, player_id, minutes) VALUES (19134980, 19, 90)")
con.execute("INSERT INTO player_match(fid, player_id, minutes) VALUES (19134980, 20, 90)")
con.execute("INSERT INTO team_match(fid, team_sm) VALUES (19134980, 19)")
con.execute("INSERT INTO team_match(fid, team_sm) VALUES (19134980, 236)")
con.commit()
mod.ensure_xg_columns(con)
n_pl, n_tm = mod.apply_xg_update(con, fx)
assert n_pl == 1, n_pl  # only Saka has xG
assert n_tm == 2, n_tm
row = con.execute("SELECT xg, xgot FROM player_match WHERE player_id=19").fetchone()
assert row == (0.41, 0.55), row
row = con.execute("SELECT xg, xgot FROM player_match WHERE player_id=20").fetchone()
assert row == (None, None), row
row = con.execute("SELECT xg, xgot FROM team_match WHERE team_sm=19").fetchone()
assert row[0] == 0.9776 and row[1] == 1.2
con.close()
print("apply_xg_update leaves missing players as NULL OK")
print("append-radar xG tests passed")
