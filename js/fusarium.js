// Fuzárium kockázati modell — No-tox projekt
// Forrás: De Wolf et al. (2003) Plant Disease + Hooker et al. módszer
// Teljesen független az AgroSimLab-tól

/**
 * Napi fuzárium kockázati index (0–100).
 * De Wolf et al. (2003) — azonos paraméterekkel és képlettel mint az app.js runModelDay():
 *   topt=22.5°C, σ=6, rh_thr=60%, precip_min=1mm
 *
 * Hőmérséklet-tényező: Gauss-görbe, optimum 22.5°C, σ=6
 * Páratartalom-tényező: lineáris, 60% RH felett indul
 * Csapadék-tényező: exponenciális telítés (0 mm esetén 0, ~3 mm-nél max ~95%)
 *
 * @param {number} tmean  — napi átlaghőmérséklet (°C)
 * @param {number} rh     — napi átlagos relatív páratartalom (%)
 * @param {number} precip — napi csapadék (mm)
 * @returns {number} kockázat 0–100
 */
function fusariumRisk(tmean, rh, precip) {
  if (tmean == null || rh == null) return 0;
  const tFactor  = Math.exp(-0.5 * Math.pow((tmean - 22.5) / 6, 2));
  const rhFactor = rh >= 60 ? (rh - 60) / (100 - 60) : 0;
  const pFactor  = (precip ?? 0) > 0 ? 1 - Math.exp(-(precip ?? 0) / 1) : 0;
  return Math.min(100, Math.round(tFactor * rhFactor * pFactor * 100 * 10) / 10);
}

/**
 * @param {number} risk
 * @returns {{ label: string, cls: string, color: string }}
 */
function riskLevel(risk) {
  if (risk >= 75) return { label: "Kritikus", cls: "critical", color: "#e05252" };
  if (risk >= 50) return { label: "Magas",    cls: "high",     color: "#dc5a1e" };
  if (risk >= 20) return { label: "Közepes",  cls: "medium",   color: "#d4a017" };
  return               { label: "Alacsony",   cls: "low",      color: "#4caf7d" };
}

/**
 * Idősor-szimuláció.
 * @param {Array} weatherSeries — [{date, tmean, rh_mean, precip}, ...]
 * @returns {{ daily: Array, summary: Object }}
 */
function simulateFusarium(weatherSeries) {
  const daily = weatherSeries.map(d => {
    const risk = fusariumRisk(d.tmean, d.rh_mean, d.precip);
    const level = riskLevel(risk);
    return { date: d.date, risk, ...level, is_forecast: d.is_forecast };
  });

  const risks = daily.map(d => d.risk);
  const maxRisk = risks.length ? Math.max(...risks, 0) : 0;
  const avgRisk = risks.length ? risks.reduce((a, b) => a + b, 0) / risks.length : 0;
  const criticalDays = daily.filter(d => d.cls === "critical").length;
  const highRiskDays = daily.filter(d => d.cls === "high" || d.cls === "critical").length;
  const peakDay = daily.find(d => d.risk === maxRisk);

  return {
    daily,
    summary: {
      maxRisk: Math.round(maxRisk * 10) / 10,
      avgRisk: Math.round(avgRisk * 10) / 10,
      criticalDays,
      highRiskDays,
      peakDay: peakDay?.date ?? null,
      level: riskLevel(maxRisk),
    },
  };
}
