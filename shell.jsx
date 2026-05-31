// App shell: topbar + sidebar + page slot.
const { useState, useEffect, useMemo, useRef } = React;

const NAV = [
  { id: "dashboard", lbl: "Dashboard", icon: "dashboard" },
  { id: "meteo", lbl: "Meteorológia", icon: "cloud" },
  { id: "diseases", lbl: "Betegségek", icon: "leaf", badge: "5" },
  { id: "models", lbl: "Modellek", icon: "flask", badge: "5" },
  { id: "forecast", lbl: "Előrejelzés", icon: "chart" },
  { id: "validation", lbl: "Validáció", icon: "check-square" },
  { id: "sources", lbl: "Forráselemzés", icon: "sparkle" },
];
const NAV_BOTTOM = [
  { id: "admin", lbl: "Admin", icon: "settings" },
];

const THEMES = ["dark", "grey", "light"];
const THEME_ICONS = { dark: "moon", grey: "monitor", light: "sun" };
const THEME_LABELS = { dark: "Sötét", grey: "Szürke", light: "Világos" };

const Shell = ({ page, setPage, children, user, onLogout, theme = "dark", onThemeChange }) => {
  const [collapsed, setCollapsed] = useState(false);
  const current = [...NAV, ...NAV_BOTTOM].find(n => n.id === page) || NAV[0];

  const cycleTheme = () => {
    const idx = THEMES.indexOf(theme);
    onThemeChange && onThemeChange(THEMES[(idx + 1) % THEMES.length]);
  };

  return (
    <div className={"app" + (collapsed ? " collapsed" : "")}>
      {/* Topbar */}
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark">N</div>
          {!collapsed && <span>No-tox</span>}
        </div>
        <div className="crumbs">
          <button className="btn btn-ghost btn-sm" onClick={() => setCollapsed(c => !c)} title="Sidebar">
            <Icon name="menu" size={14}/>
          </button>
          <span>No-tox</span>
          <span className="sep">/</span>
          <span className="here">{current.lbl}</span>
        </div>
        <div className="actions">
          <div className="pill"><span className="dot"></span>BETA · {window.isoOf(window.today)}</div>
          <div className="pill mono"><Icon name="cloud" size={11} style={{verticalAlign:"-2px", marginRight:4}}/> Open-Meteo · cache 1h</div>
          {/* Theme toggle */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={cycleTheme}
            title={THEME_LABELS[theme]}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px" }}
          >
            <Icon name={THEME_ICONS[theme]} size={14}/>
            <span style={{ fontSize: 11 }}>{THEME_LABELS[theme]}</span>
          </button>
          <div className="user" onClick={onLogout} title="Kijelentkezés">
            <div className="avatar">{user.name.slice(0,1)}</div>
            <span style={{fontSize: 11}}>{user.name}</span>
            <Icon name="chevron-down" size={12} />
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <aside className="sidebar">
        {!collapsed && <div className="section-lbl">Felhasználói</div>}
        <nav>
          {NAV.map(n => (
            <button key={n.id} className={"nav-item" + (page === n.id ? " active" : "")} onClick={() => setPage(n.id)}>
              <span className="ico"><Icon name={n.icon}/></span>
              <span className="lbl">{n.lbl}</span>
              {n.badge && <span className="badge">{n.badge}</span>}
            </button>
          ))}
        </nav>
        {!collapsed && <div className="section-lbl" style={{marginTop: 10}}>Rendszer</div>}
        <nav>
          {NAV_BOTTOM.map(n => (
            <button key={n.id} className={"nav-item" + (page === n.id ? " active" : "")} onClick={() => setPage(n.id)}>
              <span className="ico"><Icon name={n.icon}/></span>
              <span className="lbl">{n.lbl}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          v0.4.2 · build 2026.05.24<br/>
          <a href="#" style={{color: "var(--text-dim)"}}>Súgó</a> · <a href="#" style={{color: "var(--text-dim)"}}>API status</a>
        </div>
      </aside>

      {/* Content */}
      <main className="content" key={page}>
        <div className="content-inner">{children}</div>
      </main>
    </div>
  );
};

window.Shell = Shell;
