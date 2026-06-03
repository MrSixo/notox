// OMSZ historikus napi adatok — No-tox adatréteg
// Lazy loading: az index minden állomást felsorol, de a napi sort
// csak a kiválasztott állomásra töltjük le (per-állomás gz).

const HIST_BASE = "https://mrsixo.github.io/notox/data/historical";

let _histIndex = null;
const _histStationCache = {};   // id → station objektum

/** Állomás-index betöltése (id, név, koordináta, időszak). */
async function loadHistIndex() {
  if (_histIndex) return _histIndex;
  const res = await fetch(`${HIST_BASE}/index.json`);
  if (!res.ok) throw new Error(`Historikus index HTTP ${res.status}`);
  _histIndex = await res.json();
  console.info(`[historikus] ${_histIndex.count} állomás indexelve`);
  return _histIndex;
}

/** Egy állomás napi idősorának betöltése (gz). */
async function loadHistStation(id) {
  if (_histStationCache[id]) return _histStationCache[id];
  const res = await fetch(`${HIST_BASE}/st_${id}.json.gz`);
  if (!res.ok) throw new Error(`Állomás ${id} HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  let text;
  if (typeof DecompressionStream !== "undefined") {
    const ds = new DecompressionStream("gzip");
    text = await new Response(new Blob([buf]).stream().pipeThrough(ds)).text();
  } else {
    text = new TextDecoder().decode(buf);
  }
  const st = JSON.parse(text);
  // daily sorok → objektum-tömb a cols alapján (robusztus az oszlopsorrendre)
  // cols pl.: ["date","t","tn","tx","u","umax","rau"]
  const cols = st.cols || ["date","t","tn","tx","u","rau"];
  st.rows = st.daily.map(r => {
    const o = {};
    cols.forEach((c, i) => { o[c] = r[i]; });
    return o;
  });
  _histStationCache[id] = st;
  return st;
}
