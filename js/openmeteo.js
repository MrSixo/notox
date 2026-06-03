// Open-Meteo API — No-tox projekt
// Teljesen független az AgroSimLab-tól, közvetlen böngésző-hívások

// ── Konfiguráció ───────────────────────────────────────────────────────────

function _openMeteoBase() {
  const key = localStorage.getItem("notox-openmeteo-key");
  return key ? "https://customer-api.open-meteo.com/v1" : "https://api.open-meteo.com/v1";
}
function _openMeteoKey() {
  return localStorage.getItem("notox-openmeteo-key") || null;
}

// "icon" (ICON-EU, alapértelmezett) vagy "ecmwf"
function _getWeatherModel() {
  try {
    return JSON.parse(localStorage.getItem("notox-settings-meteo") || "{}").weatherModel || "icon";
  } catch { return "icon"; }
}

const BULK_MAX = 100; // Open-Meteo ajánlott limit egy kérésben

// ── ICON-EU (napi endpoint) ────────────────────────────────────────────────

const _ICON_DAILY_VARS = [
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "relative_humidity_2m_max",
  "relative_humidity_2m_min",
].join(",");

function _parseIconDaily(daily, todayStr) {
  return daily.time.map((date, i) => {
    const tmax  = daily.temperature_2m_max[i];
    const tmin  = daily.temperature_2m_min[i];
    const rhMax = daily.relative_humidity_2m_max[i];
    const rhMin = daily.relative_humidity_2m_min[i];
    return {
      date,
      tmax:    tmax  ?? null,
      tmin:    tmin  ?? null,
      tmean:   tmax != null && tmin != null ? Math.round((tmax + tmin) / 2 * 10) / 10 : null,
      rh_mean: rhMax != null && rhMin != null ? Math.round((rhMax + rhMin) / 2) : null,
      rh_max:  rhMax != null ? Math.round(rhMax) : null,
      precip:  daily.precipitation_sum[i] ?? 0,
      is_forecast: date >= todayStr,
      source: "icon",
    };
  });
}

