"""iddaa bültenindeki yaklaşan maçlardan otomatik kupon üretir ve eski kuponları sonuçlandırır.

Kuponlar sadece iddaa bültenindeki maçlardan, iddaa oranlarıyla kurulur.
Olasılık modeli: her seçimin marjı arındırılmış oran olasılığı (p0), son 3 ayın maçlarında (Bet365 /
William Hill oranları) aynı p0 aralığındaki seçimlerin gerçekte ne sıklıkla tuttuğuna göre düzeltilir.
- Günde bir kez (09:00 sonrası) o günün maçlarından 12 kupon, her türden 2 adet: İY/MS, İY + 2. yarı skoru,
  İY 1.5/2.5 Üst, 3.5/4.5/5.5 Üst, MS (1-X-2) ve yüksek oranlı (seçim başına 2.40-6.00). Her türde tutma
  olasılığı en yüksek seçimler kullanılır. iddaa'da olmayan marketler (çoğunlukla İY/MS) aynı maçın Bet365 /
  William Hill oranıyla tamamlanır. Ayrıca 9 İY/MS seçeneğinin her biri için en olası maçlar listelenir.
Çıktı: docs/gol/data/kuponlar.json, docs/gol/data/bulten.json (oran arama)
"""
import json
import os
import re
import sys
import time
import unicodedata
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from itertools import combinations
from math import prod

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data")
OUT = os.path.join(BASE, "..", "docs", "gol", "data", "kuponlar.json")
TR = timezone(timedelta(hours=3))

DAY_HOUR = 9           # TR saati; günün kuponları bu saatten sonra bir kez hazırlanır
MIN_LEAD = 15 * 60     # maç başlamasına en az 15 dk kalmış olmalı
HIGH_MIN_P = 0.20
# Günde 12 kupon: her türden 2 adet, tutma olasılığı en yüksek seçimlerden.
# Kupon 2-5 maçlık; toplam oran en az MIN_ODD (yüksek oranda HIGH_TOTAL).
# (tür, seçilebilecek marketler, tek seçim oran aralığı, en düşük toplam oran)
MIN_ODD = 3.50
HIGH_TOTAL = 10.0
MIN_LEGS, MAX_LEGS, POOL = 2, 5, 14
SCORE_SIZES = [4, 5, 6]
DAILY_SET = [
    ("iyms", ["hf" + a + b for a in "102" for b in "102"], (1.30, 4.00), MIN_ODD),
    ("iyust", ["io1.5", "io2.5"], (1.01, 15.0), MIN_ODD),
    ("ust", ["o3.5", "o4.5", "o5.5"], (1.01, 15.0), MIN_ODD),
    ("ms", ["1", "X", "2"], (1.20, 3.00), MIN_ODD),
    ("yuksek", None, (2.40, 6.00), HIGH_TOTAL),
]
KINDS = {k for k, *_ in DAILY_SET} | {"skor"}
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


def candidates(events, table, t0, t1, lo, hi, min_n, keys=None):
    out = []
    for e in events:
        if not (t0 <= e["ts"] < t1):
            continue
        for k, p0 in fair(e["odds"]).items():
            if keys is not None and k not in keys:
                continue
            odd = e["odds"][k][0] if isinstance(e["odds"][k], list) else e["odds"][k]
            if not (lo <= odd <= hi):
                continue
            p, n = estimate(table, k, p0)
            if n < min_n:
                continue
            out.append({"id": e["id"], "ts": e["ts"], "lg": e["lg"], "h": e["h"], "a": e["a"],
                        "k": k, "pick": label(k), "odd": odd, "p": round(p, 4), "p0": round(p0, 4),
                        "bk": "Bet365/WH" if k in e.get("ext", ()) else "iddaa"})
    return out


def best_per_match(cands, score):
    best = {}
    for c in cands:
        if c["id"] not in best or score(c) > score(best[c["id"]]):
            best[c["id"]] = c
    return sorted(best.values(), key=score, reverse=True)


def best_coupons(picks, kind, now, min_odd, count=2):
    """Toplam oranı >= min_odd olan, tutma olasılığı en yüksek 2-5 maçlık kuponlar (maçlar çakışmaz)."""
    out, used = [], set()
    for _ in range(count):
        pool = [x for x in picks if x["id"] not in used][:POOL]
        best = None
        for n in range(MIN_LEGS, min(MAX_LEGS, len(pool)) + 1):
            for legs in combinations(pool, n):
                odd = prod(l["odd"] for l in legs)
                if odd < min_odd:
                    continue
                p = prod(l["p"] for l in legs)
                if best is None or p > best[0]:
                    best = (p, odd, legs)
        if not best:
            break
        p, odd, legs = best
        used |= {l["id"] for l in legs}
        out.append({"cid": f"{kind}-{now}-{len(out)}", "kind": kind, "created": now,
                    "legs": sorted(legs, key=lambda l: l["ts"]), "odd": round(odd, 2),
                    "p": float(f"{p:.3g}"), "status": "bekliyor"})
    return out


