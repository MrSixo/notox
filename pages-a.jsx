// Pages part A: Login, Dashboard, Meteo, Diseases.
const { useState: useStateA, useEffect: useEffectA, useMemo: useMemoA, useRef: useRefA } = React;

/* ============================================================
   LOGIN
   ============================================================ */
const LoginPage = ({ onLogin }) => {
  const [loading, setLoading] = useStateA(false);
  const handle = () => {
    setLoading(true);
    setTimeout(() => onLogin({ name: "Kovács Réka", email: "r.kovacs@agri.hu", role: "admin" }), 700);
  };
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="brand">
          <div className="brand-mark">N</div>
          <div style={{fontWeight: 600, color: "var(--text-br)", fontSize: 16}}>No-tox</div>
        </div>
        <h2>Belépés a rendszerbe</h2>
        <p>Növényvédelmi előrejelző platform agrárkutatók és szaktanácsadók számára.</p>
        <button className="btn-microsoft" onClick={handle} disabled={loading}>
          <Icon name="microsoft" size={16}/>
          {loading ? "Belépés…" : "Microsoft fiókkal belépés"}
        </button>
        <div style={{marginTop: 14, display: "flex", gap: 8, alignItems: "center", justifyContent: "center"}}>
          <a href="#" onClick={(e) => { e.preventDefault(); handle(); }} style={{fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)"}}>
            ↪ dev belépés (localhost)
          </a>
        </div>
        <div className="login-foot">
          BETA · Csak meghívott felhasználók<br/>
          v0.4.2 · GDPR-megfelelő
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   DASHBOARD
   ============================================================ */
const riskClass = r => r >= 75 ? "risk-crit" : r >= 50 ? "risk-high" : r >= 30 ? "risk-med" : "risk-low";
const riskLabel = r => r >= 75 ? "KRITIKUS" : r >= 50 ? "MAGAS" : r >= 30 ? "KÖZEPES" : "ALACSONY";
const riskColor = r => r >= 75 ? "#e05252" : r >= 50 ? "#dc5a1e" : r >= 30 ? "#d4a017" : "#4caf7d";

const LocationCard = ({ loc, onOpen }) => {
  const fc = window.FORECAST_BY_LOC[loc.id];
  const future = fc.filter(d => d.is_forecast || d.date === window.isoOf(window.today));
  const todayRisk = future[0]?.risk ?? loc.risk;
  return (
    <div className="card" onClick={onOpen} style={{cursor: "pointer", transition: "border-color .15s"}}
         onMouseEnter={e => e.currentTarget.style.borderColor = "var(--border-strong)"}
         onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
      <div className="card-head">
        <div>
          <div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 2}}>
            <span className="s-dot" style={{ background: loc.color }}/>
            <span className="card-title">{loc.name}</span>
          </div>
          <div className="mono dim" style={{fontSize: 10}}>{loc.lat.toFixed(3)}°N · {loc.lon.toFixed(3)}°E</div>
        </div>
        <span className={"risk-pill " + riskClass(todayRisk)}>{riskLabel(todayRisk)}</span>
      </div>
      <div className="card-body">
        <div style={{display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10}}>
          <span className="mono" style={{fontSize: 32, fontWeight: 600, color: "var(--text-br)", lineHeight: 1, letterSpacing: -1}}>
            {todayRisk.toFixed(0)}
          </span>
          <span className="mono dim" style={{fontSize: 11}}>/ 100 kockázat</span>
        </div>
        <div className="risk-bar" style={{marginBottom: 12}}>
          <span style={{width: `${todayRisk}%`, background: riskColor(todayRisk)}}/>
        </div>
        <div style={{display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12}}>
          <div>
            <div className="mono dim" style={{fontSize: 10}}>HŐM</div>
            <div className="mono br">{loc.t.toFixed(1)}°C</div>
          </div>
          <div>
            <div className="mono dim" style={{fontSize: 10}}>RH</div>
            <div className="mono br">{loc.rh}%</div>
          </div>
          <div>
            <div className="mono dim" style={{fontSize: 10}}>CSAP</div>
            <div className="mono br">{loc.p.toFixed(1)} mm</div>
          </div>
        </div>
        <div className="section-lbl">7 nap előrejelzés</div>
        <Sparkline data={future.map(d => d.risk)} stroke={riskColor(todayRisk)} fill={`${riskColor(todayRisk)}26`}/>
        <div className="row-between mono dim" style={{fontSize: 10, marginTop: 4}}>
          <span>{future[0].date.slice(5)}</span>
          <span>{future[future.length-1].date.slice(5)}</span>
        </div>
      </div>
    </div>
  );
};

