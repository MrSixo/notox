// js/disease-models.js — No-tox közös betegségmodell-logika
// ════════════════════════════════════════════════════════════════════════════
// Egyetlen igazságforrás minden oldalnak (dashboard, forecast, field, historical).
// Minden modell az EREDETI publikáció szerinti RH-aggregátumot használja.
//
// Normalizált napi rekord, amit minden hívó átad:
//   { date, tmean, tmax, rh_mean, rh_max, rh_min, trh, precip }
//   - rh_mean : napi átlag RH (%)            → Wolf 1999, lisztharmat
//   - rh_max  : napi max RH (%)              → Coakley, Madden (levélnedvesség)
//   - rh_min  : napi min RH (%)              → AFLA-maize (szárazság, Molnár 2023)
//   - trh     : 15-30°C + RH≥90% órák száma  → De Wolf 2003 (TRH9010 napi komponens)
// ════════════════════════════════════════════════════════════════════════════

const BUILTIN_MODELS = [
  { id:"__dewolf2003",  name:"Fuzárium kalász-rothadás (FHB)",        params:{ topt:22.5, sigma:6, rh_thr:60, precip_min:1, risk_thr:50 } },
  { id:"__wolf1999",    name:"Fuzárium (egyszerűsített logisztikus)",  params:{ topt:20, sigma:8, rh_thr:65, precip_min:2, risk_thr:40 } },
  { id:"__coakley1988", name:"Sárgarozsda (stripe rust)",             params:{ topt:11, sigma:5, rh_thr:80, precip_min:0, risk_thr:30 } },
  { id:"__madden1981",  name:"Levélrozsda (leaf rust) — Madden",      params:{ topt:20, sigma:6, rh_thr:75, precip_min:0, risk_thr:35 } },
  { id:"__pscheidt1993",name:"Lisztharmat (powdery mildew)",          params:{ topt:21, sigma:5, rh_thr:55, precip_min:0, risk_thr:40 } },
  { id:"__afla_maize",  name:"Aflatoxin AFB1 (AFLA-maize) — Kukorica",
    params:{ type:"afla_maize", t_opt:30, t_sigma:6, rh_thr:60, rh_opt:80, stress_t:35, stress_rh:50, risk_thr:40 } },
];

// Modellenkénti RH-aggregátum az eredeti publikáció szerint
const MODEL_CONFIG = {
  __dewolf2003:  { mode:"window_trh", window:10, thr:56, label:">90% RH órák, 10 nap (TRH9010)" },
  __wolf1999:    { mode:"mean7",  label:"7 napos RH-átlag" },
  __coakley1988: { mode:"point",  rh:"rh_max",  label:"napi max RH" },
  __madden1981:  { mode:"point",  rh:"rh_max",  label:"napi max RH (levélnedvesség)" },
  __pscheidt1993:{ mode:"point",  rh:"rh_mean", label:"napi átlag RH" },
  __afla_maize:  { mode:"afla",   label:"hőstressz + szárazság (RH_min)" },
};
function modelConfig(id) {
  return MODEL_CONFIG[id] || { mode:"point", rh:"rh_max", label:"napi max RH" };
}

function loadAllModels() {
  let custom = [];
  try { custom = JSON.parse(localStorage.getItem("notox-models") || "[]"); } catch {}
  return [...BUILTIN_MODELS, ...custom];
}
function getModel(id) {
  return loadAllModels().find(m => m.id === id) || BUILTIN_MODELS[0];
}

