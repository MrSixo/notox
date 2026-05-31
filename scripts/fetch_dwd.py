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

# Magyarország határpolygon — GADM 4.1 forrás, Douglas-Peucker ε=0.015° (~1.5 km)
# https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_HUN_0.json
HUNGARY_POLY = [
    (45.76140, 18.27930), (45.79610, 18.13650), (45.77540, 18.03450),
    (45.80190, 17.98880), (45.77410, 17.85850), (45.81200, 17.81730),
    (45.84250, 17.66640), (45.93810, 17.56020), (45.94980, 17.33440),
    (45.98520, 17.34440), (45.98170, 17.29360), (46.00280, 17.31070),
    (46.01170, 17.26140), (46.03230, 17.29380), (46.03250, 17.25450),
    (46.05870, 17.26600), (46.08200, 17.19900), (46.10040, 17.22860),
    (46.11400, 17.17480), (46.15350, 17.17960), (46.17350, 17.15650),
    (46.22450, 16.97260), (46.28240, 16.88780), (46.33440, 16.88100),
    (46.37590, 16.83660), (46.39200, 16.71950), (46.46010, 16.66250),
    (46.50520, 16.52520), (46.56300, 16.51260), (46.64470, 16.38370),
    (46.66040, 16.41660), (46.69340, 16.42330), (46.70060, 16.37180),
    (46.75640, 16.31890), (46.79590, 16.31200), (46.83080, 16.35030),
    (46.84920, 16.33730), (46.87470, 16.28720), (46.86960, 16.11380),
    (46.94220, 16.20100), (46.96300, 16.27750), (47.01430, 16.29120),
    (47.00190, 16.51350), (47.03010, 16.44000), (47.05660, 16.52170),
    (47.09530, 16.46450), (47.12760, 16.53050), (47.14970, 16.51790),
    (47.14270, 16.45540), (47.18770, 16.45610), (47.19530, 16.42060),
    (47.25330, 16.43290), (47.25330, 16.46830), (47.28070, 16.49060),
    (47.35320, 16.43490), (47.38370, 16.46250), (47.40760, 16.44660),
    (47.38940, 16.49770), (47.41100, 16.51810), (47.40680, 16.57690),
    (47.45610, 16.66320), (47.50070, 16.65350), (47.54030, 16.71570),
    (47.56670, 16.66580), (47.60540, 16.67430), (47.62330, 16.65330),
    (47.62030, 16.57370), (47.66570, 16.42270), (47.69670, 16.44850),
    (47.68170, 16.47590), (47.71230, 16.54160), (47.75140, 16.54820),
    (47.75950, 16.63550), (47.73580, 16.72220), (47.68190, 16.75020),
    (47.68320, 16.82960), (47.72210, 16.86810), (47.68880, 16.87640),
    (47.70870, 17.09430), (47.79440, 17.05220), (47.80870, 17.07570),
    (47.85880, 17.01120), (47.87490, 17.08650), (47.92780, 17.11400),
    (47.93480, 17.09220), (47.96130, 17.11830), (47.97130, 17.09590),
    (48.02080, 17.21270), (47.99790, 17.33450), (47.88540, 17.46240),
    (47.86060, 17.53510), (47.81660, 17.56700), (47.82240, 17.60900),
    (47.74170, 17.78070), (47.75690, 18.08300), (47.73270, 18.29510),
    (47.76580, 18.44830), (47.76130, 18.66300), (47.81550, 18.74230),
    (47.82810, 18.85570), (47.87330, 18.76330), (47.89870, 18.75900),
    (47.95800, 18.77760), (47.97570, 18.75330), (47.99250, 18.81280),
    (48.04900, 18.83880), (48.05840, 18.98760), (48.07790, 19.01250),
    (48.05710, 19.23540), (48.08930, 19.29840), (48.10500, 19.46110),
    (48.08790, 19.46860), (48.20640, 19.52780), (48.25270, 19.63710),
    (48.20580, 19.69570), (48.21840, 19.74260), (48.19420, 19.80080),
    (48.15800, 19.78920), (48.17760, 19.85370), (48.14880, 19.91060),
    (48.12930, 19.89840), (48.12960, 19.92690), (48.16480, 19.96760),
    (48.18180, 20.07820), (48.22320, 20.13070), (48.25960, 20.13930),
    (48.27830, 20.32650), (48.36380, 20.40730), (48.41870, 20.41620),
    (48.48960, 20.50180), (48.53310, 20.50750), (48.58640, 20.84030),
    (48.55360, 20.86720), (48.56150, 20.92060), (48.52330, 20.96350),
    (48.52270, 21.08400), (48.49250, 21.11600), (48.54150, 21.23440),
    (48.52860, 21.30660), (48.56320, 21.32300), (48.56080, 21.41860),
    (48.58530, 21.44140), (48.54990, 21.52020), (48.51150, 21.54770),
    (48.51290, 21.61460), (48.44790, 21.63380), (48.35340, 21.72690),
    (48.33420, 21.82850), (48.36720, 21.84720), (48.35440, 21.86690),
    (48.39270, 22.02510), (48.38040, 22.12010), (48.42450, 22.20230),
    (48.41710, 22.26690), (48.38780, 22.24390), (48.36320, 22.31760),
    (48.32210, 22.31470), (48.25250, 22.35570), (48.25350, 22.49900),
    (48.19920, 22.57580), (48.17000, 22.57220), (48.14240, 22.60490),
    (48.10840, 22.59020), (48.09450, 22.67610), (48.12330, 22.74490),
    (48.12160, 22.81740), (48.05390, 22.88160), (47.98840, 22.84610),
    (47.95740, 22.90450), (47.90840, 22.84860), (47.89370, 22.75980),
    (47.84370, 22.77840), (47.83730, 22.71740), (47.78800, 22.68190),
    (47.77230, 22.61320), (47.80340, 22.44960), (47.74130, 22.43180),
    (47.76620, 22.31890), (47.74360, 22.31910), (47.73140, 22.26620),
    (47.69870, 22.26060), (47.68830, 22.22760), (47.59470, 22.17800),
    (47.59840, 22.12980), (47.54880, 22.05690), (47.52930, 22.06310),
    (47.52020, 22.02570), (47.47620, 22.00910), (47.41370, 22.03710),
    (47.37610, 22.01360), (47.37330, 21.94010), (47.23950, 21.85340),
    (47.18750, 21.85940), (47.17310, 21.81910), (47.10670, 21.79410),
    (47.09890, 21.72770), (47.04600, 21.68430), (47.04080, 21.65040),
    (47.00210, 21.69060), (46.96070, 21.68040), (46.92780, 21.60030),
    (46.88680, 21.61590), (46.86170, 21.59840), (46.83630, 21.52080),
    (46.80020, 21.52030), (46.76470, 21.48510), (46.72110, 21.53090),
    (46.68630, 21.49380), (46.69410, 21.43150), (46.66150, 21.45660),
    (46.62220, 21.41160), (46.63820, 21.36720), (46.61790, 21.31570),
    (46.59110, 21.30280), (46.58310, 21.32230), (46.50230, 21.26200),
    (46.45130, 21.31900), (46.40700, 21.29790), (46.40360, 21.20790),
    (46.30440, 21.18210), (46.30200, 21.11710), (46.26290, 21.10480),
    (46.24310, 21.06760), (46.27950, 20.94830), (46.26210, 20.92380),
    (46.28780, 20.87500), (46.27620, 20.77720), (46.25100, 20.75040),
    (46.20480, 20.76340), (46.20780, 20.72900), (46.16630, 20.71550),
    (46.12680, 20.63760), (46.19030, 20.50320), (46.14320, 20.46070),
    (46.16990, 20.35720), (46.11900, 20.25420), (46.16250, 20.18130),
    (46.14680, 20.14150), (46.18030, 20.10250), (46.14700, 20.04240),
    (46.17880, 20.01990), (46.17730, 19.93440), (46.13030, 19.81640),
    (46.18840, 19.69680), (46.18080, 19.56370), (46.14410, 19.50180),
    (46.12230, 19.52140), (46.04780, 19.41190), (46.03770, 19.37880),
    (46.05550, 19.36650), (46.01640, 19.28290), (46.00140, 19.29640),
    (45.99800, 19.14870), (46.03830, 19.10990), (45.99970, 19.06070),
    (45.97120, 19.07100), (45.96800, 19.01080), (45.93610, 18.98640),
    (45.93780, 18.89920), (45.91130, 18.81130), (45.88070, 18.79210),
    (45.90860, 18.72370), (45.90140, 18.65880), (45.80710, 18.55610),
    (45.80220, 18.57460), (45.79510, 18.49620), (45.75910, 18.46300),
    (45.76140, 18.27930),
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
                # Egységes 3 cellás sugár minden irányba (~21 km) — nincs irányvak buffer-hiba
                BUFFER = 3
                in_hu = any(
                    point_in_hungary(lat + di * GRID_STEP, lon + dj * GRID_STEP)
                    for di in range(-BUFFER, BUFFER + 1)
                    for dj in range(-BUFFER, BUFFER + 1)
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
