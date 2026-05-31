#!/usr/bin/env python3
"""
DWD ICON-EU → No-tox JSON pipeline
====================================
Letölti a DWD OpenData ICON-EU GRIB2 előrejelzési adatokat,
Magyarország területére vágja, és napi aggregált JSON-t generál.

Változók (36 fájl, ~43 MB letöltés):
  - tmax_2m  : napi max hőmérséklet [K → °C]   — steps 24,48,72,96,120
  - tmin_2m  : napi min hőmérséklet [K → °C]   — steps 24,48,72,96,120
  - relhum_2m: relatív páratartalom [%]          — steps 6,12,...,120 (6h)
  - tot_prec : felhalmozott csapadék [kg/m²=mm]  — steps 0,24,48,72,96,120

Kimeneti formátum: data/dwd_hungary.json
  Kompatibilis a No-tox frontend fetchWeatherBulk() formátumával.

GitHub Actions futtatja 6 óránként (lásd .github/workflows/dwd-fetch.yml).

Függőségek:
  sudo apt-get install -y libeccodes-dev
  pip install cfgrib xarray numpy
"""

import bz2
import json
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

try:
    import cfgrib
    import numpy as np
except ImportError:
    print("Hiányzó függőségek: pip install cfgrib xarray numpy")
    sys.exit(1)

# ── Konfiguráció ─────────────────────────────────────────────────────────────

BASE_URL  = "https://opendata.dwd.de/weather/nwp/icon-eu/grib"
GRID_STEP = 0.0625  # ICON-EU natív felbontás (~7 km)

# Magyarország bounding box (kis ráhagyással a határ menti cellákhoz)
LAT_MIN, LAT_MAX = 45.5, 48.8
LON_MIN, LON_MAX = 15.8, 23.2

# Egyszerűsített Magyarország határpolygon (ray-casting szűréshez)
HUNGARY_POLY = [
    (46.872, 16.254), (46.995, 16.288), (47.130, 16.390), (47.384, 16.443),
    (47.529, 16.462), (47.683, 16.598), (47.963, 17.077), (47.871, 17.573),
    (47.741, 18.124), (47.877, 18.537), (47.788, 18.744), (47.823, 18.872),
    (47.808, 19.123), (48.068, 19.299), (48.115, 19.793), (48.193, 20.101),
    (48.223, 20.307), (48.474, 20.502), (48.568, 20.848), (48.503, 21.118),
    (48.389, 21.458), (48.404, 21.661), (48.408, 22.183), (48.030, 22.595),
    (47.962, 22.615), (47.860, 22.545), (47.680, 22.382), (47.376, 22.019),
    (47.106, 21.957), (46.873, 21.566), (46.558, 21.078), (46.208, 20.719),
    (46.076, 20.359), (46.000, 20.069), (45.921, 19.604), (45.852, 19.062),
    (45.940, 18.693), (45.800, 18.186), (45.793, 17.820), (45.956, 17.479),
    (46.013, 17.031), (46.155, 16.878), (46.297, 16.683), (46.437, 16.700),
    (46.607, 16.541), (46.869, 16.344), (46.872, 16.254),
]


def point_in_hungary(lat: float, lon: float) -> bool:
    """Ray-casting: a koordináta Magyarországon belül van-e?"""
    inside = False
    poly = HUNGARY_POLY
    j = len(poly) - 1
    for i in range(len(poly)):
        yi, xi = poly[i]
        yj, xj = poly[j]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def log(msg: str):
    print(msg, flush=True)


