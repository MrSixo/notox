// DWD ICON-EU előre-feldolgozott JSON — No-tox frontend integráció
// Kompatibilis a fetchWeather() / fetchWeatherBulk() interfésszekkel
//
// BEÁLLÍTÁS: cseréld le az alábbi URL-t a saját GitHub Pages URL-edre
// Formátum: https://[GITHUB_FELHASZNALONEV].github.io/notox/data/dwd_hungary.json

const DWD_JSON_URL = "https://MrSixo.github.io/notox/data/dwd_hungary.json";
const DWD_CACHE_TTL = 30 * 60 * 1000; // 30 perc

let _dwdData  = null;
let _dwdIndex = null;   // "lat_lon" → cell gyors kereséshez
let _dwdTs    = 0;

async function _loadDWD() {
  if (_dwdData && Date.now() - _dwdTs < DWD_CACHE_TTL) return _dwdData;

  const res = await fetch(DWD_JSON_URL);
  if (!res.ok) throw new Error(`DWD JSON HTTP ${res.status}`);

  _dwdData = await res.json();
  _dwdTs   = Date.now();

  // Index felépítése: gyors koordináta → cella keresés
  _dwdIndex = {};
  for (const cell of _dwdData.grid) {
    const key = `${cell.lat.toFixed(4)}_${cell.lon.toFixed(4)}`;
    _dwdIndex[key] = cell;
  }
  console.info(`[DWD] ${_dwdData.grid.length} cella betöltve · futás: ${_dwdData.run}`);
  return _dwdData;
}

function _snapToGrid(lat, lon, step = 0.0625) {
  const r = v => Math.round(Math.round(v / step) * step * 10000) / 10000;
  return { lat: r(lat), lon: r(lon) };
}

function _findCell(lat, lon) {
  const { lat: sLat, lon: sLon } = _snapToGrid(lat, lon);
  const key = `${sLat.toFixed(4)}_${sLon.toFixed(4)}`;
  return _dwdIndex?.[key] ?? null;
}

/**
 * DWD ICON-EU napi adatok egyetlen ponthoz.
 * Visszatér ugyanolyan formátumban mint fetchWeather().
 * @param {number} lat
 * @param {number} lon
 * @param {number} days — max 5
 * @returns {Promise<Array>}
 */
async function fetchWeatherDWD(lat, lon, days = 5) {
  await _loadDWD();
  const cell = _findCell(lat, lon);
  return cell ? cell.days.slice(0, days) : [];
}

/**
 * DWD ICON-EU bulk lekérés.
 * Azonos interfész mint fetchWeatherBulk() — drop-in csere.
 * @param {Array<{lat, lon}>} locations
 * @param {number} days — max 5
 * @returns {Promise<Array<Array|null>>}
 */
async function fetchWeatherBulkDWD(locations, days = 5) {
  await _loadDWD();
  return locations.map(loc => {
    const cell = _findCell(loc.lat, loc.lon);
    return cell ? cell.days.slice(0, days) : null;
  });
}

/**
 * DWD rácscellák közvetlenül a JSON-ból — nincs nearest-neighbor keresés.
 * Visszatér a meteo.html gridData[] formátumban.
 * @param {number} days — max 5
 * @param {Array}  universityZones — [{name, lat, lon}] a zónajelöléshez (opcionális)
 * @param {number} zoneStep  — 0.0625
 * @param {number} zoneRadius — 2
 * @returns {Promise<Array>}
 */
async function getDWDGridData(days = 5, universityZones = [], zoneStep = 0.0625, zoneRadius = 2) {
  const data = await _loadDWD();
  const step = data.step || 0.0625;
  const half = step / 2;
  const today = new Date().toISOString().slice(0, 10);

  // Zóna-lookup: O(1) cella-szintű ellenőrzéshez
  const zoneR = zoneRadius * zoneStep;
  function isInZone(lat, lon) {
    for (const z of universityZones) {
      if (Math.abs(z.lat - lat) <= zoneR + half &&
          Math.abs(z.lon - lon) <= zoneR + half) return z.name;
    }
    return null;
  }

  return data.grid.map(c => {
    const dayData = c.days.slice(0, days);
    const row = dayData.find(d => d.date === today) || dayData[0] || {};
    const zoneName = isInZone(c.lat, c.lon);
    return {
      cell: {
        latMin: Math.round((c.lat - half) * 100000) / 100000,
        latMax: Math.round((c.lat + half) * 100000) / 100000,
        lonMin: Math.round((c.lon - half) * 100000) / 100000,
        lonMax: Math.round((c.lon + half) * 100000) / 100000,
        centerLat: c.lat,
        centerLon: c.lon,
        geom:     c.geom || null,  // határmenti cella levágott geometriája
        isZone:   !!zoneName,
        zoneName: zoneName || null,
      },
      tmean:   row.tmean   ?? null,
      tmin:    row.tmin    ?? null,
      tmax:    row.tmax    ?? null,
      rh_mean: row.rh_mean ?? null,
      precip:  row.precip  ?? null,
    };
  });
}

/**
 * Ellenőrzi, hogy a DWD JSON elérhető és friss-e (max 13 óra régi).
 * @returns {Promise<boolean>}
 */
async function isDWDAvailable() {
  try {
    const data = await _loadDWD();
    // ts = a JSON tényleges letöltési ideje (nem a modell futási ideje)
    // A GitHub Actions 6h-ként frissít → max 13h-s adatot fogadunk el
    const fetchedAt = new Date(data.ts);
    const ageHours  = (Date.now() - fetchedAt.getTime()) / 3600000;
    return ageHours < 13;
  } catch {
    return false;
  }
}
