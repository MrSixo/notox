// Lightweight SVG chart primitives — no external deps.

const _scaleLinear = (dom, range) => {
  const [d0, d1] = dom, [r0, r1] = range;
  return v => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
};

// Tiny sparkline
const Sparkline = ({ data, stroke = "var(--green)", fill = "rgba(76,175,125,0.15)", height = 32 }) => {
  if (!data.length) return null;
  const w = 200;
  const min = Math.min(...data), max = Math.max(...data);
  const sx = _scaleLinear([0, data.length - 1], [2, w - 2]);
  const sy = _scaleLinear([min, max], [height - 3, 3]);
  const d = data.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
  const area = d + ` L${(w-2)},${height} L2,${height} Z`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
      <path d={area} fill={fill} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
};

// Line + bar dual-axis chart used by Forecast
const ForecastChart = ({ data, height = 280 }) => {
  // data: [{date, risk, tmean, precip, is_forecast}]
  const W = 900, H = height;
  const P = { l: 40, r: 44, t: 20, b: 38 };
  const n = data.length;
  const x = i => P.l + (i / (n - 1)) * (W - P.l - P.r);
  const xBand = i => P.l + ((i + 0.5) / n) * (W - P.l - P.r);
  const yRisk = _scaleLinear([0, 100], [H - P.b, P.t]);
  const maxP = Math.max(8, ...data.map(d => d.precip));
  const yPrecip = _scaleLinear([0, maxP], [H - P.b, P.t]);
  const maxT = Math.max(...data.map(d => d.tmean)) + 2;
  const minT = Math.min(...data.map(d => d.tmean)) - 2;
  const yT = _scaleLinear([minT, maxT], [H - P.b, P.t]);

  const riskPath = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${yRisk(d.risk)}`).join(" ");
  const tPath = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${yT(d.tmean)}`).join(" ");

  const today = data.findIndex(d => d.is_forecast);
  const todayX = today > 0 ? x(today - 0.5) : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, display: "block" }}>
      {/* Risk band shading */}
      <rect x={P.l} y={yRisk(75)} width={W - P.l - P.r} height={yRisk(0) - yRisk(75)} fill="rgba(76,175,125,0.04)" />
      <rect x={P.l} y={yRisk(100)} width={W - P.l - P.r} height={yRisk(75) - yRisk(100)} fill="rgba(224,82,82,0.05)" />

      {/* gridlines */}
      {[0, 25, 50, 75, 100].map(v => (
        <g key={v}>
          <line className="svg-grid" x1={P.l} x2={W - P.r} y1={yRisk(v)} y2={yRisk(v)} strokeDasharray={v === 50 ? "0" : "2 3"} />
          <text className="svg-axis-text" x={P.l - 8} y={yRisk(v) + 3} textAnchor="end" fontFamily="IBM Plex Mono" fontSize="9">{v}</text>
        </g>
      ))}

      {/* today divider */}
      {todayX && (
        <g>
          <line x1={todayX} x2={todayX} y1={P.t} y2={H - P.b} stroke="#4caf7d" strokeDasharray="4 4" opacity="0.6" />
          <text x={todayX} y={P.t - 6} textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="9" fill="#4caf7d">MA</text>
        </g>
      )}

      {/* precip bars */}
      {data.map((d, i) => {
        const bw = (W - P.l - P.r) / n * 0.55;
        const xb = xBand(i) - bw / 2;
        return d.precip > 0 ? (
          <rect key={i} x={xb} y={yPrecip(d.precip)} width={bw} height={H - P.b - yPrecip(d.precip)}
                fill="rgba(91,156,246,0.35)" stroke="rgba(91,156,246,0.6)" />
        ) : null;
      })}

      {/* temp line */}
      <path d={tPath} fill="none" stroke="#d4a017" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.85" />

      {/* risk line */}
      <path d={riskPath} fill="none" stroke="#4caf7d" strokeWidth="2.2" />
      {data.map((d, i) => {
        const color = d.risk >= 75 ? "#e05252" : d.risk >= 50 ? "#dc5a1e" : d.risk >= 30 ? "#d4a017" : "#4caf7d";
        return <circle key={i} className="svg-stroke-bg" cx={x(i)} cy={yRisk(d.risk)} r="3.4" fill={color} strokeWidth="1.5" />;
      })}

      {/* x labels */}
      {data.map((d, i) => (i % 2 === 0) && (
        <text key={i} className="svg-axis-text" x={x(i)} y={H - P.b + 14} textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="9">
          {d.date.slice(5)}
        </text>
      ))}

      {/* right axis */}
      <text x={W - P.r + 8} y={P.t + 10} fontFamily="IBM Plex Mono" fontSize="9" fill="#d4a017">T °C</text>
      <text x={W - P.r + 8} y={P.t + 22} fontFamily="IBM Plex Mono" fontSize="9" fill="#5b9cf6">mm</text>
    </svg>
  );
};

