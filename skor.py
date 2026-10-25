"""Yaklaşan maçlar için skor olasılıkları (İY, 2. yarı, MS).

Model: marjı arındırılmış oranlardan (MS 1X2 + alt/üst, İY 1X2 + İY alt/üst) her takımın ilk yarı ve
maç geneli beklenen gol sayısı bulunur (Poisson). 2. yarı = maç geneli - ilk yarı; MS skoru = İY + 2. yarı.
Son 30 günün 1.586 maçında test edildi: skor olasılıkları gerçekleşen sıklıklarla uyumlu (ek düzeltme
denendi, iyileştirmediği için kullanılmadı).
Çıktı: docs/gol/data/skorlar.json
"""
import json
import os
import time

import numpy as np

from kupon import BASE, fair, load

OUT = os.path.join(BASE, "..", "docs", "gol", "data", "skorlar.json")
G = 8                      # 0..7 gol
FT_KEYS = ["1", "X", "2", "o1.5", "o2.5", "o3.5", "kgv"]
HT_KEYS = ["i1", "iX", "i2", "io0.5", "io1.5", "io2.5"]


def _pois(lam):
    k = np.arange(G)
    f = np.cumprod(np.r_[1, np.arange(1, G)])
    return np.exp(-lam[..., None]) * lam[..., None] ** k / f


GRID = np.round(np.arange(0.02, 4.01, 0.02), 2)
_LH, _LA = np.meshgrid(GRID, GRID, indexing="ij")
_M = _pois(_LH)[..., :, None] * _pois(_LA)[..., None, :]          # [i, j, gh, ga]
_gh, _ga = np.meshgrid(np.arange(G), np.arange(G), indexing="ij")
_tot = _gh + _ga
_FEAT = {
    "1": (_M * (_gh > _ga)).sum((-1, -2)), "X": (_M * (_gh == _ga)).sum((-1, -2)),
    "2": (_M * (_gh < _ga)).sum((-1, -2)), "kgv": (_M * ((_gh > 0) & (_ga > 0))).sum((-1, -2)),
}
for L in (0.5, 1.5, 2.5, 3.5):
    _FEAT[f"o{L}"] = (_M * (_tot > L)).sum((-1, -2))
_HTMAP = {"i1": "1", "iX": "X", "i2": "2", "io0.5": "o0.5", "io1.5": "o1.5", "io2.5": "o2.5"}


def fit(fp, keys, mapping=None):
    """fp: marjsız olasılıklar. En iyi uyan (λev, λdep) çifti."""
    err, n = np.zeros_like(_LH), 0
    for k in keys:
        if k in fp:
            err += (_FEAT[(mapping or {}).get(k, k)] - fp[k]) ** 2
            n += 1
    if n < 2:
        return None
    i, j = np.unravel_index(np.argmin(err), err.shape)
    return float(GRID[i]), float(GRID[j])


def lambdas(odds):
    fp = fair(odds)
    ft = fit(fp, FT_KEYS)
    if not ft:
        return None
    ht = fit(fp, HT_KEYS, _HTMAP)
    if not ht:
        ht = (ft[0] * 0.44, ft[1] * 0.44)
    ht = (min(ht[0], ft[0] * 0.8), min(ht[1], ft[1] * 0.8))
    sh = (max(ft[0] - ht[0], 0.02), max(ft[1] - ht[1], 0.02))
    return ht, sh


def mat(l):
    return np.outer(_pois(np.array(l[0])), _pois(np.array(l[1])))


def conv(a, b):
    out = np.zeros((G, G))
    for i in range(G):
        for j in range(G):
            out[i:, j:] += a[i, j] * b[: G - i, : G - j]
    return out


def predict(odds):
    lam = lambdas(odds)
    if not lam:
        return None
    ht, sh = mat(lam[0]), mat(lam[1])
    ft = conv(ht, sh)
    return {"ht": ht, "sh": sh, "ft": ft}, lam


def top(m, n=8):
    idx = np.dstack(np.unravel_index(np.argsort(-m, axis=None)[:n], m.shape))[0]
    return [[f"{i}-{j}", round(float(m[i, j]), 4)] for i, j in idx]


def summary(m):
    gh, ga = _gh, _ga
    return {"1": round(float(m[gh > ga].sum()), 4), "X": round(float(m[gh == ga].sum()), 4),
            "2": round(float(m[gh < ga].sum()), 4)}


def upcoming():
    """Yaklaşan maçlar: Flashscore + (Flashscore'da olmayan) iddaa maçları."""
    events = {}
    for e in load("fs_upcoming.json").values():
        if e.get("odds"):
            events[e["id"]] = dict(e, src="Flashscore")
    seen = {(e["ts"], e["h"][:4].lower()) for e in events.values()}
    for e in load("iddaa.json").values():
        if "fh" not in e and e.get("odds") and (e["ts"], e["h"][:4].lower()) not in seen:
            events[e["id"]] = dict(e, src="iddaa")
    return events


def best_score(p):
    """En olası MS skoru ve onu oluşturan en olası İY + 2. yarı ayrımı."""
    ft = p["ft"]
    i, j = (int(x) for x in np.unravel_index(np.argmax(ft), ft.shape))
    q, a, b = max((p["ht"][a, b] * p["sh"][i - a, j - b], a, b) for a in range(i + 1) for b in range(j + 1))
    return {"ht": f"{a}-{b}", "sh": f"{i - a}-{j - b}", "ft": f"{i}-{j}", "p_ht": round(float(p["ht"][a, b]), 4),
            "p_sh": round(float(p["sh"][i - a, j - b]), 4), "p_ft": round(float(ft[i, j]), 4), "p": round(float(q), 5)}


def main():
    now = time.time()
    events = upcoming()
    out = []
    for e in events.values():
        if not (now < e["ts"] < now + 36 * 3600):
            continue
        r = predict(e["odds"])
        if not r:
            continue
        p, lam = r
        out.append({"id": e["id"], "src": e["src"], "ts": e["ts"], "lg": e["lg"], "h": e["h"], "a": e["a"],
                    "xg": [round(lam[0][0] + lam[1][0], 2), round(lam[0][1] + lam[1][1], 2)],
                    "ht": top(p["ht"], 6), "sh": top(p["sh"], 6), "ft": top(p["ft"], 8),
                    "r": {k: summary(p[k]) for k in p}})
    out.sort(key=lambda x: x["ts"])
    with open(OUT, "w", encoding="utf-8") as f:
        f.write('{"updated":%d,"matches":[\n' % now)
        f.write(",\n".join(json.dumps(x, ensure_ascii=False, separators=(",", ":")) for x in out))
        f.write("\n]}\n")
    print(f"skor: {len(out)} maçın skor olasılıkları")


if __name__ == "__main__":
    main()
