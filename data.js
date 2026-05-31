// Mock data for the No-tox prototype.

const LOCATIONS = [
  { id: "deb", name: "Debrecen — Pallag", lat: 47.53, lon: 21.63, color: "#4caf7d", risk: 68, t: 22.1, rh: 85, p: 5.2 },
  { id: "bud", name: "Budapest — Soroksár", lat: 47.40, lon: 19.16, color: "#5b9cf6", risk: 34, t: 18.4, rh: 70, p: 1.1 },
  { id: "pec", name: "Pécs — Kertváros",   lat: 46.07, lon: 18.23, color: "#d4a017", risk: 21, t: 19.8, rh: 62, p: 0.0 },
  { id: "szg", name: "Szeged — Tápé",       lat: 46.27, lon: 20.15, color: "#dc5a1e", risk: 78, t: 23.6, rh: 88, p: 8.4 },
  { id: "gyr", name: "Győr — Pér",          lat: 47.62, lon: 17.81, color: "#9b5de5", risk: 42, t: 20.1, rh: 74, p: 2.6 },
  { id: "miS", name: "Miskolc — Mezőkövesd",lat: 47.82, lon: 20.58, color: "#f15bb5", risk: 55, t: 21.3, rh: 79, p: 3.8 },
];

const MODELS = [
  { id: "dewolf2003", name: "Fuzárium kalász-rothadás (FHB)", authors: "De Wolf, Madden & Lipps", year: 2003,
    doi: "10.1094/PHYTO.2003.93.4.428", disease: "Fusarium graminearum", type: "logistic", builtin: true,
    params: { topt: 22.5, sigma: 6, rh_thr: 60, precip_min: 1, risk_thr: 50 },
    formula: "R = logit⁻¹(β₀ + β₁·T·RH + β₂·precip_days) × 100",
    desc: "Hőmérséklet és relatív páratartalom napi szorzatára épülő logisztikus regresszió, amelyet kalászolás körüli ±7 napos ablakra alkalmazunk. Empirikusan illesztett az USA középnyugati gabonatáblákra; magyar adaptáció a relatív páratartalom-küszöb csökkentésével." },
  { id: "dewolf2003-v2", name: "Fuzárium FHB — 2. variáns", authors: "De Wolf et al. (Pallag adaptáció)", year: 2024,
    doi: "—", disease: "Fusarium graminearum", type: "logistic", builtin: false,
    params: { topt: 21.8, sigma: 5.5, rh_thr: 65, precip_min: 0.5, risk_thr: 45 },
    formula: "R = logit⁻¹(β₀ + β₁·T·RH + β₂·precip_days) × 100",
    desc: "Magyar agroökológiai zónára finomhangolt változat; a Debrecen-Pallag 2018-2023 közötti validációs adatkészleten illesztve." },
  { id: "wolf1999", name: "Wolf — kalászfertőződés gauss", authors: "Wolf", year: 1999,
    doi: "10.1007/wolf-1999", disease: "Fusarium graminearum", type: "gaussian", builtin: true,
    params: { topt: 24.0, sigma: 7, rh_thr: 70, precip_min: 2, risk_thr: 55 },
    formula: "R = gauss(T, μ=24, σ=7) × RH_factor × precip_factor × 100",
    desc: "Gauss-alapú hőmérséklet-válaszgörbe; egyszerű, gyors, de szárazabb években hajlamos alulbecsülni." },
  { id: "coakley1988", name: "Coakley — sárga rozsda", authors: "Coakley, Line & McDaniel", year: 1988,
    doi: "10.1094/PHYTO-78-543", disease: "Puccinia striiformis", type: "linear", builtin: true,
    params: { topt: 12.0, sigma: 4, rh_thr: 90, precip_min: 0, risk_thr: 40 },
    formula: "R = a·hours(T∈[5,15]) + b·hours(RH>90) + c",
    desc: "Lineáris óraszám-akkumuláció; 5–15 °C tartomány és magas páratartalmú órák száma a fő prediktor." },
  { id: "madden1978", name: "Madden — lisztharmat órabázis", authors: "Madden", year: 1978,
    doi: "—", disease: "Blumeria graminis", type: "logistic", builtin: true,
    params: { topt: 18.0, sigma: 5, rh_thr: 80, precip_min: 0, risk_thr: 50 },
    formula: "R = logit⁻¹(β₀ + β₁·leaf_wetness_hours) × 100",
    desc: "Levélnedvesség-órákra alapozott logisztikus modell; a permetezési idő-ablak becslésére használjuk." },
];

const DISEASES = [
  { slug: "fhb", name: "Fuzárium kalász-rothadás", latin: "Fusarium graminearum",
    severity: "kritikus", host: "búza, árpa, kukorica", peak: "Április – Június",
    summary: "A legfontosabb gabonabetegség Magyarországon. DON-toxin képződés miatt élelmiszerbiztonsági kockázat. Kalászolás körüli meleg-nedves időszak kritikus." },
  { slug: "rust-yellow", name: "Sárga rozsda", latin: "Puccinia striiformis", severity: "magas", host: "búza, árpa", peak: "Március – Május", summary: "Hideg, párás tavaszi időjárás kedvez. Levél-csíkos sárga uredospórák. Fajtaválasztás és korai jelzőrendszer kulcs." },
  { slug: "powdery", name: "Lisztharmat", latin: "Blumeria graminis", severity: "közepes", host: "kalászosok", peak: "Április – Július", summary: "Fehér, lisztes bevonat; magas RH, mérsékelt hő. Sűrű állomány és nitrogéntúladagolás súlyosbítja." },
  { slug: "septoria", name: "Levélfoltosság", latin: "Zymoseptoria tritici", severity: "magas", host: "búza", peak: "Március – Június", summary: "Hosszabb levélnedvesség (>20 óra) szükséges. Spóra-szóródás csapadékkal. Korai detektálás permetezési ablakot ad." },
  { slug: "fusarium-stem", name: "Fuzárium szártőrothadás", latin: "Fusarium spp.", severity: "közepes", host: "kukorica", peak: "Augusztus – Szeptember", summary: "Vetésforgó és bakhátas talajművelés csökkenti. DON és ZEA mikotoxinokkal jár együtt." },
];

