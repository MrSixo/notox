#!/usr/bin/env python3
"""
OMSZ Szinoptikus állomások → No-tox JSON
==========================================
Letölti az OMSZ automata állomások legfrissebb óránkénti méréseit,
és data/omsz_latest.json fájlba menti.

GitHub Actions óránként futtatja.

Forrás: https://odp.met.hu/weather/weather_reports/synoptic/hungary/hourly/csv/
Licenc: OMSZ Open Data
"""

import csv, io, json, time, zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen, Request

OMSZ_URL = (
    "https://odp.met.hu/weather/weather_reports/synoptic/hungary/"
    "hourly/csv/HABP_1H_SYNOP_LATEST.csv.zip"
)

MISSING = -999  # OMSZ hiányzó adat kódja


def fetch_csv(retries: int = 3) -> str:
    req = Request(OMSZ_URL, headers={"User-Agent": "No-tox/1.0 (github.com/MrSixo/notox)"})
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            with urlopen(req, timeout=30) as resp:
                buf = resp.read()
            with zipfile.ZipFile(io.BytesIO(buf)) as zf:
                name = next(n for n in zf.namelist() if n.endswith(".csv"))
                return zf.read(name).decode("utf-8", errors="replace")
        except Exception as e:
            last_err = e
            print(f"  ⚠ letöltés hiba ({attempt}/{retries}): {e}")
            if attempt < retries:
                time.sleep(attempt * 5)
    raise last_err


def parse_float(val: str):
    try:
        v = float(val.strip())
        return None if v == MISSING else round(v, 2)
    except (ValueError, TypeError):
        return None


def parse_int(val: str):
    try:
        v = int(float(val.strip()))
        return None if v == MISSING else v
    except (ValueError, TypeError):
        return None


def parse_stations(text: str) -> list:
    reader = csv.reader(io.StringIO(text), delimiter=";")
    header = None
    stations = []

    for row in reader:
        if not row:
            continue
        row = [c.strip() for c in row]
        if row[0].startswith("Time") or row[0].startswith("Idő"):
            header = [c.strip() for c in row]
            continue
        if header is None or len(row) < 10:
            continue

        def col(name):
            try:
                return row[header.index(name)]
            except (ValueError, IndexError):
                return ""

        t   = parse_float(col("t"))
        lat = parse_float(col("Latitude"))
        lon = parse_float(col("Longitude"))
        if lat is None or lon is None:
            continue

        station = {
            "id":   parse_int(col("StationNumber")),
            "name": col("StationName").strip(),
            "lat":  lat,
            "lon":  lon,
            "elev": parse_float(col("Elevation")),
            # Hőmérséklet
            "t":    t,                          # aktuális °C
            "ta":   parse_float(col("ta")),     # órai átlag
            "tn":   parse_float(col("tn")),     # órai minimum
            "tx":   parse_float(col("tx")),     # órai maximum
            # Páratartalom
            "u":    parse_int(col("u")),         # RH %
            # Csapadék
            "r":    parse_float(col("r")),       # órai mm
            # Szél
            "fs":   parse_float(col("fs")),     # átlag szélsebesség m/s
            "fsd":  parse_int(col("fsd")),      # szélirány °
            "fx":   parse_float(col("fx")),     # széllökés m/s
            # Légnyomás
            "p":    parse_float(col("p")),      # állomási légnyomás hPa
            "p0":   parse_float(col("p0")),     # tengersz. szintű hPa
            # Talajhőmérséklet (cm)
            "et5":  parse_float(col("et5")),
            "et10": parse_float(col("et10")),
            "et20": parse_float(col("et20")),
            "et50": parse_float(col("et50")),
        }
        # Csak akkor vesszük fel ha legalább hőmérséklet vagy RH megvan
        if station["t"] is not None or station["u"] is not None:
            stations.append(station)

    return stations


def main():
    print("OMSZ letöltés…")
    text = fetch_csv()
    stations = parse_stations(text)
    print(f"  {len(stations)} állomás")

    # Időbélyeg a CSV első adatsorából (a fejléc lehet "Time" vagy "Idő")
    lines = [l for l in text.splitlines()
             if l.strip() and not (l.startswith("Time") or l.startswith("Idő"))]
    ts_raw = lines[0].split(";")[0].strip() if lines else ""
    try:
        ts = datetime.strptime(ts_raw, "%Y%m%d%H%M").replace(tzinfo=timezone.utc).isoformat()
    except Exception:
        ts = datetime.now(timezone.utc).isoformat()

    out = {
        "ts":       datetime.now(timezone.utc).isoformat(),
        "obs_time": ts,
        "source":   "OMSZ Open Data — odp.met.hu",
        "count":    len(stations),
        "stations": stations,
    }

    path = Path("data/omsz_latest.json")
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
    print(f"✓ {path}  ({path.stat().st_size // 1024} KB)  ts={ts}")


if __name__ == "__main__":
    main()
