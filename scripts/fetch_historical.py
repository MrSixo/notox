#!/usr/bin/env python3
"""
OMSZ historikus napi adatok → No-tox per-állomás JSON
=======================================================
Letölti az OMSZ ~340 állomásának napi historikus mérését (2002–2025),
és per-állomás tömörített JSON-t generál + egy index fájlt.

Architektúra: lazy loading — a frontend az indexből tudja az állomásokat,
és csak a kiválasztott állomás napi sorát tölti le.

Forrás: https://odp.met.hu/climate/observations_hungary/daily/historical/
Változók: t (átlag), tn (min), tx (max), u (RH%), rau (csapadék mm)

Kimenet:
  data/historical/index.json                — állomáslista (id, név, lat, lon, időszak)
  data/historical/st_<id>.json.gz           — egy állomás napi idősora

Függőségek: requests
"""

import gzip, io, json, re, sys, zipfile
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError
from concurrent.futures import ThreadPoolExecutor, as_completed

WORKERS = 8  # párhuzamos letöltő szálak

BASE = "https://odp.met.hu/climate/observations_hungary/daily/historical/"
UA   = {"User-Agent": "No-tox/1.0 historical (github.com/MrSixo/notox)"}
MISSING = -999


def log(m): print(m, flush=True)


def fetch(url, binary=True):
    req = Request(url, headers=UA)
    with urlopen(req, timeout=60) as r:
        return r.read() if binary else r.read().decode("utf-8", "replace")


def list_station_files():
    """Az index oldalról kigyűjti a HABP_1D_<id>_<start>_<end>_hist.zip fájlokat, állomásonként csoportosítva."""
    html = fetch(BASE, binary=False)
    files = re.findall(r'HABP_1D_(\d+)_(\d+)_(\d+)_hist\.zip', html)
    by_station = {}
    for sid, start, end in files:
        fname = f"HABP_1D_{sid}_{start}_{end}_hist.zip"
        by_station.setdefault(sid, []).append((start, end, fname))
    # rendezés időszak szerint
    for sid in by_station:
        by_station[sid].sort()
    return by_station


def parse_zip(data: bytes):
    """ZIP → (meta dict, napi sorok listája). Napi sor: [date, t, tn, tx, u, rau]."""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        name = next(n for n in z.namelist() if n.endswith(".csv"))
        text = z.read(name).decode("utf-8", "replace")

    lines = text.splitlines()
    meta = {}
    header = None
    rows = []

    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        # Meta sor: "#  15310 ;20020227 ;... ; 47.1983; 16.6478; 200.1;Szombathely ;EOR"
        if ln.startswith("#") and ";" in ln and not ln.startswith("##"):
            parts = [p.strip() for p in ln.lstrip("#").split(";")]
            # StationNumber;StartDate;EndDate;Latitude;Longitude;Elevation;StationName;EOR
            if len(parts) >= 7 and parts[0].isdigit():
                try:
                    meta = {
                        "id":   int(parts[0]),
                        "lat":  float(parts[3]),
                        "lon":  float(parts[4]),
                        "elev": float(parts[5]),
                        "name": parts[6].strip(),
                    }
                except (ValueError, IndexError):
                    pass
            continue
        if ln.startswith("StationNumber"):
            header = [h.strip() for h in ln.split(";")]
            continue
        if header is None:
            continue
        # adatsor
        cols = [c.strip() for c in ln.split(";")]
        if len(cols) < 15 or not cols[0].isdigit():
            continue

        def gv(name):
            try:
                v = float(cols[header.index(name)])
                return None if v == MISSING else round(v, 1)
            except (ValueError, IndexError):
                return None

        time = cols[header.index("Time")] if "Time" in header else ""
        if len(time) != 8:
            continue
        date = f"{time[:4]}-{time[4:6]}-{time[6:8]}"
        t   = gv("t")
        tn  = gv("tn")
        tx  = gv("tx")
        u   = gv("u")
        rau = gv("rau")
        u_int = int(u) if u is not None else None
        rows.append([date, t, tn, tx, u_int, rau])

    return meta, rows


def process_station(sid, periods, out_dir):
    """Egy állomás teljes feldolgozása → index-bejegyzés vagy None."""
    all_rows = []
    meta = None
    for start, end, fname in periods:
        data = fetch(BASE + fname)
        m, rows = parse_zip(data)
        if m and not meta:
            meta = m
        all_rows.extend(rows)

    if not meta or not all_rows:
        return None

    seen = {}
    for r in all_rows:
        seen[r[0]] = r
    rows_sorted = [seen[d] for d in sorted(seen)]

    station = {
        "id": meta["id"], "name": meta["name"], "lat": meta["lat"],
        "lon": meta["lon"], "elev": meta["elev"],
        "cols": ["date", "t", "tn", "tx", "u", "rau"],
        "daily": rows_sorted,
    }
    path = out_dir / f"st_{meta['id']}.json.gz"
    raw = json.dumps(station, separators=(",", ":"), ensure_ascii=False).encode()
    with gzip.open(str(path), "wb", compresslevel=9) as f:
        f.write(raw)

    return {
        "id": meta["id"], "name": meta["name"], "lat": meta["lat"],
        "lon": meta["lon"], "elev": meta["elev"],
        "start": rows_sorted[0][0], "end": rows_sorted[-1][0],
        "days": len(rows_sorted),
    }


def main():
    out_dir = Path("data/historical")
    out_dir.mkdir(parents=True, exist_ok=True)

    log("Állomáslista lekérése…")
    by_station = list_station_files()
    log(f"  {len(by_station)} állomás · {WORKERS} párhuzamos szál")

    index = []
    ok, fail, done = 0, 0, 0
    total = len(by_station)

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = { ex.submit(process_station, sid, periods, out_dir): sid
                    for sid, periods in by_station.items() }
        for fut in as_completed(futures):
            sid = futures[fut]
            done += 1
            try:
                entry = fut.result()
                if entry: index.append(entry); ok += 1
                else: fail += 1
            except Exception as e:
                fail += 1
                log(f"  ⚠ {sid}: {e}")
            if done % 50 == 0:
                log(f"  {done}/{total} — ok: {ok}, fail: {fail}")

    # index.json
    index.sort(key=lambda s: s["name"])
    (out_dir / "index.json").write_text(
        json.dumps({"count": len(index), "stations": index}, separators=(",", ":"), ensure_ascii=False)
    )

    total_mb = sum(p.stat().st_size for p in out_dir.glob("*.gz")) / 1024 / 1024
    log(f"\n✓ {ok} állomás feldolgozva, {fail} hiba")
    log(f"  index.json + {ok} per-állomás gz · összesen {total_mb:.1f} MB")


if __name__ == "__main__":
    main()