const today = new Date(2026, 4, 24); // 2026-05-24
const isoOf = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; };

// Generate forecast: -7 past + today + 7 future
const FORECAST_BY_LOC = {};
LOCATIONS.forEach(loc => {
  const arr = [];
  for (let i = -7; i <= 7; i++) {
    const d = addDays(today, i);
    // Simulated risk profile centred near the location's "risk" number with noise
    const base = loc.risk;
    const noise = (Math.sin(i * 0.9 + loc.lat) + Math.cos(i * 1.3 + loc.lon)) * 12;
    const risk = Math.max(0, Math.min(100, base + noise - (i === 0 ? 0 : i * 1.2)));
    arr.push({
      date: isoOf(d),
      risk: +risk.toFixed(1),
      tmean: +(loc.t + Math.sin(i * 0.6) * 3 + (i / 14) * 2).toFixed(1),
      rh_mean: Math.round(loc.rh + Math.cos(i * 0.7) * 6),
      precip: Math.max(0, +(Math.max(0, Math.sin(i * 0.9 + 1.5)) * 8 - (loc.id === "pec" ? 4 : 0)).toFixed(1)),
      is_forecast: i > 0,
    });
  }
  FORECAST_BY_LOC[loc.id] = arr;
});

// Stations for /meteo
const STATIONS = [
  ...LOCATIONS.map(l => ({ ...l, kind: "OMSZ" })),
  { id: "own1", name: "Saját — Hortobágy 1", lat: 47.59, lon: 21.16, color: "#7a8c7b", risk: 51, t: 20.4, rh: 76, p: 2.1, kind: "Saját" },
  { id: "own2", name: "Saját — Mórahalom",   lat: 46.22, lon: 19.88, color: "#7a8c7b", risk: 39, t: 21.0, rh: 68, p: 0.8, kind: "Saját" },
];

const VALIDATION_OBS = [
  { id: "v1", date: "2024-06-12", location_name: "Debrecen — Pallag", crop: "búza",
    fhb_severity_pct: 18.5, don_ppb: 1250, predicted_risk: 72.4, model: "dewolf2003", prev_crop: "kukorica" },
  { id: "v2", date: "2024-06-15", location_name: "Szeged — Tápé", crop: "búza",
    fhb_severity_pct: 24.1, don_ppb: 1820, predicted_risk: 81.3, model: "dewolf2003", prev_crop: "kukorica" },
  { id: "v3", date: "2024-06-10", location_name: "Győr — Pér", crop: "árpa",
    fhb_severity_pct: 4.2, don_ppb: 280, predicted_risk: 38.0, model: "dewolf2003", prev_crop: "napraforgó" },
  { id: "v4", date: "2024-06-18", location_name: "Pécs — Kertváros", crop: "búza",
    fhb_severity_pct: 1.8, don_ppb: 90, predicted_risk: 22.5, model: "dewolf2003", prev_crop: "lucerna" },
  { id: "v5", date: "2024-06-13", location_name: "Miskolc — Mezőkövesd", crop: "búza",
    fhb_severity_pct: 12.3, don_ppb: 950, predicted_risk: 58.1, model: "dewolf2003", prev_crop: "kukorica" },
  { id: "v6", date: "2024-06-09", location_name: "Budapest — Soroksár", crop: "búza",
    fhb_severity_pct: 6.1, don_ppb: 420, predicted_risk: 41.2, model: "dewolf2003", prev_crop: "repce" },
  { id: "v7", date: "2024-06-20", location_name: "Hortobágy", crop: "búza",
    fhb_severity_pct: 21.5, don_ppb: 1640, predicted_risk: 75.6, model: "dewolf2003", prev_crop: "kukorica" },
  { id: "v8", date: "2024-06-11", location_name: "Mórahalom", crop: "árpa",
    fhb_severity_pct: 3.5, don_ppb: 180, predicted_risk: 33.8, model: "dewolf2003", prev_crop: "lucerna" },
  { id: "v9", date: "2024-06-14", location_name: "Pallag — D2 parcella", crop: "búza",
    fhb_severity_pct: 14.6, don_ppb: 1100, predicted_risk: 64.0, model: "dewolf2003", prev_crop: "kukorica" },
  { id: "v10", date: "2024-06-17", location_name: "Soroksár — kísérleti", crop: "búza",
    fhb_severity_pct: 8.9, don_ppb: 610, predicted_risk: 47.3, model: "dewolf2003", prev_crop: "repce" },
  { id: "v11", date: "2024-06-08", location_name: "Tápé — alsó", crop: "búza",
    fhb_severity_pct: 19.0, don_ppb: 1380, predicted_risk: 68.5, model: "dewolf2003", prev_crop: "kukorica" },
  { id: "v12", date: "2024-06-21", location_name: "Pér — felső", crop: "árpa",
    fhb_severity_pct: 2.1, don_ppb: 110, predicted_risk: 25.2, model: "dewolf2003", prev_crop: "napraforgó" },
];

Object.assign(window, { LOCATIONS, MODELS, DISEASES, FORECAST_BY_LOC, STATIONS, VALIDATION_OBS, today, isoOf, addDays });