const DashboardPage = ({ setPage, setForecastLoc, layout = "cards", density = "regular", accent = "#4caf7d", theme = "dark" }) => {
  const locs = window.LOCATIONS;
  const avgRisk = Math.round(locs.reduce((s, l) => s + l.risk, 0) / locs.length);
  const crit = locs.filter(l => l.risk >= 75).length;

  const renderCards = () => (
    <div className={density === "compact" ? "grid-4" : "grid-3"} style={{marginBottom: 20}}>
      {locs.map(loc => (
        <LocationCard key={loc.id} loc={loc} onOpen={() => { setForecastLoc(loc.id); setPage("forecast"); }}/>
      ))}
    </div>
  );

  const renderList = () => (
    <div className="card" style={{marginBottom: 20}}>
      <div className="card-head">
        <h3 className="card-title">Helyszínek — kompakt nézet</h3>
        <span className="tag">{locs.length}</span>
      </div>
      <table className="tbl">
        <thead><tr>
          <th></th><th>Helyszín</th><th className="num">Kockázat</th><th>Szint</th>
          <th className="num">T (°C)</th><th className="num">RH (%)</th><th className="num">Csap.</th>
          <th>7 nap</th><th></th>
        </tr></thead>
        <tbody>
          {locs.map(loc => {
            const fc = window.FORECAST_BY_LOC[loc.id].filter(d => d.is_forecast || d.date === window.isoOf(window.today));
            return (
              <tr key={loc.id} style={{cursor: "pointer"}} onClick={() => { setForecastLoc(loc.id); setPage("forecast"); }}>
                <td><span className="s-dot" style={{background: loc.color}}/></td>
                <td>{loc.name}</td>
                <td className="num" style={{color: riskColor(loc.risk), fontWeight: 600}}>{loc.risk}</td>
                <td><span className={"risk-pill " + riskClass(loc.risk)}>{riskLabel(loc.risk)}</span></td>
                <td className="num">{loc.t.toFixed(1)}</td>
                <td className="num">{loc.rh}</td>
                <td className="num">{loc.p.toFixed(1)} mm</td>
                <td style={{width: 140, padding: "4px 10px"}}>
                  <Sparkline data={fc.map(d => d.risk)} stroke={riskColor(loc.risk)} fill={`${riskColor(loc.risk)}26`} height={24}/>
                </td>
                <td><Icon name="arrow-right" size={12}/></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderMap = () => (
    <div style={{display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, marginBottom: 20}}>
      <div className="map-frame" style={{minHeight: 460}}>
        <MeteoMap stations={locs} selected={locs[0].id} onSelect={(id) => { setForecastLoc(id); setPage("forecast"); }} theme={theme}/>
      </div>
      <div className="card" style={{display: "flex", flexDirection: "column"}}>
        <div className="card-head">
          <h3 className="card-title">Rangsor</h3>
          <span className="tag">{locs.length}</span>
        </div>
        <div className="list" style={{overflowY: "auto"}}>
          {[...locs].sort((a, b) => b.risk - a.risk).map(loc => (
            <div key={loc.id} className="list-row" onClick={() => { setForecastLoc(loc.id); setPage("forecast"); }}>
              <span className="s-dot" style={{background: riskColor(loc.risk)}}/>
              <div style={{flex: 1, minWidth: 0}}>
                <div style={{whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{loc.name}</div>
                <div className="mono" style={{fontSize: 10, color: "var(--text-mute)"}}>
                  {loc.t.toFixed(1)}°C · {loc.rh}% RH · {loc.p.toFixed(1)} mm
                </div>
              </div>
              <div style={{textAlign: "right"}}>
                <div className="mono" style={{color: riskColor(loc.risk), fontSize: 16, fontWeight: 600}}>{loc.risk}</div>
                <div className={"risk-pill " + riskClass(loc.risk)} style={{fontSize: 9}}>{riskLabel(loc.risk)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <div className="page-sub">Mentett helyszínek napi kockázati áttekintése · Ma: {window.isoOf(window.today)}</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="download" size={12}/>Export</button>
          <button className="btn btn-primary" style={{background: accent, borderColor: accent}}><Icon name="plus" size={12}/>Helyszín</button>
        </div>
      </div>

      <div className="grid-4" style={{marginBottom: 18}}>
        <div className="stat">
          <div className="lbl">Helyszínek</div>
          <div className="val">{locs.length}</div>
          <div className="delta">2 saját · {locs.length - 2} OMSZ</div>
        </div>
        <div className="stat">
          <div className="lbl">Átlag kockázat</div>
          <div className="val" style={{color: riskColor(avgRisk)}}>{avgRisk}</div>
          <div className="delta">+7 az előző héthez képest</div>
        </div>
        <div className="stat">
          <div className="lbl">Kritikus helyszín</div>
          <div className="val" style={{color: crit > 0 ? "var(--risk-crit)" : "var(--text-br)"}}>{crit}</div>
          <div className="delta">küszöb ≥ 75</div>
        </div>
        <div className="stat">
          <div className="lbl">Aktív modell</div>
          <div className="val" style={{fontSize: 16, lineHeight: 1.3, marginTop: 4}}>De Wolf 2003</div>
          <div className="delta">FHB · logisztikus</div>
        </div>
      </div>

      {layout === "cards" && renderCards()}
      {layout === "list" && renderList()}
      {layout === "map" && renderMap()}

      <div className="card">
        <div className="card-head">
          <div>
            <h3 className="card-title">7 napos kockázati görbe · összes helyszín</h3>
            <div className="page-sub" style={{marginTop: 2}}>De Wolf 2003 modell · napi kalkulus</div>
          </div>
          <div className="toggle-group">
            <button className="active">7 nap</button>
            <button>14 nap</button>
            <button>30 nap</button>
          </div>
        </div>
        <div className="card-body">
          <MultiLine
            series={locs.map(l => ({
              color: l.color,
              data: window.FORECAST_BY_LOC[l.id].slice(7).map(d => d.risk)
            }))}
            height={180}
            yLabel="kockázat 0–100"
          />
          <div style={{display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12}}>
            {locs.map(l => (
              <div key={l.id} className="row gap-sm" style={{fontSize: 11}}>
                <span className="s-dot" style={{ background: l.color }}/>
                <span>{l.name.split(" — ")[0]}</span>
                <span className="mono dim">{l.risk}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

/* ============================================================
   METEO
   ============================================================ */
const TILE_DARK  = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_GREY  = "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png";
const TILE_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_ATTR  = '© <a href="https://carto.com/attributions">CARTO</a> · © <a href="https://openstreetmap.org/copyright">OSM</a>';

const MeteoMap = ({ stations, selected, onSelect, theme = "dark" }) => {
  const containerRef = useRefA(null);
  const mapRef       = useRefA(null);
  const tileRef      = useRefA(null);
  const markersRef   = useRefA({});

  // Térkép inicializálás (egyszer)
  useEffectA(() => {
    if (!containerRef.current || !window.L || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [47.16, 19.50],
      zoom: 7,
      zoomControl: true,
      attributionControl: true,
    });
    const tileUrl = theme === "light" ? TILE_LIGHT : theme === "grey" ? TILE_GREY : TILE_DARK;
    tileRef.current = L.tileLayer(tileUrl, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; tileRef.current = null; };
  }, []);

  // Tile csere témavátláskor
  useEffectA(() => {
    if (!mapRef.current || !tileRef.current) return;
    const tileUrl = theme === "light" ? TILE_LIGHT : theme === "grey" ? TILE_GREY : TILE_DARK;
    mapRef.current.removeLayer(tileRef.current);
    tileRef.current = L.tileLayer(tileUrl, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(mapRef.current);
  }, [theme]);

  // Markerek frissítése állomásváltozáskor
  useEffectA(() => {
    const map = mapRef.current;
    if (!map) return;
    Object.values(markersRef.current).forEach(m => map.removeLayer(m));
    markersRef.current = {};

    stations.forEach(s => {
      const color = riskColor(s.risk);
      const isSel = s.id === selected;
      const size  = isSel ? 38 : 28;
      const icon  = L.divIcon({
        className: "",
        html: `<div style="
          width:${size}px;height:${size}px;border-radius:50%;
          background:${color};
          border:${isSel ? "3px solid rgba(255,255,255,0.9)" : "2px solid rgba(0,0,0,0.3)"};
          box-shadow:0 2px 10px rgba(0,0,0,0.45);
          display:flex;align-items:center;justify-content:center;
          font-family:'IBM Plex Mono',monospace;
          font-size:${isSel ? 12 : 9}px;font-weight:700;color:#fff;
          cursor:pointer;
        ">${s.risk}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2],
      });

      const marker = L.marker([s.lat, s.lon], { icon })
        .addTo(map)
        .on("click", () => onSelect(s.id));

      marker.bindTooltip(`
        <div style="font-family:'IBM Plex Sans',sans-serif;font-size:12px;line-height:1.6;min-width:160px">
          <strong>${s.name}</strong><br>
          Kockázat: <strong style="color:${color}">${s.risk}</strong><br>
          🌡 ${s.t?.toFixed(1)}°C &nbsp; 💧 ${s.rh}% RH &nbsp; ☔ ${s.p?.toFixed(1)} mm
        </div>
      `, { direction: "top", offset: [0, -size / 2], opacity: 0.97 });

      markersRef.current[s.id] = marker;
    });
  }, [stations, selected]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: 440, borderRadius: "var(--r-md)", overflow: "hidden" }}
    />
  );
};

const MeteoPage = ({ theme = "dark" }) => {
  const [view, setView] = useStateA("map");
  const [sel, setSel] = useStateA("deb");
  const stations = window.STATIONS;
  const station = stations.find(s => s.id === sel);
  const fc = window.FORECAST_BY_LOC[sel] || window.FORECAST_BY_LOC["deb"];
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Meteorológia</h1>
          <div className="page-sub">Állomások · interaktív térkép · hőtérkép · idősorok</div>
        </div>
        <div className="page-actions">
          <div className="toggle-group">
            <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>
              <Icon name="list" size={11} style={{verticalAlign:"-1px", marginRight:4}}/>Lista
            </button>
            <button className={view === "map" ? "active" : ""} onClick={() => setView("map")}>
              <Icon name="map" size={11} style={{verticalAlign:"-1px", marginRight:4}}/>Térkép
            </button>
          </div>
          <button className="btn"><Icon name="plus" size={12}/>Saját állomás</button>
        </div>
      </div>

      <div style={{display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, marginBottom: 16}}>
        {/* Station list */}
        <div className="card" style={{display: "flex", flexDirection: "column"}}>
          <div className="card-head">
            <h3 className="card-title">Állomások</h3>
            <span className="tag">{stations.length}</span>
          </div>
          <div style={{padding: "8px 12px"}}>
            <input className="form-input" placeholder="Keresés…" style={{fontSize: 11}}/>
          </div>
          <div className="list" style={{flex: 1, overflowY: "auto", maxHeight: 480}}>
            {stations.map(s => (
              <div key={s.id} className={"list-row" + (sel === s.id ? " active" : "")}
                   onClick={() => setSel(s.id)}>
                <span className="s-dot" style={{background: riskColor(s.risk)}}/>
                <div style={{flex: 1, minWidth: 0}}>
                  <div style={{whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{s.name}</div>
                  <div className="mono" style={{fontSize: 10, color: "var(--text-mute)"}}>{s.kind} · {s.lat.toFixed(2)}, {s.lon.toFixed(2)}</div>
                </div>
                <div className="mono" style={{color: riskColor(s.risk), fontSize: 12, fontWeight: 600}}>{s.risk}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Map / map-frame */}
        <div className="map-frame">
          <MeteoMap stations={stations} selected={sel} onSelect={setSel} theme={theme}/>
        </div>
      </div>

      {/* Selected station detail */}
      <div className="card">
        <div className="card-head">
          <div>
            <h3 className="card-title">{station.name}</h3>
            <div className="mono dim" style={{fontSize: 11, marginTop: 2}}>{station.kind} · {station.lat.toFixed(3)}°N {station.lon.toFixed(3)}°E · 14 napos idősor</div>
          </div>
          <div className="row gap-sm">
            <button className="btn btn-sm"><Icon name="external" size={11}/>Open-Meteo</button>
            <button className="btn btn-sm btn-primary" onClick={() => {/* TODO route to forecast */}}>
              <Icon name="chart" size={11}/>Előrejelzés indítása
            </button>
          </div>
        </div>
        <div className="card-body">
          <div className="grid-4" style={{marginBottom: 14}}>
            <div>
              <div className="section-lbl"><Icon name="thermometer" size={10} style={{verticalAlign:"-1px", marginRight:4}}/>Hőmérséklet (°C)</div>
              <MultiLine series={[{color: "#dc5a1e", data: fc.map(d => d.tmean)}]} height={120}/>
            </div>
            <div>
              <div className="section-lbl"><Icon name="drop" size={10} style={{verticalAlign:"-1px", marginRight:4}}/>Relatív páratart. (%)</div>
              <MultiLine series={[{color: "#5b9cf6", data: fc.map(d => d.rh_mean)}]} height={120}/>
            </div>
            <div>
              <div className="section-lbl"><Icon name="cloud" size={10} style={{verticalAlign:"-1px", marginRight:4}}/>Csapadék (mm)</div>
              <MultiLine series={[{color: "#9b5de5", data: fc.map(d => d.precip)}]} height={120}/>
            </div>
            <div>
              <div className="section-lbl"><Icon name="warning" size={10} style={{verticalAlign:"-1px", marginRight:4}}/>FHB kockázati index</div>
              <MultiLine series={[{color: "#4caf7d", data: fc.map(d => d.risk)}]} height={120}/>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

/* ============================================================
   DISEASES
   ============================================================ */
const DiseasesPage = () => {
  const [sel, setSel] = useStateA("fhb");
  const [tab, setTab] = useStateA("tunetek");
  const d = window.DISEASES.find(x => x.slug === sel);
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Betegségek</h1>
          <div className="page-sub">Gabonabetegségek enciklopédiája · azonosítási segédlet</div>
        </div>
      </div>

      <div style={{display: "grid", gridTemplateColumns: "240px 1fr", gap: 16}}>
        <div className="card" style={{height: "fit-content"}}>
          <div className="card-head"><h3 className="card-title">Lista</h3><span className="tag">{window.DISEASES.length}</span></div>
          <div className="list">
            {window.DISEASES.map(x => (
              <div key={x.slug} className={"list-row" + (sel === x.slug ? " active" : "")} onClick={() => setSel(x.slug)}>
                <span className="s-dot" style={{background: x.severity === "kritikus" ? "var(--risk-crit)" : x.severity === "magas" ? "var(--risk-high)" : "var(--risk-med)"}}/>
                <div style={{flex: 1, minWidth: 0}}>
                  <div>{x.name}</div>
                  <div className="mono" style={{fontSize: 10, color: "var(--text-mute)", fontStyle: "italic"}}>{x.latin}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">{d.name}</h3>
              <div className="mono dim" style={{fontSize: 11, marginTop: 2, fontStyle: "italic"}}>{d.latin}</div>
            </div>
            <div className="row gap-sm">
              <span className={"risk-pill " + (d.severity === "kritikus" ? "risk-crit" : d.severity === "magas" ? "risk-high" : "risk-med")}>{d.severity}</span>
              <button className="btn btn-sm"><Icon name="external" size={11}/>Irodalom</button>
            </div>
          </div>
          <div className="card-body">
            <div className="grid-3" style={{marginBottom: 16}}>
              <div className="stat" style={{padding: 12}}>
                <div className="lbl">Gazdanövény</div>
                <div className="br" style={{fontSize: 13, marginTop: 4}}>{d.host}</div>
              </div>
              <div className="stat" style={{padding: 12}}>
                <div className="lbl">Csúcs időszak</div>
                <div className="br" style={{fontSize: 13, marginTop: 4}}>{d.peak}</div>
              </div>
              <div className="stat" style={{padding: 12}}>
                <div className="lbl">Súlyosság</div>
                <div className="br" style={{fontSize: 13, marginTop: 4, textTransform: "capitalize"}}>{d.severity}</div>
              </div>
            </div>

            <div className="tabs">
              {[
                ["tunetek", "Tünetek"],
                ["foto", "Fotók"],
                ["kockazat", "Kockázati tényezők"],
                ["vedekezes", "Védekezés"],
                ["model", "Kapcsolódó modellek"],
              ].map(([k, l]) => (
                <button key={k} className={"tab" + (tab === k ? " active" : "")} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>

            {tab === "tunetek" && (
              <div style={{lineHeight: 1.6}}>
                <div className="section-lbl">Leírás</div>
                <p style={{margin: "0 0 16px"}}>{d.summary}</p>
                <div className="section-lbl">Diagnosztikai tünetek</div>
                <ul style={{margin: 0, paddingLeft: 20, color: "var(--text)"}}>
                  <li>Kalászkák halvány rózsaszín-narancs elszíneződése a virágzás után 2–4 héttel</li>
                  <li>Kalászka pelyvalevelek korai száradása, „fehér kalász" tünet</li>
                  <li>Magas páratartalmú reggeleken nyálkás konídium-bevonat</li>
                  <li>Szem-zsugorodás, vörös pigmentáció, alacsony ezerszemtömeg</li>
                </ul>
              </div>
            )}
            {tab === "foto" && (
              <div className="grid-3">
                {[1,2,3,4,5,6].map(i => (
                  <div key={i} className="placeholder" style={{aspectRatio: "4/3", padding: 0, display: "grid", placeItems: "center"}}>
                    <div style={{display: "flex", flexDirection: "column", alignItems: "center", gap: 6}}>
                      <Icon name="file" size={22}/>
                      <div className="mono" style={{fontSize: 10}}>fotó_{i.toString().padStart(2,"0")}.jpg</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === "kockazat" && (
              <div>
                <div className="section-lbl">Időjárási kockázati ablakok</div>
                <table className="tbl">
                  <thead><tr><th>Tényező</th><th>Kedvező tartomány</th><th>Súly</th></tr></thead>
                  <tbody>
                    <tr><td>Napi átl. hőmérséklet</td><td className="mono">20–26 °C</td><td className="mono">★★★★</td></tr>
                    <tr><td>Relatív páratart. (kalászolás)</td><td className="mono">&gt; 70 %, 48 órán át</td><td className="mono">★★★★★</td></tr>
                    <tr><td>Csapadékos napok / hét</td><td className="mono">≥ 3 nap</td><td className="mono">★★★</td></tr>
                    <tr><td>Levélnedvesség (óra)</td><td className="mono">&gt; 20 óra</td><td className="mono">★★★</td></tr>
                    <tr><td>Elővetemény = kukorica</td><td className="mono">igen</td><td className="mono">★★★★</td></tr>
                  </tbody>
                </table>
              </div>
            )}
            {tab === "vedekezes" && (
              <div style={{lineHeight: 1.6}}>
                <div className="section-lbl">Agrotechnikai</div>
                <ul style={{margin: "0 0 14px", paddingLeft: 20}}>
                  <li>Vetésforgó: ne kövessen kukorica után közvetlenül</li>
                  <li>Szárzúzás, mély szántás a tarlómaradványok bedolgozására</li>
                  <li>Rezisztens / mérsékelten rezisztens fajtaválasztás</li>
                </ul>
                <div className="section-lbl">Kémiai</div>
                <ul style={{margin: 0, paddingLeft: 20}}>
                  <li>Triazol-alapú fungicid (protiokonazol + tebukonazol) kalászoláskor</li>
                  <li>Permetezési ablak: BBCH 61–69, 60–90% kockázati index esetén</li>
                </ul>
              </div>
            )}
            {tab === "model" && (
              <div className="col">
                {window.MODELS.filter(m => m.disease.includes("Fusarium") || sel !== "fhb").slice(0, 3).map(m => (
                  <div key={m.id} className="row" style={{padding: 12, border: "1px solid var(--border)", borderRadius: "var(--r-md)", justifyContent: "space-between"}}>
                    <div>
                      <div className="br" style={{fontWeight: 500}}>{m.name}</div>
                      <div className="mono dim" style={{fontSize: 11}}>{m.authors} · {m.year}</div>
                    </div>
                    <button className="btn btn-sm">Megnyitás <Icon name="arrow-right" size={11}/></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { LoginPage, DashboardPage, MeteoPage, DiseasesPage, riskClass, riskLabel, riskColor });
