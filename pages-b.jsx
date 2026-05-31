// Pages part B: Models, Forecast, Validation, Sources, Admin.
const { useState: useStateB, useMemo: useMemoB, useEffect: useEffectB } = React;

/* ============================================================
   MODELS
   ============================================================ */
const ModelsPage = ({ setPage, setForecastModel }) => {
  const [sel, setSel] = useStateB("dewolf2003");
  const [params, setParams] = useStateB(() => ({ ...window.MODELS.find(m => m.id === "dewolf2003").params }));
  const m = window.MODELS.find(x => x.id === sel);
  useEffectB(() => { setParams({ ...m.params }); }, [sel]);

  // simulate a temperature response curve for the gaussian/logistic
  const tCurve = [];
  for (let t = 0; t <= 35; t += 0.5) {
    let v;
    if (m.type === "gaussian") {
      v = Math.exp(-Math.pow((t - params.topt) / params.sigma, 2)) * 100;
    } else if (m.type === "linear") {
      v = Math.max(0, Math.min(100, (t - 5) * 8));
    } else {
      // logistic centred on topt
      v = 100 / (1 + Math.exp(-(t - params.topt) / (params.sigma / 3)));
    }
    tCurve.push({ t, v });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Modellek</h1>
          <div className="page-sub">Matematikai előrejelző modellek · irodalmi és egyéni variánsok</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="upload" size={12}/>Forrásból importálás</button>
          <button className="btn btn-primary"><Icon name="plus" size={12}/>Modell hozzáadása</button>
        </div>
      </div>

      <div style={{display: "grid", gridTemplateColumns: "260px 1fr", gap: 16}}>
        <div className="card" style={{height: "fit-content"}}>
          <div className="card-head"><h3 className="card-title">Modellek</h3><span className="tag">{window.MODELS.length}</span></div>
          <div className="list">
            {window.MODELS.map(x => (
              <div key={x.id} className={"list-row" + (sel === x.id ? " active" : "")} onClick={() => setSel(x.id)}>
                <span className="s-dot" style={{background: x.builtin ? "var(--blue)" : "var(--green)"}}/>
                <div style={{flex: 1, minWidth: 0}}>
                  <div style={{whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{x.name}</div>
                  <div className="mono" style={{fontSize: 10, color: "var(--text-mute)"}}>{x.authors} · {x.year}</div>
                </div>
                <span className={"tag " + (x.builtin ? "tag-builtin" : "tag-custom")}>
                  {x.builtin ? "core" : "saját"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">{m.name}</h3>
              <div className="mono dim" style={{fontSize: 11, marginTop: 2}}>
                {m.authors} · {m.year} · DOI <span style={{color: "var(--blue)"}}>{m.doi}</span>
              </div>
            </div>
            <div className="row gap-sm">
              <span className={"tag " + (m.builtin ? "tag-builtin" : "tag-custom")}>{m.builtin ? "beépített" : "saját"}</span>
              <button className="btn btn-sm"><Icon name="copy" size={11}/>Variáns</button>
              <button className="btn btn-sm btn-primary" onClick={() => { setForecastModel(m.id); setPage("forecast"); }}>
                <Icon name="play" size={11}/>Futtatás
              </button>
            </div>
          </div>
          <div className="card-body">
            <div className="section-lbl">Leírás</div>
            <p style={{marginTop: 0, marginBottom: 18, lineHeight: 1.6}}>{m.desc}</p>

            <div className="section-lbl">Képlet</div>
            <div style={{
              background: "var(--bg-1)", border: "1px solid var(--border)",
              borderRadius: "var(--r-md)", padding: "12px 14px",
              fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-br)",
              marginBottom: 18, overflow: "auto"
            }}>{m.formula}</div>

            <div className="grid-2">
              <div>
                <div className="section-lbl">Paraméterek</div>
                <table className="tbl">
                  <tbody>
                    {Object.entries(params).map(([k, v]) => (
                      <tr key={k}>
                        <td className="mono dim">{k}</td>
                        <td>
                          <input className="form-input form-mono" style={{padding: "4px 8px", fontSize: 11}} type="number" value={v} step="0.1"
                            onChange={e => setParams(p => ({ ...p, [k]: parseFloat(e.target.value) }))} />
                        </td>
                        <td className="mono dim" style={{whiteSpace: "nowrap"}}>{k === "topt" ? "°C" : k === "sigma" ? "—" : k === "rh_thr" ? "%" : k === "precip_min" ? "mm" : "küszöb"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="row gap-sm" style={{marginTop: 12}}>
                  <button className="btn btn-sm">Visszaállítás</button>
                  <button className="btn btn-sm btn-primary">Mentés</button>
                </div>
              </div>

              <div>
                <div className="section-lbl">Hőmérséklet-válaszgörbe</div>
                <svg viewBox="0 0 400 200" style={{ width: "100%", height: 200, background: "var(--bg-1)", borderRadius: "var(--r-md)", border: "1px solid var(--border)"}}>
                  {[0,25,50,75,100].map(v => (
                    <g key={v}>
                      <line className="svg-grid" x1="36" x2="396" y1={180 - v*1.6} y2={180 - v*1.6} strokeDasharray="2 3"/>
                      <text className="svg-axis-text" x="32" y={180 - v*1.6 + 3} textAnchor="end" fontFamily="IBM Plex Mono" fontSize="9">{v}</text>
                    </g>
                  ))}
                  {[5,10,15,20,25,30].map(t => (
                    <g key={t}>
                      <text className="svg-axis-text" x={36 + (t/35)*360} y="194" textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="9">{t}</text>
                    </g>
                  ))}
                  <line x1={36 + (params.topt/35)*360} x2={36 + (params.topt/35)*360} y1="20" y2="180" stroke="#4caf7d" strokeDasharray="3 3" opacity="0.5"/>
                  <text x={36 + (params.topt/35)*360 + 4} y="30" fontFamily="IBM Plex Mono" fontSize="9" fill="#4caf7d">T_opt={params.topt}</text>
                  <path d={tCurve.map((p,i) => `${i?"L":"M"}${36 + (p.t/35)*360},${180 - p.v*1.6}`).join(" ")} fill="none" stroke="#4caf7d" strokeWidth="2"/>
                  <path d={tCurve.map((p,i) => `${i?"L":"M"}${36 + (p.t/35)*360},${180 - p.v*1.6}`).join(" ") + ` L396,180 L36,180 Z`} fill="rgba(76,175,125,0.08)"/>
                </svg>
              </div>
            </div>

            <div className="section-lbl" style={{marginTop: 18}}>Validációs teljesítmény (12 megfigyelés)</div>
            <div className="grid-4">
              <div className="stat" style={{padding: 12}}>
                <div className="lbl">AUC</div>
                <div className="val" style={{fontSize: 22}}>0.91</div>
              </div>
              <div className="stat" style={{padding: 12}}>
                <div className="lbl">Pontosság</div>
                <div className="val" style={{fontSize: 22}}>86%</div>
              </div>
              <div className="stat" style={{padding: 12}}>
                <div className="lbl">Szenz.</div>
                <div className="val" style={{fontSize: 22}}>0.86</div>
              </div>
              <div className="stat" style={{padding: 12}}>
                <div className="lbl">Specif.</div>
                <div className="val" style={{fontSize: 22}}>0.86</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

/* ============================================================
   FORECAST
   ============================================================ */
const ForecastPage = ({ locId, setLocId, modelId, setModelId }) => {
  const loc = window.LOCATIONS.find(l => l.id === locId) || window.LOCATIONS[0];
  const model = window.MODELS.find(m => m.id === modelId) || window.MODELS[0];
  const data = window.FORECAST_BY_LOC[loc.id];
  const future = data.filter(d => d.is_forecast);
  const maxRisk = Math.max(...data.map(d => d.risk));
  const avgRisk = Math.round(data.reduce((s, d) => s + d.risk, 0) / data.length);
  const criticalDays = data.filter(d => d.risk >= 75).length;
  const highDays = data.filter(d => d.risk >= 50 && d.risk < 75).length;
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Fuzárium-kockázat előrejelzés</h1>
          <div className="page-sub">{loc.name} · {model.name} · 7+7 napos kalkulus</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="download" size={12}/>CSV</button>
          <button className="btn"><Icon name="download" size={12}/>PDF</button>
        </div>
      </div>

      <div className="card" style={{marginBottom: 16}}>
        <div className="card-body" style={{padding: 14}}>
          <div className="row gap-sm" style={{flexWrap: "wrap"}}>
            <div style={{flex: "1 1 220px"}}>
              <label className="form-label">Helyszín</label>
              <select className="form-select" value={loc.id} onChange={e => setLocId(e.target.value)}>
                {window.LOCATIONS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div style={{flex: "1 1 220px"}}>
              <label className="form-label">Modell</label>
              <select className="form-select" value={model.id} onChange={e => setModelId(e.target.value)}>
                {window.MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div style={{flex: "0 0 140px"}}>
              <label className="form-label">Napok</label>
              <select className="form-select" defaultValue="7+7">
                <option>7+7</option><option>14+14</option><option>30+30</option>
              </select>
            </div>
            <div style={{paddingTop: 18}}>
              <button className="btn btn-primary"><Icon name="play" size={12}/>Előrejelzés indítása</button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-4" style={{marginBottom: 16}}>
        <div className="stat">
          <div className="lbl">Max kockázat</div>
          <div className="val" style={{color: window.riskColor(maxRisk)}}>{maxRisk.toFixed(0)}</div>
          <div className="delta">{data.find(d => d.risk === maxRisk).date}</div>
        </div>
        <div className="stat">
          <div className="lbl">Átlag kockázat</div>
          <div className="val">{avgRisk}</div>
          <div className="delta">14 napos ablak</div>
        </div>
        <div className="stat">
          <div className="lbl">Kritikus napok</div>
          <div className="val" style={{color: criticalDays > 0 ? "var(--risk-crit)" : "var(--text-br)"}}>{criticalDays}</div>
          <div className="delta">≥ 75 küszöb</div>
        </div>
        <div className="stat">
          <div className="lbl">Magas kockázat</div>
          <div className="val" style={{color: "var(--risk-high)"}}>{highDays}</div>
          <div className="delta">50–74 sáv</div>
        </div>
      </div>

      <div className="card" style={{marginBottom: 16}}>
        <div className="card-head">
          <div>
            <h3 className="card-title">Kockázat · hőmérséklet · csapadék</h3>
            <div className="page-sub" style={{marginTop: 2}}>Múlt 7 nap (folytonos) ← MA → Előrejelzés 7 nap</div>
          </div>
          <div className="row gap-sm">
            <div className="row gap-sm" style={{fontSize: 11}}>
              <span style={{width: 10, height: 2, background: "#4caf7d", display: "inline-block"}}/>Kockázat
            </div>
            <div className="row gap-sm" style={{fontSize: 11}}>
              <span style={{width: 10, height: 6, background: "rgba(91,156,246,0.4)", display: "inline-block"}}/>Csap.
            </div>
            <div className="row gap-sm" style={{fontSize: 11}}>
              <span style={{width: 10, height: 2, background: "#d4a017", display: "inline-block"}}/>T (°C)
            </div>
          </div>
        </div>
        <div className="card-body">
          <ForecastChart data={data} height={300}/>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Napi adatok</h3>
          <div className="row gap-sm">
            <span className="tag">{data.length} nap</span>
            <span className="tag tag-builtin">{future.length} előrejelzés</span>
          </div>
        </div>
        <div style={{maxHeight: 360, overflowY: "auto"}}>
          <table className="tbl">
            <thead><tr>
              <th>Dátum</th><th className="num">Kockázat</th><th>Szint</th>
              <th className="num">T (°C)</th><th className="num">RH (%)</th><th className="num">Csap. (mm)</th><th>Forrás</th>
            </tr></thead>
            <tbody>
              {data.map(d => (
                <tr key={d.date}>
                  <td className="mono">{d.date}</td>
                  <td className="num" style={{color: window.riskColor(d.risk), fontWeight: 600}}>{d.risk.toFixed(1)}</td>
                  <td><span className={"risk-pill " + window.riskClass(d.risk)}>{window.riskLabel(d.risk)}</span></td>
                  <td className="num">{d.tmean.toFixed(1)}</td>
                  <td className="num">{d.rh_mean}</td>
                  <td className="num">{d.precip.toFixed(1)}</td>
                  <td><span className="tag" style={{fontSize: 9}}>{d.is_forecast ? "FORECAST" : "MÉRT"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

/* ============================================================
   VALIDATION
   ============================================================ */
const ValidationPage = () => {
  const [threshold, setThreshold] = useStateB(50);
  const [showAdd, setShowAdd] = useStateB(false);
  const obs = window.VALIDATION_OBS;
  // confusion: positive = severity >= 10%; predicted positive = predicted_risk >= threshold
  const tp = obs.filter(o => o.fhb_severity_pct >= 10 && o.predicted_risk >= threshold).length;
  const fp = obs.filter(o => o.fhb_severity_pct < 10 && o.predicted_risk >= threshold).length;
  const fn = obs.filter(o => o.fhb_severity_pct >= 10 && o.predicted_risk < threshold).length;
  const tn = obs.filter(o => o.fhb_severity_pct < 10 && o.predicted_risk < threshold).length;
  const acc = ((tp + tn) / obs.length * 100).toFixed(0);
  const sens = (tp / Math.max(1, tp + fn) * 100).toFixed(0);
  const spec = (tn / Math.max(1, tn + fp) * 100).toFixed(0);
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Validáció</h1>
          <div className="page-sub">Terepi megfigyelések · modell-pontosság (De Wolf 2003 módszertan)</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="download" size={12}/>CSV export</button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Icon name="plus" size={12}/>Új megfigyelés</button>
        </div>
      </div>

      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16}}>
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Konfúziós mátrix</h3>
            <div className="row gap-sm">
              <span className="mono dim" style={{fontSize: 11}}>küszöb</span>
              <div className="toggle-group">
                {[30, 40, 50, 60].map(v => (
                  <button key={v} className={threshold === v ? "active" : ""} onClick={() => setThreshold(v)}>{v}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="card-body">
            <div className="cmatrix">
              <div className="head"></div>
              <div className="head">Valóság +</div>
              <div className="head">Valóság −</div>
              <div className="head">Modell +</div>
              <div className="tp"><div className="val">{tp}<span className="sub">true positive</span></div></div>
              <div className="fp"><div className="val">{fp}<span className="sub">false positive</span></div></div>
              <div className="head">Modell −</div>
              <div className="fn"><div className="val">{fn}<span className="sub">false negative</span></div></div>
              <div className="tn"><div className="val">{tn}<span className="sub">true negative</span></div></div>
            </div>
            <div className="grid-4" style={{marginTop: 16}}>
              <div><div className="section-lbl">Pontosság</div><div className="mono br" style={{fontSize: 22, fontWeight: 600}}>{acc}%</div></div>
              <div><div className="section-lbl">Szenz.</div><div className="mono br" style={{fontSize: 22, fontWeight: 600}}>{sens}%</div></div>
              <div><div className="section-lbl">Specif.</div><div className="mono br" style={{fontSize: 22, fontWeight: 600}}>{spec}%</div></div>
              <div><div className="section-lbl">AUC</div><div className="mono br" style={{fontSize: 22, fontWeight: 600, color: "var(--green)"}}>0.91</div></div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Előrejelzés vs valódi FHB %</h3>
            <span className="tag">{obs.length} megfigyelés</span>
          </div>
          <div className="card-body">
            <Scatter data={obs.map(o => ({predicted: o.predicted_risk, severity: o.fhb_severity_pct}))} height={260}/>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Megfigyelések</h3>
          <div className="row gap-sm">
            <input className="form-input" placeholder="Keresés…" style={{width: 200, fontSize: 11}}/>
            <button className="btn btn-sm"><Icon name="filter" size={11}/>Szűrő</button>
          </div>
        </div>
        <div style={{maxHeight: 360, overflowY: "auto"}}>
          <table className="tbl">
            <thead><tr>
              <th>Dátum</th><th>Helyszín</th><th>Kultúra</th><th>Elővetemény</th>
              <th className="num">FHB %</th><th className="num">DON ppb</th>
              <th className="num">Előrejelzés</th><th>Egyezés</th><th></th>
            </tr></thead>
            <tbody>
              {obs.map(o => {
                const pred = o.predicted_risk >= threshold;
                const obs_p = o.fhb_severity_pct >= 10;
                const match = pred === obs_p;
                return (
                  <tr key={o.id}>
                    <td className="mono">{o.date}</td>
                    <td>{o.location_name}</td>
                    <td>{o.crop}</td>
                    <td className="mono dim">{o.prev_crop}</td>
                    <td className="num" style={{color: o.fhb_severity_pct >= 10 ? "var(--risk-high)" : "var(--text)"}}>{o.fhb_severity_pct.toFixed(1)}</td>
                    <td className="num mono">{o.don_ppb}</td>
                    <td className="num" style={{color: window.riskColor(o.predicted_risk), fontWeight: 600}}>{o.predicted_risk.toFixed(1)}</td>
                    <td>
                      {match
                        ? <span className="risk-pill risk-low"><Icon name="check" size={10}/> egyez</span>
                        : <span className="risk-pill risk-crit"><Icon name="x" size={10}/> eltér</span>}
                    </td>
                    <td>
                      <div className="row gap-sm">
                        <button className="btn btn-sm btn-ghost"><Icon name="edit" size={11}/></button>
                        <button className="btn btn-sm btn-ghost"><Icon name="trash" size={11}/></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Új terepi megfigyelés</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}><Icon name="x" size={12}/></button>
            </div>
            <div className="modal-body">
              <div className="field-group">
                <label className="form-label">Koordináta (Nominatim)</label>
                <input className="form-input" placeholder="pl. Debrecen Pallag" defaultValue="Debrecen — Pallag"/>
              </div>
              <div className="form-row">
                <div className="field-group">
                  <label className="form-label">Dátum</label>
                  <input className="form-input" type="date" defaultValue="2026-05-24"/>
                </div>
                <div className="field-group">
                  <label className="form-label">Modell</label>
                  <select className="form-select" defaultValue="dewolf2003">
                    {window.MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="field-group">
                  <label className="form-label">Kultúra</label>
                  <select className="form-select"><option>búza</option><option>árpa</option><option>kukorica</option></select>
                </div>
                <div className="field-group">
                  <label className="form-label">Elővetemény</label>
                  <select className="form-select"><option>kukorica</option><option>napraforgó</option><option>repce</option><option>lucerna</option></select>
                </div>
              </div>
              <div className="form-row">
                <div className="field-group">
                  <label className="form-label">FHB fertőzöttség (%)</label>
                  <input className="form-input form-mono" type="number" placeholder="0.0" step="0.1"/>
                </div>
                <div className="field-group">
                  <label className="form-label">DON (ppb)</label>
                  <input className="form-input form-mono" type="number" placeholder="0"/>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setShowAdd(false)}>Mégse</button>
              <button className="btn btn-primary" onClick={() => setShowAdd(false)}>
                Mentés → historikus időjárás lekérése
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/* ============================================================
   SOURCES (Claude AI analysis)
   ============================================================ */
const SourcesPage = () => {
  const [phase, setPhase] = useStateB("idle"); // idle | analyzing | done
  const [tab, setTab] = useStateB("model");
  const analyze = () => {
    setPhase("analyzing");
    setTimeout(() => setPhase("done"), 1800);
  };
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Forráselemzés</h1>
          <div className="page-sub">Tudományos cikk → AI elemzés → paraméter-kinyerés → modell importálás</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="key" size={12}/>API kulcs beállítása</button>
        </div>
      </div>

      <div style={{display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 16}}>
        {/* upload column */}
        <div className="col">
          <div className="card">
            <div className="card-head"><h3 className="card-title">Forrás dokumentum</h3></div>
            <div className="card-body">
              <div style={{
                border: "1.5px dashed var(--border-strong)", borderRadius: "var(--r-md)",
                padding: 28, textAlign: "center", background: "var(--bg-1)"
              }}>
                <div style={{display: "grid", placeItems: "center", gap: 8}}>
                  <Icon name="file" size={28}/>
                  <div className="br" style={{fontSize: 13, fontWeight: 500}}>PDF feltöltés vagy szöveg beillesztés</div>
                  <div className="mono dim" style={{fontSize: 11}}>De_Wolf_2003_Phytopathology.pdf · 2.4 MB · 14 oldal</div>
                  <div className="row gap-sm" style={{marginTop: 8}}>
                    <button className="btn btn-sm"><Icon name="upload" size={11}/>Fájl</button>
                    <button className="btn btn-sm">Szöveg beillesztés</button>
                  </div>
                </div>
              </div>
              <div className="field-group" style={{marginTop: 14}}>
                <label className="form-label">Modell · Anthropic</label>
                <select className="form-select" defaultValue="claude-haiku-4-5">
                  <option>claude-haiku-4-5-20251001</option>
                  <option>claude-sonnet-4-5</option>
                </select>
              </div>
              <div className="row gap-sm" style={{marginTop: 12}}>
                <button className="btn btn-primary" style={{flex: 1}} onClick={analyze} disabled={phase === "analyzing"}>
                  <Icon name="sparkle" size={12}/>
                  {phase === "analyzing" ? "Elemzés folyamatban…" : "Elemzés indítása"}
                </button>
              </div>
              {phase === "analyzing" && (
                <div className="placeholder" style={{marginTop: 12, fontSize: 11}}>
                  ▸ Szöveg-extrakció (PDF.js)<br/>
                  ▸ Tokenizálás · 14 312 token<br/>
                  ▸ Claude API hívás folyamatban…
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3 className="card-title">Előzmények</h3><span className="tag">3</span></div>
            <div className="list">
              {[
                ["Wolf 1999 — kalászfertőződés", "2026-05-12", true],
                ["Madden 1978 — lisztharmat", "2026-05-08", true],
                ["Coakley 1988 — sárga rozsda", "2026-04-30", true],
              ].map(([n, d, ok], i) => (
                <div key={i} className="list-row">
                  <Icon name="file" size={14}/>
                  <div style={{flex: 1}}><div>{n}</div><div className="mono dim" style={{fontSize: 10}}>{d}</div></div>
                  {ok && <Icon name="check" size={12}/>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* results column */}
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Elemzési eredmények</h3>
            {phase === "done" && (
              <span className="row gap-sm">
                <span className="tag tag-custom"><Icon name="check" size={10}/>Modell azonosítva</span>
              </span>
            )}
          </div>
          {phase !== "done" ? (
            <div className="card-body">
              <div className="placeholder" style={{padding: 60}}>
                {phase === "idle"
                  ? "Tölts fel egy PDF-et vagy szöveget az elemzéshez."
                  : "AI feldolgozza a dokumentumot… (~10 mp)"}
              </div>
            </div>
          ) : (
            <div className="card-body">
              <div className="tabs">
                {[
                  ["meta", "Metaadatok"],
                  ["disease", "Betegség"],
                  ["other", "Egyéb adatok"],
                  ["model", "Modell"],
                ].map(([k, l]) => (
                  <button key={k} className={"tab" + (tab === k ? " active" : "")} onClick={() => setTab(k)}>{l}</button>
                ))}
              </div>

              {tab === "meta" && (
                <table className="tbl">
                  <tbody>
                    <tr><td className="mono dim">Cím</td><td>Risk assessment of Fusarium head blight in wheat using daily weather variables</td></tr>
                    <tr><td className="mono dim">Szerzők</td><td>De Wolf, E. D.; Madden, L. V.; Lipps, P. E.</td></tr>
                    <tr><td className="mono dim">Folyóirat</td><td>Phytopathology</td></tr>
                    <tr><td className="mono dim">Évszám</td><td className="mono">2003</td></tr>
                    <tr><td className="mono dim">DOI</td><td className="mono" style={{color: "var(--blue)"}}>10.1094/PHYTO.2003.93.4.428</td></tr>
                    <tr><td className="mono dim">Idézettség</td><td className="mono">312</td></tr>
                  </tbody>
                </table>
              )}
              {tab === "disease" && (
                <table className="tbl">
                  <tbody>
                    <tr><td className="mono dim">Kórokozó</td><td><i>Fusarium graminearum</i></td></tr>
                    <tr><td className="mono dim">Magyar név</td><td>Fuzárium kalász-rothadás (FHB)</td></tr>
                    <tr><td className="mono dim">Gazdanövény</td><td>Triticum aestivum (búza), Hordeum vulgare (árpa)</td></tr>
                    <tr><td className="mono dim">Fenofázis</td><td>Anthesis ± 7 nap (BBCH 61–69)</td></tr>
                    <tr><td className="mono dim">Mikotoxin</td><td>Deoxynivalenol (DON), Zearalenon (ZEA)</td></tr>
                  </tbody>
                </table>
              )}
              {tab === "other" && (
                <div>
                  <div className="section-lbl">Mintaterület</div>
                  <p style={{marginTop: 0}}>USA középnyugati államok (Ohio, Indiana, Illinois) · 1996-2001 közötti megfigyelések · n = 50 helyszín-év.</p>
                  <div className="section-lbl">Módszer</div>
                  <p style={{marginTop: 0}}>Logisztikus regresszió napi átlagos hőmérséklet és relatív páratartalom változókra. ROC görbe alapján optimális küszöb 0.5 pontnál.</p>
                  <div className="section-lbl">Konklúzió</div>
                  <p style={{marginTop: 0}}>A modell 84%-os pontossággal jelzi a járványos éveket; magas RH × meleg hőmérséklet a kulcs prediktor.</p>
                </div>
              )}
              {tab === "model" && (
                <div>
                  <div className="row" style={{padding: 14, background: "var(--green-soft)", border: "1px solid var(--green-border)", borderRadius: "var(--r-md)", marginBottom: 16, justifyContent: "space-between"}}>
                    <div>
                      <div className="br" style={{fontWeight: 600}}>Modell azonosítva: logisztikus regresszió</div>
                      <div className="mono dim" style={{fontSize: 11, marginTop: 2}}>confidence: 0.94 · 4/4 paraméter kinyerve</div>
                    </div>
                    <Icon name="check" size={20} style={{color: "var(--green)"}}/>
                  </div>

                  <div className="section-lbl">Kinyert paraméterek</div>
                  <table className="tbl">
                    <thead><tr><th>Paraméter</th><th>Érték</th><th>Forrás (oldal)</th><th>Konfidencia</th></tr></thead>
                    <tbody>
                      <tr><td className="mono">T_opt</td><td className="mono br">22.5 °C</td><td className="mono dim">p. 431, Tab. 2</td><td><div className="risk-bar" style={{width: 80}}><span style={{width: "95%", background: "var(--green)"}}/></div></td></tr>
                      <tr><td className="mono">σ</td><td className="mono br">6</td><td className="mono dim">p. 431, eq. 4</td><td><div className="risk-bar" style={{width: 80}}><span style={{width: "88%", background: "var(--green)"}}/></div></td></tr>
                      <tr><td className="mono">RH_thr</td><td className="mono br">65 %</td><td className="mono dim">p. 432, Tab. 3</td><td><div className="risk-bar" style={{width: 80}}><span style={{width: "82%", background: "var(--green)"}}/></div></td></tr>
                      <tr><td className="mono">risk_thr</td><td className="mono br">50</td><td className="mono dim">p. 433, fig. 5</td><td><div className="risk-bar" style={{width: 80}}><span style={{width: "78%", background: "var(--yellow)"}}/></div></td></tr>
                    </tbody>
                  </table>

                  <div className="section-lbl" style={{marginTop: 16}}>Képlet</div>
                  <div style={{background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-br)"}}>
                    R = logit⁻¹(β₀ + β₁·T·RH + β₂·precip_days) × 100
                  </div>

                  <div className="row gap-sm" style={{marginTop: 18, justifyContent: "flex-end"}}>
                    <button className="btn">Szerkesztés előtt</button>
                    <button className="btn btn-primary"><Icon name="plus" size={12}/>Importálás a modellek közé</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

/* ============================================================
   ADMIN
   ============================================================ */
const AdminPage = () => {
  const [tab, setTab] = useStateB("api");
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Admin</h1>
          <div className="page-sub">Rendszer konfigurációja · API kulcsok · felhasználók · jogosultságok</div>
        </div>
        <div className="page-actions">
          <span className="tag tag-builtin"><Icon name="shield" size={10}/>admin role</span>
        </div>
      </div>

      <div className="tabs">
        {[["api","API kulcsok"],["meteo","Meteorológia"],["users","Felhasználók"],["system","Rendszer"]].map(([k,l]) => (
          <button key={k} className={"tab" + (tab === k ? " active" : "")} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "api" && (
        <div className="col">
          {[
            ["Claude API kulcs (Anthropic)", "sk-ant-•••••••••••••••••••••••", "OK · utolsó teszt 2026-05-23"],
            ["Open-Meteo Pro kulcs", "om-•••••••••••••••••", "OK · 1.2k req / nap"],
            ["Azure AD Client ID", "1f4e8b8c-2d4a-4b7a-9c8e-3f5a6b7c8d9e", ""],
            ["Azure AD Tenant ID", "8a4b3c2d-1e5f-6a7b-8c9d-0e1f2a3b4c5d", ""],
          ].map(([lbl, val, status], i) => (
            <div key={i} className="card">
              <div className="card-body" style={{display: "flex", gap: 12, alignItems: "flex-end"}}>
                <div style={{flex: 1}}>
                  <label className="form-label">{lbl}</label>
                  <input className="form-input form-mono" value={val} readOnly/>
                </div>
                <button className="btn">Mentés</button>
                <button className="btn"><Icon name="check" size={11}/>Teszt</button>
                {status && <div className="mono" style={{fontSize: 10, color: "var(--green)", whiteSpace: "nowrap", paddingBottom: 10}}>{status}</div>}
              </div>
            </div>
          ))}
          <div className="card">
            <div className="card-body">
              <label className="form-label">Redirect URI</label>
              <input className="form-input form-mono" defaultValue="https://notox.eu/login.html"/>
            </div>
          </div>
        </div>
      )}

      {tab === "meteo" && (
        <div className="card">
          <div className="card-body">
            <div className="grid-2" style={{gap: 24}}>
              <div className="col">
                <div className="section-lbl">Lekérési ráta</div>
                <div className="form-row">
                  <div><label className="form-label">Batch méret</label><input className="form-input form-mono" type="number" defaultValue="6"/></div>
                  <div><label className="form-label">Késleltetés (ms)</label><input className="form-input form-mono" type="number" defaultValue="250"/></div>
                </div>
                <div className="section-lbl" style={{marginTop: 10}}>Időablak</div>
                <div className="form-row">
                  <div><label className="form-label">Előrejelzés (nap)</label><input className="form-input form-mono" type="number" defaultValue="7"/></div>
                  <div><label className="form-label">Visszatekintő (nap)</label><input className="form-input form-mono" type="number" defaultValue="7"/></div>
                </div>
              </div>
              <div className="col">
                <div className="section-lbl">Térkép alapbeállítás</div>
                <div className="form-row">
                  <div><label className="form-label">Lat</label><input className="form-input form-mono" defaultValue="47.16"/></div>
                  <div><label className="form-label">Lon</label><input className="form-input form-mono" defaultValue="19.50"/></div>
                  <div><label className="form-label">Zoom</label><input className="form-input form-mono" type="number" defaultValue="7"/></div>
                </div>
                <div className="section-lbl" style={{marginTop: 10}}>Cache</div>
                <div className="form-row">
                  <div><label className="form-label">Redis TTL (s)</label><input className="form-input form-mono" type="number" defaultValue="3600"/></div>
                  <div><label className="form-label">Cache hit ráta</label><input className="form-input form-mono" defaultValue="84 %" readOnly/></div>
                </div>
              </div>
            </div>
            <div className="row gap-sm" style={{marginTop: 16, justifyContent: "flex-end"}}>
              <button className="btn">Visszaállítás</button>
              <button className="btn btn-primary">Mentés</button>
            </div>
          </div>
        </div>
      )}

      {tab === "users" && (
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Felhasználók</h3>
            <button className="btn btn-sm btn-primary"><Icon name="plus" size={11}/>Meghívás</button>
          </div>
          <table className="tbl">
            <thead><tr><th>E-mail</th><th>Név</th><th>Szerep</th><th>Belépések</th><th>Utolsó belépés</th><th></th></tr></thead>
            <tbody>
              {[
                ["r.kovacs@agri.hu", "Kovács Réka", "admin", 248, "2026-05-24 09:12"],
                ["b.nagy@agri.hu", "Nagy Bence", "user", 89, "2026-05-23 17:46"],
                ["a.szabo@nebih.gov.hu", "Szabó András", "user", 34, "2026-05-22 11:02"],
                ["pallag@unideb.hu", "Pallag állomás (svc)", "user", 1284, "2026-05-24 14:00"],
                ["e.feher@karolyrobert.hu", "Fehér Eszter", "user", 12, "2026-05-19 08:30"],
              ].map((r, i) => (
                <tr key={i}>
                  <td className="mono">{r[0]}</td>
                  <td>{r[1]}</td>
                  <td>
                    <span className={"tag " + (r[2] === "admin" ? "tag-custom" : "")}>{r[2]}</span>
                  </td>
                  <td className="num mono">{r[3]}</td>
                  <td className="mono dim">{r[4]}</td>
                  <td>
                    <div className="row gap-sm">
                      <button className="btn btn-sm btn-ghost"><Icon name="edit" size={11}/></button>
                      <button className="btn btn-sm btn-ghost btn-danger"><Icon name="trash" size={11}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "system" && (
        <div className="grid-2">
          <div className="card">
            <div className="card-head"><h3 className="card-title">localStorage</h3></div>
            <div className="card-body">
              <div className="row-between mono" style={{fontSize: 12, marginBottom: 12}}>
                <span className="dim">Összméret</span>
                <span className="br">428 KB / 5 MB</span>
              </div>
              <div className="risk-bar" style={{marginBottom: 16}}>
                <span style={{width: "8.6%", background: "var(--blue)"}}/>
              </div>
              <table className="tbl">
                <thead><tr><th>Kulcs</th><th className="num">Méret</th></tr></thead>
                <tbody>
                  <tr><td className="mono">notox-models</td><td className="num mono">12 KB</td></tr>
                  <tr><td className="mono">notox-locations</td><td className="num mono">3 KB</td></tr>
                  <tr><td className="mono">notox-validation-obs</td><td className="num mono">87 KB</td></tr>
                  <tr><td className="mono">notox-meteo-cache</td><td className="num mono">312 KB</td></tr>
                  <tr><td className="mono">notox-dev-account</td><td className="num mono">0.2 KB</td></tr>
                  <tr><td className="mono">notox-api-keys</td><td className="num mono">0.4 KB</td></tr>
                </tbody>
              </table>
              <div className="row gap-sm" style={{marginTop: 16}}>
                <button className="btn btn-sm"><Icon name="download" size={11}/>Export JSON</button>
                <button className="btn btn-sm"><Icon name="upload" size={11}/>Import</button>
                <button className="btn btn-sm btn-danger"><Icon name="trash" size={11}/>Adatok törlése</button>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3 className="card-title">Rendszer státusz</h3></div>
            <div className="card-body">
              {[
                ["Frontend build", "v0.4.2 · 2026.05.24", "on"],
                ["Backend API", "/api · response 142ms", "on"],
                ["PostgreSQL", "primary · replica lag 0ms", "on"],
                ["Redis cache", "84% hit ráta · 312 keys", "on"],
                ["Open-Meteo API", "ok · 1.2k/2k napi limit", "warn"],
                ["Anthropic API", "ok · 47 req / nap", "on"],
                ["Azure AD", "ok", "on"],
              ].map((r, i) => (
                <div key={i} className="row" style={{padding: "8px 0", borderBottom: i < 6 ? "1px solid var(--border)" : "0", justifyContent: "space-between"}}>
                  <div className="row gap-sm">
                    <span className={"s-dot s-" + r[2]}/>
                    <span>{r[0]}</span>
                  </div>
                  <span className="mono dim" style={{fontSize: 11}}>{r[1]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

Object.assign(window, { ModelsPage, ForecastPage, ValidationPage, SourcesPage, AdminPage });