// Scatter (validation: predicted vs observed)
const Scatter = ({ data, height = 280 }) => {
  const W = 600, H = height;
  const P = { l: 40, r: 16, t: 16, b: 36 };
  const x = _scaleLinear([0, 100], [P.l, W - P.r]);
  const y = _scaleLinear([0, 50], [H - P.b, P.t]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, display: "block" }}>
      {[0, 25, 50, 75, 100].map(v => (
        <g key={v}>
          <line className="svg-grid" x1={x(v)} x2={x(v)} y1={P.t} y2={H - P.b} strokeDasharray="2 3" />
          <text className="svg-axis-text" x={x(v)} y={H - P.b + 14} textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="9">{v}</text>
        </g>
      ))}
      {[0, 10, 20, 30, 40, 50].map(v => (
        <g key={v}>
          <line className="svg-grid" x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} strokeDasharray="2 3" />
          <text className="svg-axis-text" x={P.l - 8} y={y(v) + 3} textAnchor="end" fontFamily="IBM Plex Mono" fontSize="9">{v}</text>
        </g>
      ))}
      {/* threshold line at 50 */}
      <line x1={x(50)} x2={x(50)} y1={P.t} y2={H - P.b} stroke="#4caf7d" strokeDasharray="4 3" opacity="0.6" />
      <text x={x(50) + 4} y={P.t + 10} fontFamily="IBM Plex Mono" fontSize="9" fill="#4caf7d">küszöb</text>

      {data.map((p, i) => {
        const color = p.severity >= 15 ? "#e05252" : p.severity >= 5 ? "#dc5a1e" : "#4caf7d";
        return <circle key={i} cx={x(p.predicted)} cy={y(p.severity)} r="5"
          fill={color} fillOpacity="0.55" stroke={color} strokeWidth="1" />;
      })}
      <text className="svg-axis-text" x={W / 2} y={H - 6} textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="10">Előrejelzett kockázat</text>
      <text className="svg-axis-text" x={12} y={H / 2} textAnchor="middle" transform={`rotate(-90 12 ${H/2})`} fontFamily="IBM Plex Mono" fontSize="10">FHB %</text>
    </svg>
  );
};

// Multi-line for /meteo idősor
const MultiLine = ({ series, height = 160, yLabel = "" }) => {
  const W = 800, H = height;
  const P = { l: 36, r: 12, t: 10, b: 22 };
  const allVals = series.flatMap(s => s.data);
  const min = Math.min(...allVals), max = Math.max(...allVals);
  const n = series[0].data.length;
  const x = i => P.l + (i / (n - 1)) * (W - P.l - P.r);
  const y = _scaleLinear([min, max], [H - P.b, P.t]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height }}>
      {[min, (min+max)/2, max].map(v => (
        <g key={v}>
          <line className="svg-grid" x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} strokeDasharray="2 3" />
          <text className="svg-axis-text" x={P.l - 6} y={y(v) + 3} textAnchor="end" fontFamily="IBM Plex Mono" fontSize="9">{v.toFixed(0)}</text>
        </g>
      ))}
      {series.map((s, si) => {
        const d = s.data.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
        return <path key={si} d={d} fill="none" stroke={s.color} strokeWidth="1.6" />;
      })}
      <text className="svg-axis-text" x={P.l} y={10} fontFamily="IBM Plex Mono" fontSize="9">{yLabel}</text>
    </svg>
  );
};

// Risk heatmap grid (calendar-style 7-col x N-rows for Models page maybe)
const RiskGrid = ({ data, cols = 14 }) => {
  // data: array of risk numbers 0-100
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 3 }}>
      {data.map((v, i) => {
        const c = v >= 75 ? "#e05252" : v >= 50 ? "#dc5a1e" : v >= 30 ? "#d4a017" : v >= 15 ? "#4caf7d" : "#1c211d";
        const op = v >= 15 ? 1 : 0.4 + v / 30;
        return <div key={i} title={`${v.toFixed(0)}`} style={{
          aspectRatio: "1", borderRadius: 3, background: c, opacity: op,
          border: "1px solid rgba(255,255,255,0.04)"
        }}/>;
      })}
    </div>
  );
};

Object.assign(window, { Sparkline, ForecastChart, Scatter, MultiLine, RiskGrid });
