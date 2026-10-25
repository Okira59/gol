"""iddaa bültenindeki yaklaşan maçlardan otomatik kupon üretir ve eski kuponları sonuçlandırır.

Olasılık modeli: her seçimin marjı arındırılmış oran olasılığı (p0), son 3 ayın Flashscore
maçlarında aynı p0 aralığındaki seçimlerin gerçekte ne sıklıkla tuttuğuna göre düzeltilir.
- Kısa kuponlar (3'lü / 4'lü): 4 saatte bir, önümüzdeki 12 saatte başlayacak maçlardan.
- Yüksek oranlı kuponlar (2'li / 3'lü, seçim başına 2.40-6.00 oran): günde bir kez, o günün maçlarından.
- İY/MS kuponları: iddaa İY/MS oranını çoğu maçta yayınlamadığından Flashscore (1xBet) yaklaşan maç
  oranlarıyla; 4 saatte bir 3'lü/4'lü, günde bir kez yüksek oranlı 2'li/3'lü. Ayrıca 9 İY/MS seçeneğinin
  her biri için en olası maçlar listelenir.
Çıktı: docs/gol/data/kuponlar.json
"""
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data")
OUT = os.path.join(BASE, "..", "docs", "gol", "data", "kuponlar.json")
TR = timezone(timedelta(hours=3))

SAFE_EVERY = 4 * 3600 - 15 * 60
SAFE_WINDOW = 12 * 3600
SAFE_ODDS = (1.30, 2.10)
HIGH_ODDS = (2.40, 6.00)
HIGH_MIN_P = 0.20
HIGH_HOUR = 9          # TR saati; günlük yüksek oranlı kuponlar bu saatten sonra hazırlanır
MIN_LEAD = 15 * 60     # maç başlamasına en az 15 dk kalmış olmalı
IYMS_ODDS = (1.30, 4.00)
IYMS_HIGH_ODDS = (4.00, 15.00)
KEEP_DAYS = 30
SHRINK = 40

LINES = ["0.5", "1.5", "2.5", "3.5", "4.5", "5.5"]
HF = [a + b for a in "102" for b in "102"]


def label(k):
    if k in ("1", "X", "2"):
        return "MS " + k
    if k in ("i1", "iX", "i2"):
        return "İY " + k[1:]
    if k == "kgv":
        return "KG Var"
    if k == "kgy":
        return "KG Yok"
    if k.startswith("hf"):
        a, b = (("X" if c == "0" else c) for c in k[2:])
        return f"İY/MS {a}/{b}"
    if k.startswith("io") or k.startswith("iu"):
        return f"İY {k[2:]} {'Üst' if k[1] == 'o' else 'Alt'}"
    return f"{k[1:]} {'Üst' if k[0] == 'o' else 'Alt'}"


def groups():
    yield ("1", "X", "2")
    yield ("i1", "iX", "i2")
    yield ("kgv", "kgy")
    for L in LINES:
        yield ("o" + L, "u" + L)
        yield ("io" + L, "iu" + L)
    yield tuple("hf" + x for x in HF)


def fair(odds, idx=0):
    """Marjı arındırılmış olasılıklar. odds: {k: [son, açılış]} veya {k: oran}."""
    out = {}
    for g in groups():
        try:
            vals = [odds[k][idx] if isinstance(odds[k], list) else odds[k] for k in g]
        except KeyError:
            continue
        if any(not v or v <= 1 for v in vals):
            continue
        inv = [1 / v for v in vals]
        s = sum(inv)
        for k, x in zip(g, inv):
            out[k] = x / s
    return out


def outcome(k, fh, fa, hh, ha):
    def res(a, b):
        return "1" if a > b else "2" if b > a else "0"
    if fh is None or fa is None:
        return None
    if k in ("1", "X", "2"):
        return res(fh, fa) == {"1": "1", "X": "0", "2": "2"}[k]
    if k == "kgv":
        return fh > 0 and fa > 0
    if k == "kgy":
        return not (fh > 0 and fa > 0)
    if k[0] in "ou":
        L = float(k[1:])
        return (fh + fa > L) if k[0] == "o" else (fh + fa < L)
    if hh is None or ha is None:
        return None
    if k in ("i1", "iX", "i2"):
        return res(hh, ha) == {"i1": "1", "iX": "0", "i2": "2"}[k]
    if k.startswith("io") or k.startswith("iu"):
        L = float(k[2:])
        return (hh + ha > L) if k[1] == "o" else (hh + ha < L)
    if k.startswith("hf"):
        return res(hh, ha) + res(fh, fa) == k[2:]
    return None


