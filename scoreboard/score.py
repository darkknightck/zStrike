"""Đọc log sự kiện của server CS (cstrike/logs/*.log) và ghi bảng điểm ra score.json.

Chạy trong container riêng (profile mặc định của docker-compose.122.yml).
Chỉ dùng thư viện chuẩn. Trang web đọc /live/score.json để vẽ bảng điểm (phím Tab).
"""

import glob
import json
import os
import re
import time

LOG_DIR = os.environ.get("LOG_DIR", "/logs")
OUT = os.environ.get("OUT", "/out/score.json")
INTERVAL = float(os.environ.get("INTERVAL", "1"))

# "Tên<userid><steamid><TEAM>"
P = r'"(?P<{0}>.+?)<(?P<{0}_id>-?\d+)><[^>]*><(?P<{0}_team>[^>]*)>"'
RE_PREFIX = re.compile(r"^L \d\d/\d\d/\d{4} - \d\d:\d\d:\d\d: ")
RE_KILL = re.compile(P.format("k") + r" killed " + P.format("v") + r' with "(?P<w>[^"]*)"')
RE_SUICIDE = re.compile(P.format("p") + r" committed suicide with")
RE_JOIN = re.compile(P.format("p") + r' joined team "(?P<t>[^"]+)"')
RE_ENTER = re.compile(P.format("p") + r" entered the game")
RE_LEAVE = re.compile(P.format("p") + r" disconnected")
RE_NAME = re.compile(P.format("p") + r' changed name to "(?P<n>[^"]+)"')
RE_TEAMSCORE = re.compile(r'Team "(?P<t>[^"]+)" scored "(?P<s>-?\d+)"')
RE_MAP = re.compile(r'(?:Started map|Loading map) "(?P<m>[^"]+)"')
RE_RESTART = re.compile(r'World triggered "(?:Restart_Round_|Game_Commencing)')

TEAM = {"CT": "CT", "TERRORIST": "T", "T": "T", "SPECTATOR": "SPEC"}


def team_of(raw):
    return TEAM.get(raw.upper(), "")


def parse(lines):
    players = {}  # userid -> dict
    score = {"CT": 0, "T": 0}
    current_map = ""

    def get(uid, name, raw_team=""):
        p = players.setdefault(uid, {"name": name, "team": "", "kills": 0, "deaths": 0, "frags": 0})
        p["name"] = name
        t = team_of(raw_team)
        if t:
            p["team"] = t
        return p

    for line in lines:
        line = RE_PREFIX.sub("", line.strip())
        if m := RE_MAP.search(line):
            current_map = m["m"]
            players.clear()
            score = {"CT": 0, "T": 0}
        elif RE_RESTART.search(line):
            for p in players.values():
                p.update(kills=0, deaths=0, frags=0)
            score = {"CT": 0, "T": 0}
        elif m := RE_KILL.search(line):
            k = get(m["k_id"], m["k"], m["k_team"])
            v = get(m["v_id"], m["v"], m["v_team"])
            v["deaths"] += 1
            if k is v:
                k["frags"] -= 1
            elif k["team"] and k["team"] == v["team"]:
                k["frags"] -= 1  # bắn đồng đội
            else:
                k["kills"] += 1
                k["frags"] += 1
        elif m := RE_SUICIDE.search(line):
            p = get(m["p_id"], m["p"], m["p_team"])
            p["deaths"] += 1
            p["frags"] -= 1
        elif m := RE_JOIN.search(line):
            p = get(m["p_id"], m["p"])
            p["team"] = team_of(m["t"])
        elif m := RE_ENTER.search(line):
            get(m["p_id"], m["p"], m["p_team"])
        elif m := RE_NAME.search(line):
            get(m["p_id"], m["n"], m["p_team"])
        elif m := RE_LEAVE.search(line):
            players.pop(m["p_id"], None)
        elif m := RE_TEAMSCORE.search(line):
            t = team_of(m["t"])
            if t in score:
                score[t] = int(m["s"])

    return {
        "map": current_map,
        "teams": score,
        "players": sorted(players.values(), key=lambda p: (-p["frags"], p["deaths"], p["name"])),
        "updated": int(time.time()),
    }


def latest_log():
    files = glob.glob(os.path.join(LOG_DIR, "*.log"))
    return max(files, key=os.path.getmtime) if files else None


def main():
    last = None
    while True:
        try:
            path = latest_log()
            if path:
                stat = os.stat(path)
                key = (path, stat.st_size, stat.st_mtime)
                if key != last:
                    with open(path, encoding="utf-8", errors="replace") as f:
                        data = parse(f)
                    tmp = OUT + ".tmp"
                    with open(tmp, "w", encoding="utf-8") as f:
                        json.dump(data, f, ensure_ascii=False)
                    os.replace(tmp, OUT)  # ghi nguyên tử, trang web không đọc phải file dở
                    last = key
        except Exception as e:  # noqa: BLE001 - không để container chết vì 1 dòng log lạ
            print("score error:", e, flush=True)
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