// Helyi óra formátum: "2026-05-25T14:00" — egyezik az Open-Meteo hourly.time formátumával
function _localHourStr(date) {
  const p = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}T${p(date.getHours())}:00`;
}

// Pillanatnyi (legutóbbi teljes óra) hőm./RH kinyerése az óránkénti adatból
function _extractCurrent(hourly, todayStr, tempKey, rhKey) {
  const nowHour = _localHourStr(new Date());
  let bestIdx = -1;
  hourly.time.forEach((t, i) => { if (t <= nowHour) bestIdx = i; });
  if (bestIdx < 0) return;
  const todayDate = hourly.time[bestIdx]?.slice(0, 10);
  if (todayDate !== todayStr) return; // csak mai adatot mutatunk
  return {
    t_current:      hourly[tempKey][bestIdx] ?? null,
    rh_current:     rhKey ? (hourly[rhKey][bestIdx] ?? null) : null,
    current_time:   hourly.time[bestIdx],
  };
}

async function _fetchWeatherICON(lat, lon, days) {
  const apiKey  = _openMeteoKey();
  const baseUrl = _openMeteoBase();
  const todayStr = new Date().toISOString().slice(0, 10);

  const p = new URLSearchParams({
    latitude:      lat,
    longitude:     lon,
    daily:         _ICON_DAILY_VARS,
    hourly:        "temperature_2m,relative_humidity_2m",  // pillanatnyi értékekhez
    forecast_days: Math.min(days, 16),
    past_days:     Math.min(days > 7 ? 7 : days, 7),
    timezone:      "Europe/Budapest",
  });
  if (apiKey) p.append("apikey", apiKey);

  const res = await fetch(`${baseUrl}/forecast?${p}`);
  if (!res.ok) throw new Error(`ICON-EU hiba: ${res.status}`);
  const json = await res.json();

  const daily = _parseIconDaily(json.daily, todayStr);

  // Pillanatnyi hőm./RH hozzáfűzése a mai naphoz
  if (json.hourly) {
    const curr = _extractCurrent(json.hourly, todayStr, "temperature_2m", "relative_humidity_2m");
    if (curr) {
      const today = daily.find(d => d.date === todayStr);
      if (today) Object.assign(today, curr);
    }
  }
  return daily;
}

const BULK_CONCURRENT = 1; // szekvenciális — Open-Meteo free API ~5-6 konkurens kérést enged

async function _bulkChunkICON(chunk, start, results, apiKey, baseUrl, todayStr, days, _retry = 1) {
  const p = new URLSearchParams({
    daily:         _ICON_DAILY_VARS,
    forecast_days: Math.min(days, 16),
    past_days:     Math.min(days, 7),
    timezone:      "Europe/Budapest",
  });
  chunk.forEach(loc => { p.append("latitude", loc.lat); p.append("longitude", loc.lon); });
  if (apiKey) p.append("apikey", apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000); // 12s timeout
  try {
    const res = await fetch(`${baseUrl}/forecast?${p}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`ICON bulk HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(`API: ${json.reason || "ismeretlen hiba"}`);
    const items = Array.isArray(json) ? json : [json];
    items.forEach((item, ci) => {
      try { results[start + ci] = _parseIconDaily(item.daily, todayStr); } catch {}
    });
  } catch (err) {
    clearTimeout(timeout);
    console.warn(`[openmeteo] chunk start=${start} hiba:`, err.message);
    if (_retry > 0) {
      await new Promise(r => setTimeout(r, 1500));
      return _bulkChunkICON(chunk, start, results, apiKey, baseUrl, todayStr, days, _retry - 1);
    }
  }
}

async function _fetchWeatherBulkICON(locations, days, onChunkDone) {
  const apiKey  = _openMeteoKey();
  const baseUrl = _openMeteoBase();
  const todayStr = new Date().toISOString().slice(0, 10);
  const results = new Array(locations.length).fill(null);

  // Chunks összeállítása
  const chunks = [];
  for (let s = 0; s < locations.length; s += BULK_MAX) {
    chunks.push({ start: s, locs: locations.slice(s, s + BULK_MAX) });
  }

  // BULK_CONCURRENT kérés párhuzamosan, csoport-onként
  // 200ms szünet csoportok között — rate limit elkerülése
  for (let g = 0; g < chunks.length; g += BULK_CONCURRENT) {
    if (g > 0) await new Promise(r => setTimeout(r, 200));
    await Promise.all(
      chunks.slice(g, g + BULK_CONCURRENT).map(({ start, locs }) =>
        _bulkChunkICON(locs, start, results, apiKey, baseUrl, todayStr, days)
      )
    );
    if (onChunkDone) {
      const done = Math.min(g + BULK_CONCURRENT, chunks.length);
      onChunkDone([...results], done, chunks.length);
    }
  }
  return results;
}

// ── ECMWF IFS (hourly → napi aggregálás) ──────────────────────────────────
// Megjegyzés: Az ECMWF nem közöl relative_humidity_2m-t, ezért
// relative_humidity_1000hPa-t használunk (legközelebbi nyomásszint a felszínhez).

const _ECMWF_HOURLY_VARS = [
  "temperature_2m",
  "precipitation",
  "relative_humidity_1000hPa",
].join(",");

// Hourly ECMWF JSON → napi aggregált [{date, tmax, tmin, tmean, rh_mean, precip}, ...]
function _aggregateEcmwfHourly(hourly, todayStr) {
  const byDate = {};

  hourly.time.forEach((timeStr, i) => {
    const date = timeStr.slice(0, 10);
    if (!byDate[date]) byDate[date] = { temps: [], rhs: [], precip: 0 };
    const t  = hourly.temperature_2m[i];
    const rh = hourly.relative_humidity_1000hPa[i];
    const pr = hourly.precipitation[i];
    if (t  != null) byDate[date].temps.push(t);
    if (rh != null) byDate[date].rhs.push(rh);
    byDate[date].precip += pr ?? 0;
  });

  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => {
      const tmax   = d.temps.length ? Math.max(...d.temps)                                  : null;
      const tmin   = d.temps.length ? Math.min(...d.temps)                                  : null;
      const tmean  = d.temps.length ? d.temps.reduce((s, v) => s + v, 0) / d.temps.length  : null;
      const rh_raw = d.rhs.length   ? d.rhs.reduce((s, v) => s + v, 0)   / d.rhs.length    : null;
      const rh_mx  = d.rhs.length   ? Math.max(...d.rhs)                                   : null;
      return {
        date,
        tmax:    tmax   !== null ? Math.round(tmax  * 10) / 10 : null,
        tmin:    tmin   !== null ? Math.round(tmin  * 10) / 10 : null,
        tmean:   tmean  !== null ? Math.round(tmean * 10) / 10 : null,
        rh_mean: rh_raw !== null ? Math.round(rh_raw)          : null,
        rh_max:  rh_mx  !== null ? Math.round(rh_mx)           : null,
        precip:  Math.round(d.precip * 10) / 10,
        is_forecast: date >= todayStr,
        source: "ecmwf",
      };
    });
}

async function _fetchWeatherECMWF(lat, lon, days) {
  const apiKey  = _openMeteoKey();
  const baseUrl = _openMeteoBase();
  const todayStr = new Date().toISOString().slice(0, 10);

  const p = new URLSearchParams({
    latitude:      lat,
    longitude:     lon,
    hourly:        _ECMWF_HOURLY_VARS,
    forecast_days: Math.min(days, 10),   // ECMWF max 10 nap
    past_days:     Math.min(days, 3),
    timezone:      "Europe/Budapest",
  });
  if (apiKey) p.append("apikey", apiKey);

  const res = await fetch(`${baseUrl}/ecmwf?${p}`);
  if (!res.ok) throw new Error(`ECMWF hiba: ${res.status}`);
  const json = await res.json();

  const daily = _aggregateEcmwfHourly(json.hourly, todayStr);

  // Pillanatnyi hőm. (az ECMWF hourly adat már kézben van, nem kell extra kérés)
  const curr = _extractCurrent(json.hourly, todayStr, "temperature_2m", "relative_humidity_1000hPa");
  if (curr) {
    const today = daily.find(d => d.date === todayStr);
    if (today) Object.assign(today, curr);
  }
  return daily;
}

async function _fetchWeatherBulkECMWF(locations, days) {
  const apiKey  = _openMeteoKey();
  const baseUrl = _openMeteoBase();
  const todayStr = new Date().toISOString().slice(0, 10);
  const results = new Array(locations.length).fill(null);

  for (let start = 0; start < locations.length; start += BULK_MAX) {
    const chunk = locations.slice(start, start + BULK_MAX);
    const p = new URLSearchParams({
      hourly:        _ECMWF_HOURLY_VARS,
      forecast_days: Math.min(days, 10),
      past_days:     Math.min(days, 3),
      timezone:      "Europe/Budapest",
    });
    chunk.forEach(loc => { p.append("latitude", loc.lat); p.append("longitude", loc.lon); });
    if (apiKey) p.append("apikey", apiKey);

    try {
      const res = await fetch(`${baseUrl}/ecmwf?${p}`);
      if (!res.ok) throw new Error(`ECMWF bulk hiba: ${res.status}`);
      const json = await res.json();
      const items = Array.isArray(json) ? json : [json];
      items.forEach((item, ci) => {
        try { results[start + ci] = _aggregateEcmwfHourly(item.hourly, todayStr); } catch {}
      });
    } catch { /* null marad */ }
  }
  return results;
}

// ── Publikus API — automatikusan a beállított modellt használja ────────────

/**
 * Napi időjárás-adatok egyetlen ponthoz.
 * A modell (ECMWF / ICON-EU) az admin panelben állítható.
 * @param {number} lat
 * @param {number} lon
 * @param {number} days — napok száma (ECMWF: max 10, ICON: max 16)
 * @returns {Promise<Array>} — [{date, tmax, tmin, tmean, rh_mean, precip, is_forecast, source}, ...]
 */
async function fetchWeather(lat, lon, days = 10) {
  const model = _getWeatherModel();
  return model === "icon"
    ? _fetchWeatherICON(lat, lon, days)
    : _fetchWeatherECMWF(lat, lon, days);
}

/**
 * Tömeges napi időjárás-lekérés (egyszerre max. 100 pont / API-hívás).
 * @param {Array<{lat:number, lon:number}>} locations
 * @param {number} days
 * @returns {Promise<Array<Array|null>>}
 */
async function fetchWeatherBulk(locations, days = 1, onChunkDone) {
  const model = _getWeatherModel();
  return model === "icon"
    ? _fetchWeatherBulkICON(locations, days, onChunkDone)
    : _fetchWeatherBulkECMWF(locations, days, onChunkDone);
}
