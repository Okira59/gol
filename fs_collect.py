"""Flashscore'dan son N günün sonuçlarını ve maç öncesi Bet365 / William Hill oranlarını toplar.

Kullanım: python fs_collect.py [--days 90] [--workers 8]
Çıktı: data/fs_matches.json, data/fs_odds.json (artımlı; mevcut kayıtlar tekrar indirilmez)
"""
import argparse
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor

import requests

from leagues import LEAGUES

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"}
FEED = "https://www.flashscore.com/x/feed/"
FEED_HDR = {**UA, "x-fsign": "SW9D1eZo", "Referer": "https://www.flashscore.com/"}
ODDS_URL = "https://global.ds.lsapp.eu/odds/pq_graphql"
BOOKS = [16, 15]  # Flashscore bookmaker id: 16 = bet365, 15 = William Hill (bet365 önce, eksik market William Hill'den)
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
MATCHES_FILE = os.path.join(DATA, "fs_matches.json")
ODDS_FILE = os.path.join(DATA, "fs_odds.json")

session = requests.Session()


def get(url, headers=None, params=None, tries=3):
    for i in range(tries):
        try:
            r = session.get(url, headers=headers or UA, params=params, timeout=25)
            if r.status_code == 200:
                return r
        except requests.RequestException:
            pass
        time.sleep(1.5 * (i + 1))
    return None


def load(path):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {}


def dump_lines(obj, f):
    f.write("{\n" + ",\n".join(json.dumps(k, ensure_ascii=False) + ":" + json.dumps(v, ensure_ascii=False, separators=(",", ":"))
                                 for k, v in sorted(obj.items())) + "\n}\n")