def _norm(name):
    t = unicodedata.normalize("NFKD", name.lower()).encode("ascii", "ignore").decode()
    t = re.sub(r"\(.*?\)|[^a-z0-9 ]", " ", t)
    return " ".join(w for w in t.split() if w not in ("fc", "cf", "cd", "sc", "ac", "fk", "club", "de", "u21", "u23", "u19"))


def _sim(a, b):
    a, b = _norm(a), _norm(b)
    if not a or not b:
        return 0
    if a in b or b in a:
        return 1
    return SequenceMatcher(None, a, b).ratio()


def match(events, others):
    """(iddaa maçı, Flashscore maçı) çiftleri: aynı saat (±15 dk) + benzer takım adları."""
    by_ts = {}
    for x in others:
        by_ts.setdefault(x["ts"] // 900, []).append(x)
    out = []
    for e in events:
        best, bs = None, 0
        for slot in (e["ts"] // 900 - 1, e["ts"] // 900, e["ts"] // 900 + 1):
            for x in by_ts.get(slot, []):
                sh, sa = _sim(e["h"], x["h"]), _sim(e["a"], x["a"])
                sc = sh + sa
                if (sh >= 0.85 or sa >= 0.85 or sc >= 1.3) and sc > bs:
                    best, bs = x, sc
        if best:
            out.append((e, best))
    return out


def with_ext(events, ext_events):
    """iddaa maçlarına aynı maçın Bet365 / William Hill oranlarını ekler.
    iddaa'daki oran her zaman önceliklidir; sadece iddaa'da olmayan marketler eklenir."""
    by_iid = {x["iid"]: x for x in ext_events if x.get("iid")}
    out = []
    for e in events:
        x = by_iid.get(e["id"])
        if x:
            ext = {k: v for k, v in x["odds"].items() if k not in e["odds"]}
            e = dict(e, odds={**e["odds"], **ext}, ext=sorted(ext))
        out.append(e)
    return out


def day_end(now):
    return datetime.fromtimestamp(now, TR).replace(hour=23, minute=59, second=59).timestamp()


def daily_set(events, table, now, t1=None):
    """Günün kuponları: DAILY_SET'teki her türden 2 kupon (aynı türde bir maç bir kez kullanılır)."""
    t1 = t1 or day_end(now)
    out = []
    for kind, keys, (lo, hi), min_odd in DAILY_SET:
        c = candidates(events, table, now + MIN_LEAD, t1, lo, hi, min_n=40, keys=keys)
        if kind == "yuksek":
            c = [x for x in c if x["p"] >= HIGH_MIN_P]
        out += best_coupons(best_per_match(c, lambda x: x["p"]), kind, now, min_odd)
    return out


def score_legs(events, now, t1):
    """Her maç için en olası İY skoru + en olası 2. yarı skoru (MS skoru kullanılmaz)."""
    import numpy as np
    import skor as S
    legs = []
    for e in events:
        if not (now + MIN_LEAD <= e["ts"] < t1):
            continue
        r = S.predict(e["odds"])
        if not r:
            continue
        ht, sh = r[0]["ht"], r[0]["sh"]
        a, b = (int(x) for x in np.unravel_index(np.argmax(ht), ht.shape))
        c, d = (int(x) for x in np.unravel_index(np.argmax(sh), sh.shape))
        legs.append({"id": e["id"], "ts": e["ts"], "lg": e["lg"], "h": e["h"], "a": e["a"], "k": "sk",
                     "ht": f"{a}-{b}", "sh": f"{c}-{d}", "p_ht": round(float(ht[a, b]), 4),
                     "p_sh": round(float(sh[c, d]), 4), "p": round(float(ht[a, b] * sh[c, d]), 5),
                     "odd": round(1 / float(ht[a, b] * sh[c, d]), 2)})
    legs.sort(key=lambda x: -x["p"])
    return legs


def score_coupons(events, now, t1=None):
    """İY + 2. yarı skor kuponları: 4, 5 ve 6 maçlık, en olası maçlardan (maçlar çakışmaz).
    Oran = adil oran (1 / olasılık)."""
    legs, out, i = score_legs(events, now, t1 or day_end(now)), [], 0
    for n in SCORE_SIZES:
        part = legs[i:i + n]
        if len(part) < n:
            break
        i += n
        p = prod(l["p"] for l in part)
        out.append({"cid": f"skor-{now}-{len(out)}", "kind": "skor", "created": now,
                    "legs": sorted(part, key=lambda l: l["ts"]), "odd": round(1 / p, 0),
                    "p": float(f"{p:.3g}"), "status": "bekliyor"})
    return out


def bulletin(events, table, now):
    """Oran arama için bülten: önümüzdeki 36 saatteki iddaa maçları ve tüm oranları."""
    out = []
    for e in sorted(events, key=lambda x: x["ts"]):
        if not (now < e["ts"] < now + 36 * 3600):
            continue
        fp = fair(e["odds"])
        o = []
        for g in groups():
            for k in g:
                if k not in e["odds"]:
                    continue
                v = e["odds"][k]
                odd = v[0] if isinstance(v, list) else v
                if not odd:
                    continue
                p = estimate(table, k, fp[k])[0] if k in fp else None
                o.append([label(k), odd, round(p, 3) if p else None, 1 if k in e.get("ext", ()) else 0])
        out.append({"id": e["id"], "ts": e["ts"], "lg": e["lg"], "h": e["h"], "a": e["a"], "o": o})
    return {"updated": now, "matches": out}


def hf_only(events):
    return [dict(e, odds={k: v for k, v in e["odds"].items() if k.startswith("hf")}) for e in events]


def iyms_top(events, table, now, per=3):
    """Her İY/MS seçeneği için önümüzdeki 36 saatte tutma olasılığı en yüksek maçlar."""
    c = candidates(hf_only(events), table, now + MIN_LEAD, now + 36 * 3600, 1.01, 1000, min_n=20)
    out = {}
    for k in ("hf" + x for x in HF):
        out[label(k)] = sorted((x for x in c if x["k"] == k), key=lambda x: -x["p"])[:per]
    return out


def settle(coupons, results):
    for cp in coupons:
        sk = cp["kind"] == "skor"
        old_sk = sk and any("ft" in l for l in cp["legs"])
        if cp["status"] != "bekliyor" and not (old_sk and "ms" not in cp):
            continue
        done = True
        for l in cp["legs"]:
            if "r" in l:
                continue
            m = results.get(l["id"])
            if not m or "fh" not in m:
                done = False
                continue
            if sk:
                if m.get("hh") is None:
                    done = False
                    continue
                fh, fa, hh, ha = m["fh"], m["fa"], m["hh"], m["ha"]
                l["r_ht"] = f"{hh}-{ha}" == l["ht"]
                l["r_sh"] = f"{fh - hh}-{fa - ha}" == l["sh"]
                if "ft" in l:
                    l["r_ft"] = f"{fh}-{fa}" == l["ft"]
                l["r"] = l["r_ht"] and l["r_sh"]
                l["score"] = f"{hh}-{ha} / {fh}-{fa}"
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
        if old_sk:
            if any(l.get("r_ft") is False for l in cp["legs"]):
                cp["ms"] = "kaybetti"
            elif all(l.get("r_ft") for l in cp["legs"]):
                cp["ms"] = "kazandı"
            elif time.time() - max(l["ts"] for l in cp["legs"]) > 4 * 86400:
                cp["ms"] = "sonuçsuz"


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
    # sadece iddaa maçları; iddaa'da olmayan marketler (çoğunlukla İY/MS) aynı maçın Bet365 / William Hill oranından
    events = with_ext([e for e in iddaa.values() if "fh" not in e and e.get("odds")],
                      [e for e in load("fs_upcoming.json").values() if e.get("odds")])
    # eski türlerin bekleyen kuponları kaldırılır (artık günde 12 kupon)
    coupons = [c for c in coupons if c["kind"] in KINDS or c["status"] != "bekliyor"]
    made = []
    today = datetime.fromtimestamp(now, TR).date().isoformat()
    if force or (state.get("last_set_day") != today and datetime.fromtimestamp(now, TR).hour >= DAY_HOUR):
        made = daily_set(events, table, now) + score_coupons(events, now)
        if made:
            state["last_set_day"] = today
    state["iyms_top"] = iyms_top(events, table, now)
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
    with open(os.path.join(os.path.dirname(OUT), "bulten.json"), "w", encoding="utf-8") as f:
        json.dump(bulletin(events, table, now), f, ensure_ascii=False, separators=(",", ":"))
    print(f"kupon: {len(made)} yeni kupon, toplam {len(coupons)}")


if __name__ == "__main__":
    main()