def pbin(p):
    return min(19, int(p * 20))


def build_calib(matches, odds_db, until=None):
    """table[k][bin] = [n, isabet, p0 toplamı]"""
    table = {}
    for eid, m in matches.items():
        if until is not None and m["ts"] >= until:
            continue
        o = odds_db.get(eid)
        if not o:
            continue
        for k, p0 in fair(o).items():
            r = outcome(k, m["fh"], m["fa"], m.get("hh"), m.get("ha"))
            if r is None:
                continue
            c = table.setdefault(k, {}).setdefault(pbin(p0), [0, 0, 0.0])
            c[0] += 1
            c[1] += r
            c[2] += p0
    return table


def estimate(table, k, p0):
    n, h, sp = table.get(k, {}).get(pbin(p0), [0, 0, 0.0])
    p = p0 + (h - sp) / (n + SHRINK)
    return max(0.01, min(0.99, p)), n


def candidates(events, table, t0, t1, lo, hi, min_n):
    out = []
    for e in events:
        if not (t0 <= e["ts"] < t1):
            continue
        for k, p0 in fair(e["odds"]).items():
            odd = e["odds"][k][0] if isinstance(e["odds"][k], list) else e["odds"][k]
            if not (lo <= odd <= hi):
                continue
            p, n = estimate(table, k, p0)
            if n < min_n:
                continue
            out.append({"id": e["id"], "ts": e["ts"], "lg": e["lg"], "h": e["h"], "a": e["a"],
                        "k": k, "pick": label(k), "odd": odd, "p": round(p, 4), "p0": round(p0, 4)})
    return out


def best_per_match(cands, score):
    best = {}
    for c in cands:
        if c["id"] not in best or score(c) > score(best[c["id"]]):
            best[c["id"]] = c
    return sorted(best.values(), key=score, reverse=True)


def make_coupons(picks, sizes, kind, now):
    out, i = [], 0
    for n in sizes:
        legs = picks[i:i + n]
        if len(legs) < n:
            break
        i += n
        prob, odd = 1.0, 1.0
        for l in legs:
            prob *= l["p"]
            odd *= l["odd"]
        out.append({"cid": f"{kind}-{now}-{len(out)}", "kind": kind, "created": now,
                    "legs": legs, "odd": round(odd, 2), "p": round(prob, 4), "status": "bekliyor"})
    return out


def safe_coupons(events, table, now, exclude=()):
    c = candidates(events, table, now + MIN_LEAD, now + SAFE_WINDOW, *SAFE_ODDS, min_n=80)
    c = [x for x in c if x["id"] not in exclude]
    picks = best_per_match(c, lambda x: x["p"])
    return make_coupons(picks, [3, 4, 3, 4], "kisa", now)


def high_coupons(events, table, now):
    end = datetime.fromtimestamp(now, TR).replace(hour=23, minute=59, second=59).timestamp()
    c = candidates(events, table, now + MIN_LEAD, end, *HIGH_ODDS, min_n=40)
    c = [x for x in c if x["p"] >= HIGH_MIN_P]
    # Geçmiş testte "değer" (p x oran) seçimi aşırı iyimser çıktı; en olası seçimler daha tutarlı.
    picks = best_per_match(c, lambda x: x["p"])
    return make_coupons(picks, [2, 2, 3], "yuksek", now)


def hf_only(events):
    return [dict(e, odds={k: v for k, v in e["odds"].items() if k.startswith("hf")}) for e in events]


def iyms_coupons(events, table, now, exclude=()):
    c = candidates(hf_only(events), table, now + MIN_LEAD, now + SAFE_WINDOW, *IYMS_ODDS, min_n=80)
    c = [x for x in c if x["id"] not in exclude]
    return make_coupons(best_per_match(c, lambda x: x["p"]), [3, 4], "iyms", now)


