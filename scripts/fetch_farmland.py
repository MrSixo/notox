#!/usr/bin/env python3
"""
OSM Farmland lekérdezés → No-tox JSON pipeline
================================================
Letölti Magyarország mezőgazdasági területeit (szántó, rét, legelő,
szőlő, gyümölcsös) az Overpass API-ból, egyszerűsíti a geometriákat
és GeoJSON.gz fájlba menti.

GitHub Actions havonta futtatja.

Függőségek:
  pip install requests shapely
"""

import gzip
import json
import sys
import time
from pathlib import Path

import requests
from shapely.geometry import Polygon, mapping
from shapely.validation import make_valid

# ── Konfiguráció ─────────────────────────────────────────────────────────────

OVERPASS_URL  = "https://overpass-api.de/api/interpreter"
SIMPLIFY_TOL  = 0.0002   # fok ≈ 22 m — elegendő mezőgazdasági celláknál
DEG_TO_M2     = 111000 * 111000 * 0.7  # kb. 47°N-on

# Minimális terület művelési áganként — elhagyott szőlők/gyümölcsösök epidemiológiailag relevánsak
MIN_AREA_BY_TYPE = {
    "farmland": 500,    # 0.05 ha — szántónál csak az apró zajt szűrjük
    "meadow":   200,    # 0.02 ha
    "orchard":  0,      # nincs minimum — kis elhagyott gyümölcsös = fertőzésforrás
    "vineyard": 0,      # nincs minimum — régi szőlők kritikus rezervoárok
    "farmyard": 100,
}

LANDUSE_TYPES = {
    "farmland": "Szántó",
    "meadow":   "Rét/legelő",
    "orchard":  "Gyümölcsös",
    "vineyard": "Szőlő",
    "farmyard": "Gazdasági udvar",
}

OVERPASS_QUERY = """
[out:json][timeout:300];
area["ISO3166-1"="HU"]->.hu;
(
  way["landuse"="farmland"](area.hu);
  way["landuse"="meadow"](area.hu);
  way["landuse"="orchard"](area.hu);
  way["landuse"="vineyard"](area.hu);
);
out body;
>;
out skel qt;
"""


def log(msg: str):
    print(msg, flush=True)


def fetch_overpass() -> dict:
    log("Overpass lekérdezés indítása (akár 5 perc)…")
    for attempt in range(3):
        try:
            r = requests.post(
                OVERPASS_URL,
                data={"data": OVERPASS_QUERY},
                headers={"User-Agent": "No-tox/1.0 agricultural-disease-forecast (github.com/MrSixo/notox)"},
                timeout=360,
            )
            r.raise_for_status()
            data = r.json()
            log(f"  Letöltve: {len(data['elements'])} elem")
            return data
        except Exception as e:
            log(f"  Hiba ({attempt+1}/3): {e}")
            if attempt < 2:
                time.sleep(30)
    raise RuntimeError("Overpass lekérdezés sikertelen 3 próbálkozás után")


def build_node_index(elements: list) -> dict:
    return {
        el["id"]: (el["lon"], el["lat"])
        for el in elements
        if el["type"] == "node" and "lon" in el
    }


def way_to_feature(way: dict, nodes: dict) -> dict | None:
    if "tags" not in way:
        return None
    landuse = way["tags"].get("landuse")
    if landuse not in LANDUSE_TYPES:
        return None

    try:
        coords = [nodes[nid] for nid in way["nodes"] if nid in nodes]
    except KeyError:
        return None

    if len(coords) < 4:
        return None

    try:
        poly = make_valid(Polygon(coords))
    except Exception:
        return None

    if poly.is_empty or not poly.is_valid:
        return None

    # Területszűrés — művelési ágfüggő minimum (szőlő/gyümölcsös: nincs minimum)
    area_m2 = poly.area * DEG_TO_M2
    min_area = MIN_AREA_BY_TYPE.get(landuse, 200)
    if min_area > 0 and area_m2 < min_area:
        return None

    # Egyszerűsítés
    simplified = poly.simplify(SIMPLIFY_TOL, preserve_topology=True)
    if simplified.is_empty:
        return None

    # MultiPolygon esetén a legnagyobb rész
    if simplified.geom_type == "MultiPolygon":
        simplified = max(simplified.geoms, key=lambda g: g.area)

    if simplified.geom_type != "Polygon":
        return None

    return {
        "type": "Feature",
        "geometry": mapping(simplified),
        "properties": {
            "id":      way["id"],
            "lu":      landuse,          # landuse típus (rövid)
            "name":    way["tags"].get("name") or way["tags"].get("ref") or None,
            "area_ha": round(area_m2 / 10000, 1),
        },
    }


def osm_to_geojson(osm: dict) -> dict:
    log("Node index felépítése…")
    nodes = build_node_index(osm["elements"])
    log(f"  {len(nodes):,} node")

    log("Way → GeoJSON konverzió + egyszerűsítés…")
    features, skipped = [], 0
    ways = [el for el in osm["elements"] if el["type"] == "way"]
    log(f"  {len(ways):,} way feldolgozása…")

    for i, way in enumerate(ways):
        feat = way_to_feature(way, nodes)
        if feat:
            features.append(feat)
        else:
            skipped += 1

        if (i + 1) % 10000 == 0:
            log(f"  {i+1:,}/{len(ways):,} — ok: {len(features):,}, skip: {skipped:,}")

    log(f"Kész: {len(features):,} terület, {skipped:,} kihagyva")

    by_type = {}
    for f in features:
        lu = f["properties"]["lu"]
        by_type[lu] = by_type.get(lu, 0) + 1
    for lu, cnt in sorted(by_type.items()):
        log(f"  {LANDUSE_TYPES.get(lu, lu)}: {cnt:,}")

    return {
        "type":     "FeatureCollection",
        "features": features,
        "metadata": {
            "source":    "OpenStreetMap contributors (ODbL)",
            "generated": __import__("datetime").datetime.utcnow().isoformat() + "Z",
            "count":     len(features),
            "simplify":  SIMPLIFY_TOL,
        },
    }


def main():
    out = Path("data/farmland_hungary.geojson.gz")
    out.parent.mkdir(exist_ok=True)

    osm    = fetch_overpass()
    geojson = osm_to_geojson(osm)

    log("Mentés (gzip)…")
    raw = json.dumps(geojson, separators=(",", ":"), ensure_ascii=False).encode()
    with gzip.open(str(out), "wb", compresslevel=9) as f:
        f.write(raw)

    size_mb = out.stat().st_size / 1024 / 1024
    raw_mb  = len(raw) / 1024 / 1024
    log(f"✓ {out}  ({raw_mb:.1f} MB → {size_mb:.1f} MB gzip)")


if __name__ == "__main__":
    main()
