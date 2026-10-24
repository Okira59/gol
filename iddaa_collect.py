"""iddaa.com bülteninden maç öncesi oranları ve biten maçların skorlarını kaydeder.

iddaa geçmiş oranları yayınlamadığı için bu betik düzenli çalıştırıldıkça (ör. 3-6 saatte bir)
data/iddaa.json içinde kendi oran geçmişini biriktirir.
- İlk görülen oran = açılış, maç başlamadan önceki son oran = kapanış.
- Sonuçlar son 3 günün iddaa canlı sonuç sayfasından alınır.
"""
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import requests

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"}
SB = "https://sportsbookv2.iddaa.com/sportsbook"
ST = "https://statisticsv2.iddaa.com"
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
FILE = os.path.join(DATA, "iddaa.json")
TR = timezone(timedelta(hours=3))
HORIZON = 36 * 3600  # sadece 36 saat içinde başlayacak maçların detay oranları

session = requests.Session()


def get_json(url, params=None, tries=3):
    for i in range(tries):
        try:
            r = session.get(url, headers=UA, params=params, timeout=25)
            if r.status_code == 200:
                return r.json()
        except (requests.RequestException, ValueError):
            pass
        time.sleep(1.5 * (i + 1))
    return None


def market_odds(markets):
    out = {}
    for m in markets or []:
        t, st, sov = m.get("t"), m.get("st"), m.get("sov")
        for o in m.get("o", []):
            n, odd = o.get("n"), o.get("odd")
            if odd is None:
                continue
            k = None
            if t == 1 and st == 1:
                k = {"1": "1", "0": "X", "2": "2"}.get(n)
            elif t == 2 and st == 101 and sov:
                k = ("o" if n == "Üst" else "u") + sov
            elif t == 2 and st == 60 and sov:
                k = ("io" if n == "Üst" else "iu") + sov
            elif t == 2 and st == 88:
                k = {"1": "i1", "0": "iX", "2": "i2"}.get(n)
            elif t == 2 and st == 90 and n and "/" in n:
                k = "hf" + n.replace("/", "")
            elif t == 2 and st == 89:
                k = {"Var": "kgv", "Yok": "kgy"}.get(n)
            if k:
                out[k] = round(float(odd), 2)
    return out


def snapshot(db):
    js = get_json(f"{SB}/events", {"st": 1, "type": 0, "version": 0})
    if not js or not js.get("isSuccess"):
        print("! iddaa bülteni alınamadı")
        return
    comps = get_json(f"{SB}/competitions") or {}
    cname = {c["i"]: c["n"] for c in comps.get("data") or []}
    now = time.time()
    events = [e for e in js["data"]["events"] if not e.get("il") and 0 < e.get("d", 0) - now < HORIZON]

    def detail(e):
        d = get_json(f"{SB}/event/{e['i']}")
        if d and d.get("isSuccess") and d.get("data"):
            return e, d["data"].get("m")
        return e, e.get("m")

    n = 0
    with ThreadPoolExecutor(6) as ex:
        for e, markets in ex.map(detail, events):
            odds = market_odds(markets)
            if not odds:
                continue
            rec = db.setdefault(str(e["i"]), {
                "id": str(e["i"]), "ts": e["d"], "lg": cname.get(e.get("ci"), str(e.get("ci"))),
                "h": e.get("hn", ""), "a": e.get("an", ""), "odds": {},
            })
            rec["ts"] = e["d"]
            for k, v in odds.items():
                if k in rec["odds"]:
                    rec["odds"][k][0] = v
                else:
                    rec["odds"][k] = [v, v]
            n += 1
    print(f"iddaa: {n} maçın oranı kaydedildi")


def results(db):
    today = datetime.now(TR).date()
    n = 0
    for back in range(0, 4):
        day = (today - timedelta(days=back)).isoformat()
        js = get_json(f"{ST}/live-results", {"sportId": 1, "date": day})
        if not js or not js.get("isSuccess"):
            continue
        sc = js["data"].get("sc") or {}
        for eid, s in sc.items():
            rec = db.get(str(eid))
            if not rec or s.get("s") != 6 or "fh" in rec:
                continue
            h, a = s.get("ht") or {}, s.get("at") or {}
            if "c" not in h or "c" not in a:
                continue
            rec["fh"], rec["fa"] = h["c"], a["c"]
            rec["hh"], rec["ha"] = h.get("ht"), a.get("ht")
            n += 1
    print(f"iddaa: {n} maçın sonucu eklendi")


def main():
    os.makedirs(DATA, exist_ok=True)
    db = {}
    if os.path.exists(FILE):
        with open(FILE, encoding="utf-8") as f:
            db = json.load(f)
    snapshot(db)
    results(db)
    cutoff = time.time() - 120 * 86400
    db = {k: v for k, v in db.items() if v["ts"] >= cutoff and ("fh" in v or v["ts"] > time.time() - 5 * 86400)}
    tmp = FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write("{\n" + ",\n".join(json.dumps(k) + ":" + json.dumps(v, ensure_ascii=False, separators=(",", ":"))
                                     for k, v in sorted(db.items())) + "\n}\n")
    os.replace(tmp, FILE)


if __name__ == "__main__":
    main()