def iyms_high_coupons(events, table, now):
    end = datetime.fromtimestamp(now, TR).replace(hour=23, minute=59, second=59).timestamp()
    c = candidates(hf_only(events), table, now + MIN_LEAD, end, *IYMS_HIGH_ODDS, min_n=40)
    return make_coupons(best_per_match(c, lambda x: x["p"]), [2, 3], "iyms_y", now)


def iyms_top(events, table, now, per=3):
    """Her İY/MS seçeneği için önümüzdeki 36 saatte tutma olasılığı en yüksek maçlar."""
    c = candidates(hf_only(events), table, now + MIN_LEAD, now + 36 * 3600, 1.01, 1000, min_n=20)
    out = {}
    for k in ("hf" + x for x in HF):
        out[label(k)] = sorted((x for x in c if x["k"] == k), key=lambda x: -x["p"])[:per]
    return out


def settle(coupons, results):
    for cp in coupons:
        if cp["status"] != "bekliyor":
            continue
        done = True
        for l in cp["legs"]:
            if "r" in l:
                continue
            m = results.get(l["id"])
            if not m or "fh" not in m:
                done = False
                continue
            r = outcome(l["k"], m["fh"], m["fa"], m.get("hh"), m.get("ha"))
            if r is None:
                done = False
                continue
            l["r"] = bool(r)
            l["score"] = f"{m.get('hh')}-{m.get('ha')} / {m['fh']}-{m['fa']}"
        if any(l.get("r") is False for l in cp["legs"]):
            cp["status"] = "kaybetti"
        elif done and all(l.get("r") for l in cp["legs"]):
            cp["status"] = "kazandı"
        elif cp["legs"] and time.time() - max(l["ts"] for l in cp["legs"]) > 4 * 86400:
            cp["status"] = "sonuçsuz"


def load(name):
    p = os.path.join(DATA, name)
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return {}


def main():
    force = "--force" in sys.argv
    now = int(time.time())
    state = {}
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            state = json.load(f)
    coupons = state.get("coupons", [])
    iddaa = load("iddaa.json")
    settle(coupons, {**load("fs_matches.json"), **iddaa})

    table = build_calib(load("fs_matches.json"), load("fs_odds.json"))
    fs_events = [e for e in load("fs_upcoming.json").values() if e.get("odds")]
    events = [e for e in iddaa.values() if "fh" not in e and e.get("odds")]
    made = []
    if force or now - state.get("last_safe", 0) >= SAFE_EVERY:
        used = {l["id"] for c in coupons if c["kind"] == "kisa" and c["status"] == "bekliyor" for l in c["legs"]}
        new = safe_coupons(events, table, now, used)
        if new:
            made += new
            state["last_safe"] = now
    today = datetime.fromtimestamp(now, TR).date().isoformat()
    if (force or state.get("last_high_day") != today) and datetime.fromtimestamp(now, TR).hour >= HIGH_HOUR:
        new = high_coupons(events, table, now)
        if new:
            made += new
            state["last_high_day"] = today
    if fs_events and (force or now - state.get("last_iyms", 0) >= SAFE_EVERY):
        used = {l["id"] for c in coupons if c["kind"] == "iyms" and c["status"] == "bekliyor" for l in c["legs"]}
        new = iyms_coupons(fs_events, table, now, used)
        if new:
            made += new
            state["last_iyms"] = now
    if fs_events and (force or state.get("last_iyms_day") != today) and datetime.fromtimestamp(now, TR).hour >= HIGH_HOUR:
        new = iyms_high_coupons(fs_events, table, now)
        if new:
            made += new
            state["last_iyms_day"] = today
    if fs_events:
        state["iyms_top"] = iyms_top(fs_events, table, now)
    coupons += made

    cutoff = now - KEEP_DAYS * 86400
    coupons = [c for c in coupons if c["created"] >= cutoff]
    state.update({"updated": now, "coupons": coupons})
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        head = {k: v for k, v in state.items() if k != "coupons"}
        f.write(json.dumps(head, ensure_ascii=False, separators=(",", ":"))[:-1] + ',"coupons":[\n')
        f.write(",\n".join(json.dumps(c, ensure_ascii=False, separators=(",", ":")) for c in coupons))
        f.write("\n]}\n")
    print(f"kupon: {len(made)} yeni kupon, toplam {len(coupons)}")


if __name__ == "__main__":
    main()
