"""Flashscore'dan önümüzdeki 36 saatte oynanacak maçları ve oranlarını (1xBet) çeker.

iddaa bülteni İY/MS oranlarını çoğu maç için yayınlamadığından İY/MS kuponları bu veriyle hazırlanır.
Çıktı: data/fs_upcoming.json (her çalıştırmada yeniden yazılır)
"""
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor

import fs_collect as F

HORIZON = 36 * 3600
OUT = os.path.join(F.DATA, "fs_upcoming.json")


def fixtures(path):
    r = F.get(f"https://www.flashscore.com/football/{path}/fixtures/")
    m = re.search(r"cjs\.initialFeeds\['fixtures'\]\s*=\s*\{\s*data:\s*`(.*?)`", r.text, re.S) if r else None
    if not m:
        return []
    now, out, league = time.time(), [], path
    for rec in m.group(1).split("¬~"):
        f = {}
        for kv in rec.split("¬"):
            if "÷" in kv:
                k, v = kv.split("÷", 1)
                f.setdefault(k, v)
        if "ZA" in f:
            league = f["ZA"]
            continue
        if "AA" not in f or f.get("AB") != "1" or not f.get("AD"):
            continue
        ts = int(f["AD"])
        if now < ts < now + HORIZON:
            out.append({"id": f["AA"], "ts": ts, "lg": league, "h": f.get("AE", ""), "a": f.get("AF", ""),
                        "ja": f.get("JA"), "jb": f.get("JB")})
    return out


def main():
    with ThreadPoolExecutor(4) as ex:
        events = [e for evs in ex.map(fixtures, F.LEAGUES) for e in evs]
    db = {}
    with ThreadPoolExecutor(8) as ex:
        for e, (eid, o) in zip(events, ex.map(F.fetch_odds, events)):
            if o:
                db[eid] = {"id": eid, "ts": e["ts"], "lg": e["lg"], "h": e["h"], "a": e["a"], "src": "fs", "odds": o}
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("{\n" + ",\n".join(json.dumps(k) + ":" + json.dumps(v, ensure_ascii=False, separators=(",", ":"))
                                     for k, v in sorted(db.items())) + "\n}\n")
    print(f"flashscore: {len(db)} yaklaşan maç ({len(events)} fikstür)")


if __name__ == "__main__":
    main()