def save(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        dump_lines(obj, f)
    os.replace(tmp, path)


def to_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def parse_feed(text, default_league):
    """Flashscore '¬~' ayrımlı feed'den bitmiş maçları çıkarır."""
    out = []
    league = default_league
    for rec in text.split("¬~"):
        f = {}
        for kv in rec.split("¬"):
            if "÷" in kv:
                k, v = kv.split("÷", 1)
                f.setdefault(k, v)
        if "ZA" in f:
            league = f["ZA"]
            continue
        if "AA" not in f or f.get("AB") != "3" or f.get("AC") != "3":
            continue
        if "BE" in f or "BF" in f:  # uzatmaya giden maçlar
            continue
        fh, fa = to_int(f.get("AG")), to_int(f.get("AH"))
        if fh is None or fa is None:
            continue
        sh, sa = to_int(f.get("BC")), to_int(f.get("BD"))
        hh = fh - sh if sh is not None else None
        ha = fa - sa if sa is not None else None
        if hh is not None and (hh < 0 or ha is None or ha < 0):
            hh = ha = None
        out.append({
            "id": f["AA"], "ts": int(f["AD"]), "lg": league,
            "h": f.get("AE", ""), "a": f.get("AF", ""),
            "ja": f.get("JA"), "jb": f.get("JB"),
            "fh": fh, "fa": fa, "hh": hh, "ha": ha,
        })
    return out


def collect_league(path, cutoff):
    r = get(f"https://www.flashscore.com/football/{path}/results/")
    if not r:
        print(f"  ! {path}: sayfa alınamadı")
        return []
    h = r.text
    m = re.search(r"cjs\.initialFeeds\['results'\]\s*=\s*\{\s*data:\s*`(.*?)`,\s*allEventsCount:\s*(\d+),\s*seasonId:\s*(\d+)", h, re.S)
    tid = re.search(r'tournament_id = "([^"]+)"', h)
    cid = re.search(r"¬ZB÷(\d+)", m.group(1) if m else "")
    if not (m and tid and cid):
        print(f"  ! {path}: sonuç verisi yok")
        return []
    events = parse_feed(m.group(1), path)
    raw_ts = [int(x) for x in re.findall(r"¬AD÷(\d+)", m.group(1))]
    page = 1
    while raw_ts and min(raw_ts) > cutoff and page < 15:
        feed = f"tr_1_{cid.group(1)}_{tid.group(1)}_{m.group(3)}_{page}_3_en_1"
        rr = get(FEED + feed, FEED_HDR)
        if not rr or "AA÷" not in rr.text:
            break
        events += parse_feed(rr.text, path)
        raw_ts = [int(x) for x in re.findall(r"¬AD÷(\d+)", rr.text)]
        page += 1
    events = [e for e in events if e["ts"] >= cutoff]
    for e in events:
        e["path"] = path
    print(f"  {path}: {len(events)} maç")
    return events


def fnum(v):
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


def parse_odds(js, ja, jb):
    try:
        blocks = js["data"]["findOddsByEventId"]["odds"]
    except (KeyError, TypeError):
        return {}
    seen = set()
    out = {}
    for b in sorted((b for b in blocks if b.get("bookmakerId") in BOOKS), key=lambda b: BOOKS.index(b["bookmakerId"])):
        key = (b["bettingType"], b["bettingScope"])
        if key in seen:
            continue
        seen.add(key)
        bt, sc = key
        pre = {"FULL_TIME": "", "FIRST_HALF": "i"}.get(sc)
        if pre is None:
            continue
        for it in b["odds"]:
            val = [fnum(it.get("value")), fnum(it.get("opening"))]
            if val[0] is None:
                continue
            k = None
            if bt == "HOME_DRAW_AWAY":
                pid = it.get("eventParticipantId")
                side = "1" if pid == ja else "2" if pid == jb else "X" if pid is None else None
                k = pre + side if side else None
            elif bt == "OVER_UNDER":
                hv = (it.get("handicap") or {}).get("value")
                sel = it.get("selection")
                if hv and hv.endswith(".5") and sel in ("OVER", "UNDER"):
                    k = f"{pre}{'o' if sel == 'OVER' else 'u'}{hv}"
            elif bt == "HALF_FULL_TIME" and sc == "FULL_TIME":
                w = it.get("winner")
                if w:
                    k = "hf" + w.replace("X", "0").replace("/", "")
            elif bt == "CORRECT_SCORE" and it.get("score"):
                k = f"{pre}cs{it['score'].replace(':', '-')}"
            elif bt == "BOTH_TEAMS_TO_SCORE" and sc == "FULL_TIME":
                k = "kgv" if it.get("bothTeamsToScore") else "kgy"
            if k and k not in out:
                out[k] = val
    return out


def fetch_odds(m):
    r = get(ODDS_URL, UA, {"_hash": "oce", "eventId": m["id"], "projectId": 2,
                           "geoIpCode": "GB", "geoIpSubdivisionCode": "GB34"})
    if not r:
        return m["id"], None
    try:
        return m["id"], parse_odds(r.json(), m.get("ja"), m.get("jb"))
    except ValueError:
        return m["id"], None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=90)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--leagues", nargs="*", default=LEAGUES)
    args = ap.parse_args()
    os.makedirs(DATA, exist_ok=True)
    cutoff = int(time.time()) - args.days * 86400

    keep = int(time.time()) - max(args.days, 100) * 86400
    matches = {k: m for k, m in load(MATCHES_FILE).items() if m["ts"] >= keep}
    print(f"Ligler taranıyor ({len(args.leagues)})...")
    with ThreadPoolExecutor(4) as ex:
        for evs in ex.map(lambda p: collect_league(p, cutoff), args.leagues):
            for e in evs:
                matches[e["id"]] = e
    save(MATCHES_FILE, matches)

    odds = {k: v for k, v in load(ODDS_FILE).items() if k in matches}
    todo = [m for k, m in matches.items() if k not in odds]
    print(f"Toplam {len(matches)} maç, {len(todo)} maçın oranı indirilecek...")
    done = 0
    with ThreadPoolExecutor(args.workers) as ex:
        for eid, o in ex.map(fetch_odds, todo):
            if o is not None:
                odds[eid] = o
            done += 1
            if done % 250 == 0:
                save(ODDS_FILE, odds)
                print(f"  {done}/{len(todo)}")
    save(ODDS_FILE, odds)
    print("Bitti.")


if __name__ == "__main__":
    main()
