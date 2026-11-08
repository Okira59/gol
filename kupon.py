"""iddaa bültenindeki yaklaşan maçlardan otomatik kupon üretir ve eski kuponları sonuçlandırır.

Kuponlar sadece iddaa bültenindeki maçlardan, iddaa oranlarıyla kurulur.
Olasılık modeli: her seçimin marjı arındırılmış oran olasılığı (p0), son 3 ayın maçlarında (Bet365 /
William Hill oranları) aynı p0 aralığındaki seçimlerin gerçekte ne sıklıkla tuttuğuna göre düzeltilir.
- Her 4 saatlik dilimde (TR) bir kez, günün kalan maçlarından her türden en fazla 2 kupon: İY/MS, İY 1.5/2.5 Üst,
  3.5/4.5/5.5 Üst, MS (1-X-2), İY Karşılıklı Gol Var, İY skoru (sadece iddaa oranı), yüksek oranlı (seçim başına 2.40-6.00)
  ve İY + 2. yarı skoru. Ayrıca her türden 4'lü, 5'li ve 6'lı birer kupon. Tutma olasılığı %36'nın
  (İY + 2. yarı skoru hariç) ve oranı 1.70'in altındaki hiçbir seçim kupona alınmaz. Her türde tutma
  olasılığı en yüksek seçimler kullanılır. iddaa'da olmayan marketler (çoğunlukla İY/MS) aynı maçın Bet365 /
  William Hill oranıyla tamamlanır. Ayrıca 9 İY/MS seçeneğinin her biri ve İY KG Var için en olası maçlar listelenir.
Çıktı: docs/data/kuponlar.json, docs/data/bulten.json (oran arama)
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
OUT = os.path.join(BASE, "docs", "data", "kuponlar.json")
TR = timezone(timedelta(hours=3))

SLOT_HOURS = 4         # her 4 saatlik dilimde (TR) bir kez, günün kalan maçlarından kupon hazırlanır
MIN_LEAD = 15 * 60     # maç başlamasına en az 15 dk kalmış olmalı
HIGH_MIN_P = 0.20
MIN_LEG_P = 0.36       # tutma olasılığı bunun altındaki hiçbir maç kupona alınmaz (İY + 2. yarı skoru hariç)
MIN_LEG_ODD = 1.70     # oranı bunun altındaki hiçbir seçim kupona alınmaz
BIG_SIZES = [4, 5, 6]  # her türde ayrıca 4'lü, 5'li ve 6'lı birer kupon
# Günde 12 kupon: her türden 2 adet, tutma olasılığı en yüksek seçimlerden.
# Kupon 2-5 maçlık; toplam oran en az MIN_ODD (yüksek oranda HIGH_TOTAL).
# (tür, seçilebilecek marketler, tek seçim oran aralığı, en düşük toplam oran)
MIN_ODD = 5.50
HIGH_TOTAL = 10.0
MIN_LEGS, MAX_LEGS, POOL = 2, 5, 14
SCORE_SIZES = [4, 5, 6]
DAILY_SET = [
    ("iyms", ["hf" + a + b for a in "102" for b in "102"], (1.30, 4.00), MIN_ODD),
    ("iyust", ["io1.5", "io2.5"], (1.01, 15.0), MIN_ODD),
    ("ust", ["o3.5", "o4.5", "o5.5"], (1.01, 15.0), MIN_ODD),
    ("ms", ["1", "X", "2"], (1.20, 3.00), MIN_ODD),
    ("iykg", ["ikgv"], (1.01, 15.0), MIN_ODD),
    ("iyskor", None, (1.01, 50.0), MIN_ODD),
    ("yuksek", None, (2.40, 6.00), HIGH_TOTAL),
]
KINDS = {k for k, *_ in DAILY_SET} | {"skor"}
BY_P = {"iykg", "iyskor"}  # bu türlerde kupon maçları tutma olasılığına göre (yukarıdan aşağı) sıralanır
IYKG = ("ikgv", "ikgy")
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
    if k in IYKG:
        return "İY KG " + ("Var" if k == "ikgv" else "Yok")
    if k.startswith("ics"):
        return "İY skoru " + k[3:]
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
    yield IYKG
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
    if k in IYKG:
        return (hh > 0 and ha > 0) == (k == "ikgv")
    if k.startswith("ics"):
        return f"{hh}-{ha}" == k[3:]
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
            if (k not in keys) if keys is not None else (k in IYKG):
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


def best_coupons(picks, kind, now, min_odd, count=2, used=(), sizes=None, tag=""):
    """Toplam oranı >= min_odd olan, tutma olasılığı en yüksek 2-5 maçlık (veya sizes) kuponlar (maçlar çakışmaz)."""
    out, used = [], set(used)
    for _ in range(count):
        pool = [x for x in picks if x["id"] not in used][:POOL]
        best = None
        for n in (sizes or range(MIN_LEGS, MAX_LEGS + 1)):
            if n > len(pool):
                continue
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
        order = (lambda l: -l["p"]) if kind in BY_P else (lambda l: l["ts"])
        out.append({"cid": f"{kind}-{now}-{tag}{len(out)}", "kind": kind, "created": now,
                    "legs": sorted(legs, key=order), "odd": round(odd, 2),
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
            ref = {k: v for k, v in x["odds"].items() if k.startswith("ics")}
            e = dict(e, odds={**e["odds"], **ext}, ext=sorted(ext), ref=ref)
        out.append(e)
    return out


def day_end(now):
    return datetime.fromtimestamp(now, TR).replace(hour=23, minute=59, second=59).timestamp()


def ht_score_legs(events, now, t1):
    """Sadece iddaa '1. Yarı Skoru' bahsi açık maçlar: iddaa seçenekleri arasından Poisson modeline göre
    en olası İY skoru. Bet365 / William Hill İY skor oranı sadece kıyas için (ref) eklenir."""
    import skor as S
    legs = []
    for e in events:
        if not (now + MIN_LEAD <= e["ts"] < t1):
            continue
        opts = {k: (v[0] if isinstance(v, list) else v) for k, v in e["odds"].items() if k.startswith("ics")}
        opts = {k: v for k, v in opts.items() if k not in e.get("ext", ())}
        if not opts:
            continue
        r = S.predict(e["odds"])
        if not r:
            continue
        ht, best = r[0]["ht"], None
        for k, odd in opts.items():
            a, b = (int(x) for x in k[3:].split("-"))
            if odd and max(a, b) < ht.shape[0] and (best is None or ht[a, b] > best[0]):
                best = (float(ht[a, b]), k, odd)
        if best:
            q, k, odd = best
            ref = e.get("ref", {}).get(k)
            ref = ref[0] if isinstance(ref, list) else ref
            leg = {"id": e["id"], "ts": e["ts"], "lg": e["lg"], "h": e["h"], "a": e["a"], "k": k,
                   "pick": label(k), "odd": odd, "p": round(q, 4), "p0": round(1 / odd, 4), "bk": "iddaa"}
            if ref:
                leg["ref"] = ref
            legs.append(leg)
    return legs


def daily_set(events, table, now, t1=None, used=None):
    """Bir dilimin kuponları: DAILY_SET'teki her türden en fazla 2 kupon. Bir maç aynı türün
    bekleyen kuponlarında bir kez kullanılır; tutma olasılığı MIN_LEG_P altındaki maçlar alınmaz."""
    t1 = t1 or day_end(now)
    used = used or {}
    out = []
    for kind, keys, (lo, hi), min_odd in DAILY_SET:
        if kind == "iyskor":
            c = ht_score_legs(events, now, t1)
        else:
            c = candidates(events, table, now + MIN_LEAD, t1, lo, hi, min_n=40, keys=keys)
        floor = max(MIN_LEG_P, HIGH_MIN_P if kind == "yuksek" else 0)
        c = best_per_match([x for x in c if x["p"] >= floor and x["odd"] >= MIN_LEG_ODD], lambda x: x["p"])
        u = used.get(kind, ())
        out += best_coupons(c, kind, now, min_odd, used=u)
        for n in BIG_SIZES:
            out += best_coupons(c, kind, now, min_odd, count=1, used=u, sizes=[n], tag=f"b{n}-")
    return out


def score_legs(events, now, t1):
    """Sadece iddaa'da '1. Yarı/Maç Sonucu Skorları' bahsi açık maçlar: her maç için
    iddaa seçenekleri arasından en olası İY skoru + 2. yarı skoru (MS = İY + 2. yarı)."""
    import skor as S
    legs = []
    for e in events:
        if not (now + MIN_LEAD <= e["ts"] < t1) or not e.get("hs"):
            continue
        r = S.predict(e["odds"])
        if not r:
            continue
        ht, sh = r[0]["ht"], r[0]["sh"]
        best = None
        for key, odd in e["hs"].items():
            a, b, c, d = (int(x) for x in key)
            x, y = c - a, d - b
            if x < 0 or y < 0 or max(a, b) >= ht.shape[0] or max(x, y) >= sh.shape[0]:
                continue
            q = float(ht[a, b] * sh[x, y])
            if best is None or q > best[0]:
                best = (q, a, b, x, y, c, d, odd)
        if not best:
            continue
        q, a, b, x, y, c, d, odd = best
        legs.append({"id": e["id"], "ts": e["ts"], "lg": e["lg"], "h": e["h"], "a": e["a"], "k": "sk",
                     "ht": f"{a}-{b}", "sh": f"{x}-{y}", "ft": f"{c}-{d}", "p_ht": round(float(ht[a, b]), 4),
                     "p_sh": round(float(sh[x, y]), 4), "p": round(q, 5), "odd": odd})
    legs.sort(key=lambda l: -l["p"])
    return legs


def score_coupons(events, now, t1=None):
    """İY + 2. yarı skor kuponları: 4, 5 ve 6 maçlık, en olası maçlardan (maçlar çakışmaz).
    Oran = iddaa '1. Yarı/Maç Sonucu Skorları' oranlarının çarpımı."""
    legs, out, i = score_legs(events, now, t1 or day_end(now)), [], 0
    distinct = len(legs) >= sum(SCORE_SIZES)  # yeterli maç yoksa kuponlar aynı en olası maçları paylaşır
    for n in SCORE_SIZES:
        part = legs[i:i + n] if distinct else legs[:n]
        if len(part) < n:
            break
        if distinct:
            i += n
        p = prod(l["p"] for l in part)
        out.append({"cid": f"skor-{now}-{len(out)}", "kind": "skor", "created": now,
                    "legs": sorted(part, key=lambda l: l["ts"]), "odd": round(prod(l["odd"] for l in part), 2),
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


def iykg_top(events, table, now, per=10):
    """İY KG Var: önümüzdeki 36 saatte tutma olasılığı en yüksek maçlar (yukarıdan aşağı)."""
    c = candidates(events, table, now + MIN_LEAD, now + 36 * 3600, 1.01, 1000, min_n=20, keys=["ikgv"])
    return sorted(c, key=lambda x: -x["p"])[:per]


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
    # sonuçlananlardan sadece tutan kuponlar saklanır
    coupons = [c for c in coupons if c["status"] in ("bekliyor", "kazandı")]

    table = build_calib(load("fs_matches.json"), load("fs_odds.json"))
    # sadece iddaa maçları; iddaa'da olmayan marketler (çoğunlukla İY/MS) aynı maçın Bet365 / William Hill oranından
    events = with_ext([e for e in iddaa.values() if "fh" not in e and e.get("odds")],
                      [e for e in load("fs_upcoming.json").values() if e.get("odds")])
    # eski türlerin bekleyen kuponları kaldırılır
    coupons = [c for c in coupons if c["kind"] in KINDS or c["status"] != "bekliyor"]
    made = []
    t = datetime.fromtimestamp(now, TR)
    slot = f"{t.date().isoformat()}-{t.hour // SLOT_HOURS}"
    if force or state.get("last_slot") != slot:
        used = {}
        for c in coupons:
            if c["status"] == "bekliyor":
                used.setdefault(c["kind"], set()).update(l["id"] for l in c["legs"])
        made = daily_set(events, table, now, used=used)
        sc = [c for c in score_coupons(events, now)
              if not used.get("skor", set()) & {l["id"] for l in c["legs"]}]
        made += sc
        state["last_slot"] = slot
    state["iyms_top"] = iyms_top(events, table, now)
    state["iykg_top"] = iykg_top(events, table, now)
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
