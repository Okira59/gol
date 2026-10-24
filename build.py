"""data/*.json -> docs/data/matches.json (arayüzün okuduğu sade dosya)."""
import json
import sys
import os
import time

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data")
OUT = os.path.join(BASE, "docs", "data", "matches.json")
KEYS = ["1", "X", "2", "o1.5", "o2.5", "o3.5", "o4.5", "o5.5",
        "io0.5", "io1.5", "io2.5", "hf12", "hf21", "kgv"]


def load(name):
    p = os.path.join(DATA, name)
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return {}


def row(src, m, odds):
    o = {k: odds[k] for k in KEYS if k in odds and odds[k][0]}
    return [src, m["id"], m["ts"], m["lg"], m["h"], m["a"], m["fh"], m["fa"], m.get("hh"), m.get("ha"), o]


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else OUT
    rows = []
    fs_m, fs_o = load("fs_matches.json"), load("fs_odds.json")
    for k, m in fs_m.items():
        if fs_o.get(k):
            rows.append(row("fs", m, fs_o[k]))
    for m in load("iddaa.json").values():
        if "fh" in m and m.get("odds"):
            rows.append(row("iddaa", m, m["odds"]))
    rows.sort(key=lambda r: -r[2])
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    cols = ["src", "id", "ts", "lg", "h", "a", "fh", "fa", "hh", "ha", "odds"]
    with open(out, "w", encoding="utf-8") as f:
        f.write('{"updated":%d,"cols":%s,"rows":[\n' % (time.time(), json.dumps(cols)))
        f.write(",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows))
        f.write("\n]}\n")
    print(f"{len(rows)} maç -> {out}")


if __name__ == "__main__":
    main()
