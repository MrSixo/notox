// No-tox — előrejelzés alkalmazáslogika (több betegség/modell)

let map, marker;
let riskChart = null;

const LOCATIONS = {
  "47.4979,19.0402": "Budapest",
  "47.5977,19.3631": "Gödöllő (MATE)",
  "47.7864,19.9309": "Gyöngyös (MATE)",
  "47.3920,18.9167": "Érd",
  "47.1703,19.7997": "Cegléd",
  "46.9061,19.6913": "Kecskemét",
  "47.3192,20.9253": "Karcag",
  "46.8630,20.5420": "Szarvas",
  "46.2530,20.1480": "Szeged",
  "46.7660,17.2469": "Keszthely (MATE)",
  "46.7989,17.5107": "Badacsonytomaj",
  "46.3667,17.7967": "Kaposvár (MATE)",
};

// Line colors for multiple datasets
const LINE_COLORS = [
  "#4caf7d", "#5b9cf6", "#d4a017", "#e05252",
  "#a78bfa", "#f97316", "#34d399", "#f43f5e",
];

// ── Model registry ────────────────────────────────────────────────────────
// Beépített modellek — szinkronban a models.html BUILTIN_MODELS-szel
const BUILTIN_MODELS = [
  { id: "__dewolf2003",  name: "Fuzárium kalász-rothadás (FHB)",           params: { topt: 22.5, sigma: 6, rh_thr: 60, precip_min: 1,   risk_thr: 50 } },
  { id: "__wolf1999",    name: "Fuzárium (egyszerűsített logisztikus)",     params: { topt: 20,   sigma: 8, rh_thr: 65, precip_min: 2,   risk_thr: 40 } },
  { id: "__coakley1988", name: "Sárgarozsda (stripe rust)",                 params: { topt: 11,   sigma: 5, rh_thr: 80, precip_min: 0,   risk_thr: 30 } },
  { id: "__madden1981",  name: "Levélrozsda (leaf rust) — Madden",          params: { topt: 20,   sigma: 6, rh_thr: 75, precip_min: 0,   risk_thr: 35 } },
  { id: "__pscheidt1993",name: "Lisztharmat (powdery mildew)",              params: { topt: 21,   sigma: 5, rh_thr: 55, precip_min: 0,   risk_thr: 40 } },
];

// Beépített + egyéni modellek (notox-models localStorage)
function loadModels() {
  let custom = [];
  try { custom = JSON.parse(localStorage.getItem("notox-models") || "[]"); } catch {}
  return [...BUILTIN_MODELS, ...custom];
}

// Generic risk calc — supports gaussian and linear_t formula types
function runModelDay(params, tmean, rh, precip) {
  if (tmean === null || rh === null) return 0;

  const formulaType = params.type || "gaussian";

  if (formulaType === "linear_t") {
    // Lineáris hőfaktor (degree-day alapú)
    const tBase  = params.t_base  ?? 10;
    const ddMax  = params.dd_max  ?? 15;
    const rhThr  = params.rh_thr  ?? 60;
    const dd     = Math.max(0, tmean - tBase);
    const tFactor  = Math.min(1, dd / ddMax);
    const rhFactor = rh >= rhThr
      ? Math.min(1, (rh - rhThr) / (100 - rhThr))
      : 0;
    return Math.min(1, tFactor * rhFactor);
  }

  // Gauss alapú (gaussian + logistic egyaránt)
  const tFactor  = Math.exp(-0.5 * Math.pow((tmean - params.topt) / params.sigma, 2));
  const rhFactor = rh >= params.rh_thr ? (rh - params.rh_thr) / (100 - params.rh_thr) : 0;
  // precip_min === 0 → levéledfesség / harmat elég, csapadék nem feltétel (sárgarozsda, levélrozsda, lisztharmat)
  const pFactor = !params.precip_min
    ? 1
    : (precip > 0 ? 1 - Math.exp(-precip / params.precip_min) : 0);
  return Math.min(1, tFactor * rhFactor * pFactor);
}

