// OMSZ automata állomás mérések — No-tox adatréteg
// Tisztán mért (nem modell) adat. Független a dwd.js modell-rétegtől.
// Forrás: OMSZ Open Data (odp.met.hu), GitHub Actions óránként frissíti.

const OMSZ_JSON_URL = "https://mrsixo.github.io/notox/data/omsz_latest.json";
const OMSZ_CACHE_TTL = 30 * 60 * 1000; // 30 perc

let _omszData = null;
let _omszTs   = 0;

/**
 * OMSZ mérések betöltése (cache-elve).
 * @param {boolean} force — true: cache megkerülése
 * @returns {Promise<{ts, obs_time, source, count, stations}>}
 */
async function loadOMSZ(force = false) {
  if (!force && _omszData && Date.now() - _omszTs < OMSZ_CACHE_TTL) return _omszData;
  const bust = force ? Date.now() : Math.floor(Date.now() / OMSZ_CACHE_TTL);
  const res = await fetch(`${OMSZ_JSON_URL}?_=${bust}`);
  if (!res.ok) throw new Error(`OMSZ JSON HTTP ${res.status}`);
  _omszData = await res.json();
  _omszTs   = Date.now();
  console.info(`[OMSZ] ${_omszData.count} állomás · mérés: ${_omszData.obs_time}`);
  return _omszData;
}

/** Elérhető és friss-e az OMSZ adat (max 3 óra régi mérés)? */
async function isOMSZAvailable() {
  try {
    const data = await loadOMSZ();
    const ageH = (Date.now() - new Date(data.obs_time).getTime()) / 3600000;
    return ageH < 3;
  } catch { return false; }
}
