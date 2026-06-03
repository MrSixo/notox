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
from shapely.geometry import box as shapely_box, Polygon as ShapelyPoly, mapping as shapely_mapping
from shapely.validation import make_valid
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

# Magyarország határpolygon — OCHA/UNHCR COD-AB-HUN, Douglas-Peucker ε=0.015° (~1.5 km)
# Forrás: https://data.humdata.org/dataset/cod-ab-hun (CC BY-IGO)
HUNGARY_POLY = [
    (48.57487, 21.45067), (48.56156, 21.32088), (48.52204, 21.30494), (48.53722, 21.22066),
    (48.49108, 21.11748), (48.52596, 21.06584), (48.52161, 20.95623), (48.55911, 20.92211),
    (48.55163, 20.86823), (48.58150, 20.85051), (48.54413, 20.54647), (48.53093, 20.50362),
    (48.49014, 20.50463), (48.41915, 20.41673), (48.36963, 20.41177), (48.27269, 20.32581),
    (48.28042, 20.24131), (48.25089, 20.20622), (48.25425, 20.13353), (48.22515, 20.13427),
    (48.17977, 20.07353), (48.16595, 19.97435), (48.13115, 19.93752), (48.12484, 19.89846),
    (48.14682, 19.91472), (48.17832, 19.85610), (48.15327, 19.79499), (48.19438, 19.79929),
    (48.21643, 19.74569), (48.20111, 19.70528), (48.24981, 19.63083), (48.20300, 19.52619),
    (48.08400, 19.46794), (48.10115, 19.45360), (48.08854, 19.30168), (48.05362, 19.24050),
    (48.07382, 19.13456), (48.05738, 19.05898), (48.07790, 19.01529), (48.05370, 18.98119),
    (48.05228, 18.84500), (48.03989, 18.81966), (47.99241, 18.81493), (47.97655, 18.75574),
    (47.95638, 18.77715), (47.91971, 18.75692), (47.87175, 18.76580), (47.82584, 18.85589),
    (47.81327, 18.74018), (47.75891, 18.64601), (47.76513, 18.45385), (47.73136, 18.29066),
    (47.75731, 18.04033), (47.73964, 17.78244), (47.75632, 17.70881), (47.82153, 17.60937),
    (47.81545, 17.56693), (47.86537, 17.52690), (47.88472, 17.45467), (47.99361, 17.33336),
    (47.99854, 17.25797), (48.02252, 17.24212), (48.01254, 17.17503), (47.97090, 17.09469),
    (47.96088, 17.11701), (47.93446, 17.09098), (47.92741, 17.11272), (47.87446, 17.08518),
    (47.85831, 17.01005), (47.80830, 17.07458), (47.79402, 17.05107), (47.70812, 17.09333),
    (47.68820, 16.87561), (47.72158, 16.86696), (47.68272, 16.82845), (47.68105, 16.74883),
    (47.73533, 16.72103), (47.76035, 16.60968), (47.75139, 16.54825), (47.72254, 16.55229),
    (47.68118, 16.47487), (47.69649, 16.44724), (47.66343, 16.42329), (47.61963, 16.57447),
    (47.62289, 16.65214), (47.60500, 16.67320), (47.56801, 16.66316), (47.53972, 16.71464),
    (47.50026, 16.65249), (47.45565, 16.66208), (47.40650, 16.57566), (47.40966, 16.51694),
    (47.38883, 16.49646), (47.40899, 16.48516), (47.40715, 16.44551), (47.36599, 16.45664),
    (47.35287, 16.43389), (47.28029, 16.48941), (47.25281, 16.46709), (47.25297, 16.43180),
    (47.19491, 16.41957), (47.18745, 16.45498), (47.14243, 16.45422), (47.14938, 16.51681),
    (47.12717, 16.52960), (47.09495, 16.46345), (47.05605, 16.52073), (47.02971, 16.43932),
    (47.00122, 16.51244), (46.99817, 16.30290), (47.01395, 16.29015), (46.96290, 16.27683),
    (46.94177, 16.19995), (46.86909, 16.11379), (46.85421, 16.15568), (46.87302, 16.29060),
    (46.84647, 16.34136), (46.80426, 16.34042), (46.79782, 16.31267), (46.75511, 16.31835),
    (46.70110, 16.37494), (46.69395, 16.42880), (46.65841, 16.41956), (46.66376, 16.39207),
    (46.64427, 16.38588), (46.56497, 16.50808), (46.50538, 16.52364), (46.45934, 16.66439),
    (46.39425, 16.71599), (46.35437, 16.86592), (46.28046, 16.88569), (46.24226, 16.97374),
    (46.22473, 16.97317), (46.17029, 17.15822), (46.10894, 17.17583), (46.09774, 17.23349),
    (46.07805, 17.20116), (46.07724, 17.23917), (46.06443, 17.25129), (46.06134, 17.23013),
    (46.05431, 17.27149), (46.03303, 17.26121), (46.03121, 17.29455), (46.01216, 17.25745),
    (45.98885, 17.32304), (45.96884, 17.30891), (45.97206, 17.33181), (45.99543, 17.33149),
    (45.97465, 17.35444), (45.98969, 17.37335), (45.96422, 17.35928), (45.95932, 17.39056),
    (45.96094, 17.34528), (45.94356, 17.34482), (45.93610, 17.56886), (45.89801, 17.62783),
    (45.83885, 17.66116), (45.80894, 17.82698), (45.76732, 17.86211), (45.79217, 17.90615),
    (45.79530, 17.99607), (45.76426, 18.08196), (45.78936, 18.12384), (45.78746, 18.19101),
    (45.74701, 18.33831), (45.76803, 18.37224), (45.73716, 18.44640), (45.79472, 18.49046),
    (45.80023, 18.57494), (45.83938, 18.62352), (45.91700, 18.65930), (45.87801, 18.79223),
    (45.91473, 18.82174), (45.93491, 18.90618), (45.92324, 19.00857), (45.95873, 19.00538),
    (45.96372, 19.07929), (46.00008, 19.06583), (46.03895, 19.10399), (46.03683, 19.13387),
    (45.99617, 19.14733), (45.98777, 19.29638), (46.01429, 19.28160), (46.05210, 19.36408),
    (46.04558, 19.41564), (46.12106, 19.52683), (46.14204, 19.50183), (46.17824, 19.56780),
    (46.18799, 19.69837), (46.12811, 19.81822), (46.17608, 19.93511), (46.17673, 20.01671),
    (46.14363, 20.06365), (46.17728, 20.10149), (46.14426, 20.13769), (46.16032, 20.18180),
    (46.11625, 20.25451), (46.16850, 20.35667), (46.14418, 20.46064), (46.19044, 20.50213),
    (46.12629, 20.63973), (46.16612, 20.71342), (46.20642, 20.72987), (46.20332, 20.76159),
    (46.25101, 20.74919), (46.27558, 20.77566), (46.27820, 20.94617), (46.24553, 21.06517),
    (46.30133, 21.11810), (46.30419, 21.17892), (46.40244, 21.20610), (46.40841, 21.29457),
    (46.45181, 21.31556), (46.50761, 21.26262), (46.58177, 21.31985), (46.59179, 21.30197),
    (46.61516, 21.31365), (46.63734, 21.36802), (46.62184, 21.40952), (46.66142, 21.45507),
    (46.69314, 21.43003), (46.68646, 21.49417), (46.72128, 21.52899), (46.76182, 21.48320),
    (46.83431, 21.51731), (46.86794, 21.60339), (46.92613, 21.59791), (46.95975, 21.67875),
    (47.00220, 21.68853), (47.03988, 21.65013), (47.06253, 21.70474), (47.09783, 21.72621),
    (47.10522, 21.79107), (47.17247, 21.81563), (47.18940, 21.85856), (47.22994, 21.84854),
    (47.37183, 21.93892), (47.38852, 22.02072), (47.45076, 22.03312), (47.47795, 22.00713),
    (47.51849, 22.02239), (47.53804, 22.07127), (47.54854, 22.05458), (47.59790, 22.12803),
    (47.59337, 22.17382), (47.69400, 22.23129), (47.74408, 22.31785), (47.76626, 22.31714),
    (47.74074, 22.43041), (47.80322, 22.44830), (47.81062, 22.48121), (47.77365, 22.54822),
    (47.78272, 22.66101), (47.83494, 22.71157), (47.84424, 22.77715), (47.89432, 22.76022),
    (47.90815, 22.84726), (47.95405, 22.89602), (47.98982, 22.83768), (48.05484, 22.88137),
    (48.08026, 22.83604), (48.11605, 22.82684), (48.11965, 22.73476), (48.09169, 22.67275),
    (48.10759, 22.59023), (48.14527, 22.59817), (48.19614, 22.57034), (48.25386, 22.48920),
    (48.23418, 22.38441), (48.27891, 22.33867), (48.35402, 22.31758), (48.38663, 22.23966),
    (48.41011, 22.26464), (48.42567, 22.20706), (48.38018, 22.13464), (48.39266, 22.02147),
    (48.36134, 21.92799), (48.36337, 21.83695), (48.33412, 21.83364), (48.33907, 21.76395),
    (48.39203, 21.66455), (48.50898, 21.61385), (48.50834, 21.54211), (48.55093, 21.51403),
    (48.57487, 21.45067),
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

    # Shapely polygon a pontos cellakivágáshoz (OCHA/UNHCR határvonal)
    hungary_shapely = make_valid(ShapelyPoly([(lo, la) for la, lo in HUNGARY_POLY]))

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

        half = GRID_STEP / 2

        for i, lat in enumerate(lats):
            lat = float(lat)
            for j, lon in enumerate(lons):
                lon = float(lon)

                # Shapely metszet: cella ∩ Magyarország
                cell_box = shapely_box(lon - half, lat - half, lon + half, lat + half)
                clipped  = cell_box.intersection(hungary_shapely)
                if clipped.is_empty:
                    continue

                # Határmenti cella? → tároljuk a levágott geometriát
                coverage = clipped.area / cell_box.area
                if coverage >= 0.99:
                    geom = None          # belső cella: frontend négyzetet rajzol
                else:
                    mapped = shapely_mapping(clipped)
                    gtype  = mapped["type"]
                    if gtype == "Polygon":
                        geom = [[round(c[0],5), round(c[1],5)] for c in mapped["coordinates"][0]]
                    elif gtype == "MultiPolygon":
                        # legnagyobb rész
                        largest = max(mapped["coordinates"], key=lambda p: ShapelyPoly(p[0]).area)
                        geom = [[round(c[0],5), round(c[1],5)] for c in largest[0]]
                    else:
                        geom = None

                cell_days = []
                for d in range(5):
                    tx = round(float(tmax[d].values[i, j]) - 273.15, 1)
                    tn = round(float(tmin[d].values[i, j]) - 273.15, 1)
                    tm = round((tx + tn) / 2, 1)

                    rh_vals = [float(da.values[i, j]) for da in rh_by_day[d]]
                    rh     = round(float(np.mean(rh_vals))) if rh_vals else None
                    rh_max = round(float(np.max(rh_vals)))  if rh_vals else None

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
                        "rh_max":      rh_max,
                        "precip":      pr,
                        "is_forecast": days[d] >= today,
                        "source":      "icon-eu-dwd",
                    })

                entry = {
                    "lat":  round(lat, 5),
                    "lon":  round(lon, 5),
                    "days": cell_days,
                }
                if geom is not None:
                    entry["geom"] = geom   # csak határmenti celláknál
                result["grid"].append(entry)

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