function simulateModel(model, weatherSeries) {
  const daily = weatherSeries.map(d => {
    const raw  = runModelDay(model.params, d.tmean, d.rh_mean, d.precip);
    const risk = Math.round(raw * 100 * 10) / 10;
    const rl   = riskLevel(risk);
    return { date: d.date, risk, is_forecast: d.is_forecast, ...rl };
  });
  const risks = daily.map(d => d.risk);
  const maxRisk = Math.max(...risks, 0);
  const avgRisk = risks.length ? risks.reduce((a, b) => a + b, 0) / risks.length : 0;
  const criticalDays = risks.filter(r => r >= 75).length;
  const peakIdx = risks.indexOf(maxRisk);
  return { daily, summary: { maxRisk, avgRisk, criticalDays, peakDay: daily[peakIdx]?.date ?? null, level: riskLevel(maxRisk) } };
}

// ── Disease checklist ──────────────────────────────────────────────────────
function buildDiseaseChecks() {
  const models = loadModels();
  const container = document.getElementById("disease-checks");
  if (!container) return;

  container.innerHTML = models.map((m, i) => {
    const color = LINE_COLORS[i % LINE_COLORS.length];
    const checked = i === 0 ? "checked" : "";
    return `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;
        padding:5px 10px;border-radius:20px;border:1px solid var(--border);
        font-size:11px;color:var(--text-muted);transition:border-color .12s,color .12s;
        background:var(--bg-2);">
      <input type="checkbox" data-model-id="${m.id}" ${checked}
        style="accent-color:${color};width:12px;height:12px;" />
      <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>
      ${m.name}
    </label>`;
  }).join("");
}

function selectedModelIds() {
  return [...document.querySelectorAll("#disease-checks input:checked")]
    .map(el => el.dataset.modelId);
}