// ── Pont-modell képlet (gaussian / logistic / linear_t) ─────────────────────
function runModelDay(params, tmean, rh, precip, tmax) {
  if (tmean === null || tmean === undefined || rh === null || rh === undefined) return 0;

  if (params.type === "linear_t") {
    const dd = Math.max(0, tmean - (params.t_base ?? 10));
    const tF = Math.min(1, dd / (params.dd_max ?? 15));
    const rhF = rh >= (params.rh_thr ?? 60) ? Math.min(1, (rh - (params.rh_thr ?? 60)) / (100 - (params.rh_thr ?? 60))) : 0;
    return Math.min(1, tF * rhF);
  }
  // gaussian / logistic
  const tF = Math.exp(-0.5 * Math.pow((tmean - params.topt) / params.sigma, 2));
  const rhF = rh >= params.rh_thr ? (rh - params.rh_thr) / (100 - params.rh_thr) : 0;
  const pF = !params.precip_min ? 1 : (precip > 0 ? 1 - Math.exp(-precip / params.precip_min) : 0);
  return Math.min(1, tF * rhF * pF);
}

// ── AFLA-maize: Molnár 2023 — hőstressz (T_max) + SZÁRAZSÁG (RH_min) ─────────
function aflaRisk(rec) {
  if (rec.tmax == null || rec.rh_min == null) return 0;
  const tStress = Math.max(0, Math.min(1, (rec.tmax - 28) / (38 - 28)));   // 28→38 °C
  const drought = Math.max(0, Math.min(1, (60 - rec.rh_min) / (60 - 30))); // RH_min 60→30%
  return Math.round(tStress * drought * 100);
}

// ── Sorozat → napi kockázat, a modell RH-aggregátuma / ablaka szerint ───────
// rows: normalizált rekordok tömbje (dátum szerint rendezve)
// → [{date, risk}]
function computeDayRisks(rows, model) {
  const cfg = modelConfig(model.id);
  const p = model.params;

  if (cfg.mode === "afla")
    return rows.map(r => ({ date:r.date, risk: aflaRisk(r) }));

  if (cfg.mode === "point")
    return rows.map(r => ({ date:r.date,
      risk: Math.round(runModelDay(p, r.tmean, (r[cfg.rh] ?? r.rh_max ?? r.rh_mean), r.precip, r.tmax) * 100) }));

  if (cfg.mode === "mean7")  // Wolf: 7 napos mozgóátlag RH
    return rows.map((r, i) => {
      const w = rows.slice(Math.max(0, i-6), i+1).map(x => x.rh_mean).filter(v => v != null);
      const rhAvg = w.length ? w.reduce((a,b)=>a+b,0)/w.length : null;
      return { date:r.date, risk: Math.round(runModelDay(p, r.tmean, rhAvg, r.precip, r.tmax) * 100) };
    });

  if (cfg.mode === "window_trh")  // De Wolf: 10 napos gördülő TRH9010 → logisztikus
    return rows.map((r, i) => {
      const w = rows.slice(Math.max(0, i-(cfg.window-1)), i+1).map(x => x.trh).filter(v => v != null);
      const trh = w.reduce((a,b)=>a+b,0);
      return { date:r.date, risk: Math.round(100 / (1 + Math.exp(-(trh - cfg.thr) / 20))) };
    });

  // fallback
  return rows.map(r => ({ date:r.date,
    risk: Math.round(runModelDay(p, r.tmean, (r.rh_max ?? r.rh_mean), r.precip, r.tmax) * 100) }));
}

// Egy adott dátum kockázata a sorozatból (dashboard/field widgethez).
// A window/mean modellek a megelőző napokat is felhasználják (rows tartalmazza a múltat).
function riskForDate(rows, model, dateStr) {
  if (!rows || !rows.length) return null;
  const dr = computeDayRisks(rows, model);
  const hit = dateStr ? dr.find(d => d.date === dateStr) : null;
  return (hit ?? dr[dr.length - 1])?.risk ?? null;
}

// Előrejelzés-rekord (DWD/AROME/Open-Meteo) → normalizált séma
function normalizeForecast(d) {
  return {
    date:    d.date,
    tmean:   d.tmean,
    tmax:    d.tmax,
    rh_mean: d.rh_mean,
    rh_max:  d.rh_max,
    rh_min:  d.rh_min,
    trh:     d.trh ?? null,
    precip:  d.precip,
  };
}