def latest_run() -> str:
    """Legutóbbi elérhető ICON-EU futás (DWD ~2-3h után publikál)."""
    now     = datetime.now(timezone.utc)
    delayed = now - timedelta(hours=3)
    hour    = (delayed.hour // 6) * 6
    return delayed.strftime("%Y%m%d") + f"{hour:02d}"


def download(run: str, var: str, step: int, tmpdir: str) -> Path:
    """Letölt és kibontja az adott GRIB2.bz2 fájlt."""
    h     = run[-2:]
    fname = (
        f"icon-eu_europe_regular-lat-lon_single-level"
        f"_{run}_{step:03d}_{var.upper()}.grib2.bz2"
    )
    url = f"{BASE_URL}/{h}/{var}/{fname}"
    out = Path(tmpdir) / fname[:-4]  # .bz2 eltávolítása
    log(f"  ↓ step={step:03d}  {var}")
    with urllib.request.urlopen(url, timeout=30) as resp:
        out.write_bytes(bz2.decompress(resp.read()))
    return out


def open_clipped(path: Path):
    """GRIB2 → DataArray, Magyarország bounding boxra vágva."""
    try:
        ds = cfgrib.open_dataset(str(path), indexpath="")
    except Exception:
        datasets = cfgrib.open_datasets(str(path), indexpath="")
        if not datasets:
            raise RuntimeError(f"Nem nyitható meg: {path}")
        ds = datasets[0]
    var = list(ds.data_vars)[0]
    da  = ds[var]

    # Koordinátaneveket detektáljuk (latitude/lat, longitude/lon)
    lat_dim = next((d for d in da.dims if "lat" in d.lower()), None)
    lon_dim = next((d for d in da.dims if "lon" in d.lower()), None)
    if lat_dim is None or lon_dim is None:
        raise RuntimeError(f"Ismeretlen koordináta-dimenzió: {da.dims}")

    lats = da[lat_dim].values
    # Ascending (D→É) vagy descending (É→D) latitude?
    lat_slice = (
        slice(LAT_MIN, LAT_MAX) if lats[0] < lats[-1]
        else slice(LAT_MAX, LAT_MIN)
    )
    return da.sel(**{lat_dim: lat_slice, lon_dim: slice(LON_MIN, LON_MAX)})


def build_json(run: str) -> dict:
    run_dt = datetime.strptime(run, "%Y%m%d%H").replace(tzinfo=timezone.utc)
    today  = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # step 024 = run napjának max/min T → run_dt + 0 nap = mai dátum
    days   = [(run_dt + timedelta(days=d)).strftime("%Y-%m-%d") for d in range(5)]

    result = {
        "ts":    datetime.now(timezone.utc).isoformat(),
        "run":   run,
        "model": "icon-eu-dwd",
        "step":  GRID_STEP,
        "days":  days,
        "grid":  [],
    }

    with tempfile.TemporaryDirectory() as tmp:
        # ── Tmax / Tmin (nap végi futó max/min, DWD 24h-onként reseteli) ──
        log("\n[1/4] Tmax letöltése…")
        tmax = {d: open_clipped(download(run, "tmax_2m", (d + 1) * 24, tmp))
                for d in range(5)}

        log("\n[2/4] Tmin letöltése…")
        tmin = {d: open_clipped(download(run, "tmin_2m", (d + 1) * 24, tmp))
                for d in range(5)}

        # ── RH 6 óránként (4 minta/nap → napi átlag) ─────────────────────
        log("\n[3/4] RH letöltése (6h lépések)…")
        rh_by_day = {d: [] for d in range(5)}
        for step in range(6, 121, 6):
            d = (step - 1) // 24
            if d < 5:
                try:
                    rh_by_day[d].append(open_clipped(download(run, "relhum_2m", step, tmp)))
                except Exception as e:
                    log(f"    ⚠ RH step={step} hiba: {e}")

        # ── Felhalmozott csapadék (diff a napos határon) ──────────────────
        log("\n[4/4] Csapadék letöltése…")
        prec = {}
        for step in [0, 24, 48, 72, 96, 120]:
            try:
                prec[step] = open_clipped(download(run, "tot_prec", step, tmp))
            except Exception as e:
                log(f"    ⚠ PREC step={step} hiba: {e}")

        # ── Rács összeállítása ─────────────────────────────────────────────
        log("\nJSON összeállítása…")
        ref  = tmax[0]
        lat_dim = next(d for d in ref.dims if "lat" in d.lower())
        lon_dim = next(d for d in ref.dims if "lon" in d.lower())
        lats = ref[lat_dim].values
        lons = ref[lon_dim].values

        for i, lat in enumerate(lats):
            lat = float(lat)
            for j, lon in enumerate(lons):
                lon = float(lon)

                # Magyarország + 1 cellás puffer szűrés
                in_hu = any(
                    point_in_hungary(lat + di * GRID_STEP, lon + dj * GRID_STEP)
                    for di in range(-1, 2) for dj in range(-1, 3)
                )
                if not in_hu:
                    continue

                cell_days = []
                for d in range(5):
                    tx = round(float(tmax[d].values[i, j]) - 273.15, 1)
                    tn = round(float(tmin[d].values[i, j]) - 273.15, 1)
                    tm = round((tx + tn) / 2, 1)

                    rh_vals = [float(da.values[i, j]) for da in rh_by_day[d]]
                    rh = round(float(np.mean(rh_vals))) if rh_vals else None

                    step_to   = (d + 1) * 24
                    step_from = d * 24
                    pr = None
                    if step_to in prec and step_from in prec:
                        pr = round(max(0.0,
                            float(prec[step_to].values[i, j]) -
                            float(prec[step_from].values[i, j])
                        ), 1)

                    cell_days.append({
                        "date":        days[d],
                        "tmax":        tx,
                        "tmin":        tn,
                        "tmean":       tm,
                        "rh_mean":     rh,
                        "precip":      pr,
                        "is_forecast": days[d] >= today,
                        "source":      "icon-eu-dwd",
                    })

                result["grid"].append({
                    "lat":  round(lat, 5),
                    "lon":  round(lon, 5),
                    "days": cell_days,
                })

    return result


def main():
    run = latest_run()
    log(f"=== DWD ICON-EU pipeline  |  futás: {run} ===")

    data = build_json(run)

    out = Path("data/dwd_hungary.json")
    out.parent.mkdir(exist_ok=True)
    text = json.dumps(data, separators=(",", ":"))
    out.write_text(text)

    size_kb = len(text) // 1024
    log(f"\n✓ {len(data['grid'])} cella · {len(data['days'])} nap → {out} ({size_kb} KB)")


if __name__ == "__main__":
    main()