// ── Leaflet map ───────────────────────────────────────────────────────────
function _isLight() {
  return document.documentElement.classList.contains("theme-light") ||
         document.body?.classList.contains("theme-light");
}
function _cartoTiles() {
  const t = _isLight() ? "light_all" : "dark_all";
  return [`https://a.basemaps.cartocdn.com/${t}/{z}/{x}/{y}.png`,
          `https://b.basemaps.cartocdn.com/${t}/{z}/{x}/{y}.png`];
}
function _mapStyle() {
  return {
    version: 8,
    sources: { carto: { type: "raster", tiles: _cartoTiles(), tileSize: 256,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attribution">CARTO</a>' } },
    layers:  [{ id: "carto-base", type: "raster", source: "carto" }],
  };
}

function initMap() {
  map = new maplibregl.Map({
    container: "map",
    style:  _mapStyle(),
    center: [19.4, 47.2],   // [lng, lat]
    zoom:   7,
    attributionControl: false,
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

  // Helyszínjelölő — GeoJSON pont
  map.on("load", () => {
    map.addSource("loc", { type: "geojson",
      data: { type: "Feature", geometry: { type: "Point", coordinates: [19.0402, 47.4979] }, properties: {} }
    });
    map.addLayer({ id: "loc-circle", type: "circle", source: "loc",
      paint: { "circle-radius": 9, "circle-color": "#4caf7d",
               "circle-stroke-color": "#0b0f0d", "circle-stroke-width": 2, "circle-opacity": 0.85 }
    });
  });

  // Térkép kattintás → helyszín beállítás
  map.on("click", e => {
    const { lat, lng } = e.lngLat;
    setLocation(lat, lng, `${lat.toFixed(3)}, ${lng.toFixed(3)}`);
    document.getElementById("sel-location").value = "custom";
    document.getElementById("custom-row").style.display = "flex";
    document.getElementById("inp-lat").value = lat.toFixed(4);
    document.getElementById("inp-lon").value = lng.toFixed(4);
  });

  // Témaváltás figyelése
  const obs = new MutationObserver(() => {
    map.setStyle(_mapStyle());
    map.once("style.load", () => {
      map.addSource("loc", { type: "geojson",
        data: { type: "Feature", geometry: { type: "Point", coordinates: _markerCoords }, properties: {} }
      });
      map.addLayer({ id: "loc-circle", type: "circle", source: "loc",
        paint: { "circle-radius": 9, "circle-color": "#4caf7d",
                 "circle-stroke-color": "#0b0f0d", "circle-stroke-width": 2, "circle-opacity": 0.85 }
      });
    });
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  obs.observe(document.body,            { attributes: true, attributeFilter: ["class"] });
}

let _markerCoords = [19.0402, 47.4979]; // [lng, lat]

function setLocation(lat, lon, label) {
  _markerCoords = [lon, lat];
  if (map && map.getSource("loc")) {
    map.getSource("loc").setData({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {},
    });
  }
  const zoom = map ? (map.getZoom() < 8 ? 9 : map.getZoom()) : 9;
  if (map) map.flyTo({ center: [lon, lat], zoom, duration: 500 });
  document.getElementById("loc-label").textContent = label;
}

// ── Event handlers ────────────────────────────────────────────────────────
// Guard: ezek az elemek csak forecast.html-en léteznek
const _selLoc = document.getElementById("sel-location");
if (_selLoc) {
  _selLoc.addEventListener("change", function () {
    const custom = document.getElementById("custom-row");
    if (this.value === "custom") { custom.style.display = "flex"; return; }
    custom.style.display = "none";
    const [lat, lon] = this.value.split(",").map(Number);
    setLocation(lat, lon, LOCATIONS[this.value] || this.value);
  });
}
const _btnRun = document.getElementById("btn-run");
if (_btnRun) _btnRun.addEventListener("click", runForecast);

// ── Run ───────────────────────────────────────────────────────────────────
async function runForecast() {
  clearError();

  const selVal = document.getElementById("sel-location").value;
  let lat, lon;
  if (selVal === "custom") {
    lat = parseFloat(document.getElementById("inp-lat").value);
    lon = parseFloat(document.getElementById("inp-lon").value);
  } else {
    [lat, lon] = selVal.split(",").map(Number);
  }
  if (isNaN(lat) || isNaN(lon)) { showError("Érvényes koordinátát adj meg!"); return; }

  const selectedIds = selectedModelIds();
  if (!selectedIds.length) { showError("Válassz legalább egy betegséget / modellt!"); return; }

  const days = parseInt(document.getElementById("sel-days").value);
  setLoading(true);

  try {
    const dwdOk = await isDWDAvailable().catch(() => false);
    let weather;
    if (dwdOk && days <= 5) {
      weather = await fetchWeatherDWD(lat, lon, 5);
      const src = document.getElementById("sub-source");
      if (src) src.textContent = "DWD ICON-EU · 7 km";
    } else {
      weather = await fetchWeather(lat, lon, days);
      const src = document.getElementById("sub-source");
      if (src) src.textContent = "Open-Meteo ICON-EU";
    }
    if (!weather.length) throw new Error("Nem érkezett időjárás-adat.");

    const today = new Date().toISOString().slice(0, 10);
    const forecast = weather.filter(d => d.date >= today);

    const allModels = loadModels();
    const activeModels = allModels.filter(m => selectedIds.includes(m.id));

    // Run simulation for each selected model
    const results = activeModels.map((m, i) => ({
      model: m,
      color: LINE_COLORS[i % LINE_COLORS.length],
      ...simulateModel(m, forecast),
    }));

    // KPIs based on worst-case across all selected models
    const worstSummary = results.reduce((worst, r) =>
      r.summary.maxRisk > worst.maxRisk ? r.summary : worst,
      results[0].summary
    );
    renderKPIs(worstSummary);
    renderChart(results, forecast.map(d => d.date));
    renderTable(results);

    document.getElementById("table-card").style.display = "";
    document.getElementById("chart-title").textContent =
      activeModels.length === 1 ? `${activeModels[0].name} — napi kockázat` : `Napi kockázat (${activeModels.length} modell)`;
    document.getElementById("sub-line").textContent =
      `Lat ${lat.toFixed(3)} · Lon ${lon.toFixed(3)} · ${forecast.length} nap · ${new Date().toLocaleTimeString("hu-HU")}`;

    appStatus("Kész", "ok");
  } catch (e) {
    showError(e.message || "Hiba történt az adatok lekérésekor.");
    appStatus("Hiba", "err");
  } finally {
    setLoading(false);
  }
}

// ── KPIs ──────────────────────────────────────────────────────────────────
function renderKPIs(s) {
  setText("kpi-max", s.maxRisk.toFixed(1));
  setText("kpi-max-lbl", s.level.label);
  document.getElementById("kpi-max-lbl").style.color = s.level.color;
  setText("kpi-avg", s.avgRisk.toFixed(1));
  setText("kpi-crit", s.criticalDays);
  document.getElementById("kpi-crit").style.color = s.criticalDays ? "#e05252" : "#4caf7d";
  setText("kpi-crit-lbl", s.criticalDays ? "kritikus nap" : "nincs kritikus nap");
  setText("kpi-peak", s.peakDay ?? "—");
}

// ── Chart — multi-line ────────────────────────────────────────────────────
function renderChart(results, labels) {
  const ph = document.getElementById("chart-ph");
  const canvas = document.getElementById("risk-canvas");
  ph.style.display = "none";
  canvas.style.display = "block";

  if (riskChart) riskChart.destroy();

  const datasets = results.map(r => ({
    label: r.model.name,
    data: r.daily.map(d => d.risk),
    borderColor: r.color,
    backgroundColor: r.color + "22",
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 5,
    tension: 0.3,
    fill: results.length === 1,
  }));

  // Add forecast boundary line
  const forecastStart = results[0]?.daily.findIndex(d => d.is_forecast);

  riskChart = new Chart(canvas, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: results.length > 1,
          labels: { color: "#7a9175", font: { family: "IBM Plex Mono", size: 10 }, boxWidth: 12, padding: 12 },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}`,
          },
        },
        annotation: forecastStart > 0 ? {
          annotations: {
            fcLine: {
              type: "line", xMin: forecastStart - 0.5, xMax: forecastStart - 0.5,
              borderColor: "rgba(255,255,255,.15)", borderWidth: 1, borderDash: [4, 4],
              label: { content: "előrejelzés →", enabled: true, color: "#4a5e48", font: { size: 9 } },
            },
          },
        } : {},
      },
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,.04)" },
          ticks: { color: "#4a5e48", font: { family: "IBM Plex Mono", size: 10 }, maxRotation: 45 },
        },
        y: {
          min: 0, max: 100,
          grid: { color: "rgba(255,255,255,.04)" },
          ticks: { color: "#4a5e48", font: { family: "IBM Plex Mono", size: 10 } },
          title: { display: true, text: "Kockázat (0–100)", color: "#4a5e48", font: { size: 10 } },
        },
      },
    },
  });
}

// ── Table — multi-model columns ───────────────────────────────────────────
function renderTable(results) {
  // Header
  const head = document.getElementById("tbl-head");
  head.innerHTML = `<tr>
    <th>Dátum</th>
    ${results.map(r => `<th style="color:${r.color};">${r.model.name}</th>`).join("")}
  </tr>`;

  // Body
  const tbody = document.getElementById("tbl-body");
  const days = results[0].daily;
  tbody.innerHTML = days.map((d, i) => `
    <tr>
      <td style="font-family:var(--mono);font-size:11px;color:var(--text-muted);">
        ${d.date}${d.is_forecast ? ' <span style="font-size:9px;color:var(--text-dim);">(előrej.)</span>' : ""}
      </td>
      ${results.map(r => {
        const day = r.daily[i];
        return `<td>
          <div class="risk-bar-wrap">
            <div class="risk-bar"><div class="risk-bar-fill" style="width:${day.risk}%;background:${r.color};"></div></div>
            <span style="font-family:var(--mono);font-size:11px;color:${r.color};min-width:36px;text-align:right;">${day.risk.toFixed(1)}</span>
          </div>
        </td>`;
      }).join("")}
    </tr>
  `).join("");
}

// ── CSV export ────────────────────────────────────────────────────────────
window.exportCsv = function () {
  const rows = [];
  const head = [...document.querySelectorAll("#tbl-head th")].map(th => th.textContent.trim());
  rows.push(head);
  document.querySelectorAll("#tbl-body tr").forEach(tr => {
    rows.push([...tr.querySelectorAll("td")].map(td => td.textContent.trim().replace(/\(előrej\.\)/, "").trim()));
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([rows.map(r => r.join(",")).join("\n")], { type: "text/csv;charset=utf-8;" }));
  a.download = `no-tox-forecast-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
};

// ── Helpers ───────────────────────────────────────────────────────────────
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function showError(msg) {
  const el = document.getElementById("err-box");
  el.textContent = msg; el.style.display = "";
}
function clearError() { document.getElementById("err-box").style.display = "none"; }

function setLoading(on) {
  const btn = document.getElementById("btn-run");
  const sp  = document.getElementById("spinner");
  btn.disabled = on;
  btn.innerHTML = on
    ? "Betöltés…"
    : `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3l9 5-9 5V3z"/></svg> Futtatás`;
  sp.style.display = on ? "block" : "none";
}

function appStatus(msg, type) {
  const el = document.getElementById("status-msg");
  if (!el) return;
  el.textContent = msg;
  el.style.color = type === "err" ? "var(--red)" : "var(--green)";
}

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  setLocation(47.4979, 19.0402, "Budapest");
  buildDiseaseChecks();
});
