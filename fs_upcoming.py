"""Flashscore üzerinden önümüzdeki 36 saatte oynanacak maçların Bet365 / William Hill oranlarını çeker.

Bu maçlar kuponlarda doğrudan kullanılmaz; sadece aynı iddaa maçında olmayan marketleri (İY/MS, kesin skor)
tamamlamak için eşleştirilir.
Çıktı: data/fs_upcoming.json (her çalıştırmada yeniden yazılır)
"""
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor

import fs_collect as F

HORIZON = 36 * 3600
OUT = os.path.join(F.DATA, "fs_upcoming.json")


def day_feed(day):
    """Flashscore'un o günkü tüm futbol maçları (day=0 bugün, 1 yarın)."""
    r = F.get(f"{F.FEED}f_1_{day}_3_en_1", F.FEED_HDR)
    if not r:
        return []
    now, out = time.time(), []
    for rec in r.text.split("¬~"):
        f = {}
        for kv in rec.split("¬"):
            if "÷" in kv:
                k, v = kv.split("÷", 1)
                f.setdefault(k, v)
        if "AA" not in f or f.get("AB") != "1" or not f.get("AD"):
            continue
        ts = int(f["AD"])
        if now < ts < now + HORIZON:
            out.append({"id": f["AA"], "ts": ts, "h": f.get("AE", ""), "a": f.get("AF", ""),
                        "ja": f.get("JA"), "jb": f.get("JB")})
    return out


def main():
    from kupon import load, match
    iddaa = [e for e in load("iddaa.json").values() if "fh" not in e and time.time() < e["ts"] < time.time() + HORIZON]
    fs = [e for d in (0, 1) for e in day_feed(d)]
    pairs = match(iddaa, fs)
    db = {}
    with ThreadPoolExecutor(8) as ex:
        for (ie, e), (eid, o) in zip(pairs, ex.map(F.fetch_odds, [e for _, e in pairs])):
            if o:
                db[eid] = {"id": eid, "iid": ie["id"], "ts": e["ts"], "lg": ie["lg"], "h": e["h"], "a": e["a"],
                           "src": "fs", "odds": o}
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("{\n" + ",\n".join(json.dumps(k) + ":" + json.dumps(v, ensure_ascii=False, separators=(",", ":"))
                                     for k, v in sorted(db.items())) + "\n}\n")
    print(f"Bet365/WH: {len(db)} iddaa maçının oranı ({len(pairs)} eşleşme / {len(iddaa)} iddaa / {len(fs)} Flashscore maçı)")


if __name__ == "__main__":
    main()
