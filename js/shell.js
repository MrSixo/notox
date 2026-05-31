// No-tox — Shell: oldalsáv, auth, navigáció
// MSAL.js 3.x (browser bundle CDN-ről töltve)

// ── MSAL init ────────────────────────────────────────────────────────────
let _msalApp = null;

function getMsal() {
  if (_msalApp) return _msalApp;
  _msalApp = new msal.PublicClientApplication({
    auth: {
      clientId:    NOTOX_CONFIG.msal.clientId,
      authority:   NOTOX_CONFIG.msal.authority,
      redirectUri: NOTOX_CONFIG.msal.redirectUri,
    },
    cache: { cacheLocation: "localStorage", storeAuthStateInCookie: false },
  });
  return _msalApp;
}

// ── Auth helpers ──────────────────────────────────────────────────────────
async function getAccount() {
  const app = getMsal();
  await app.initialize();
  const accounts = app.getAllAccounts();
  return accounts.length ? accounts[0] : null;
}

async function login() {
  const app = getMsal();
  await app.initialize();
  try {
    const result = await app.loginPopup({ scopes: NOTOX_CONFIG.scopes });
    app.setActiveAccount(result.account);
    return result.account;
  } catch (e) {
    // ha popup-blocker: fallback redirect
    if (e.errorCode === "popup_window_error" || e.errorCode === "empty_window_error") {
      await app.loginRedirect({ scopes: NOTOX_CONFIG.scopes });
    }
    throw e;
  }
}

async function logout() {
  if (localStorage.getItem("notox-dev-account")) {
    localStorage.removeItem("notox-dev-account");
    window.location.href = "/login.html";
    return;
  }
  const app = getMsal();
  const account = app.getActiveAccount() || (await getAccount());
  await app.logoutPopup({ account });
  window.location.href = "/login.html";
}

// ── Oldal védelem ─────────────────────────────────────────────────────────
const PUBLIC_PAGES = ["/login.html", "/login"];

async function requireAuth() {
  const path = window.location.pathname;
  if (PUBLIC_PAGES.some(p => path === p || path.endsWith(p))) return null;

  // Fejlesztői bypass (csak localhost)
  const devRaw = localStorage.getItem("notox-dev-account");
  if (devRaw) {
    try { return JSON.parse(devRaw); } catch (_) {}
  }

  // MSAL redirect callback feldolgozása
  const app = getMsal();
  await app.initialize();
  try { await app.handleRedirectPromise(); } catch (_) {}

  const account = await getAccount();
  if (!account) {
    window.location.replace("/login.html");
    return null;
  }
  app.setActiveAccount(account);
  return account;
}

// ── Admin jogosultság ─────────────────────────────────────────────────────
function isAdminUser(account) {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return true;
  try {
    const admins = JSON.parse(localStorage.getItem("notox-admins") || "[]");
    const email = (account?.username || "").toLowerCase();
    // Ha még nincs admin beállítva → első belépő automatikusan admin lesz
    if (!admins.length) {
      if (email) { admins.push(email); localStorage.setItem("notox-admins", JSON.stringify(admins)); }
      return true;
    }
    return admins.includes(email);
  } catch { return false; }
}

// ── Kutató jogosultság ────────────────────────────────────────────────────
function isResearcherUser(account) {
  if (isAdminUser(account)) return true; // admin = kutató is
  try {
    const researchers = JSON.parse(localStorage.getItem("notox-researchers") || "[]");
    const email = (account?.username || "").toLowerCase();
    return researchers.includes(email);
  } catch { return false; }
}

// Belépési napló frissítése
function logUserLogin(account) {
  try {
    const log = JSON.parse(localStorage.getItem("notox-user-log") || "[]");
    const entry = {
      email: account.username || "",
      name:  account.name || account.username || "",
      lastLogin: new Date().toISOString(),
    };
    const idx = log.findIndex(u => u.email === entry.email);
    if (idx >= 0) log[idx] = entry; else log.push(entry);
    localStorage.setItem("notox-user-log", JSON.stringify(log));
  } catch {}
}

// ── Navigáció definíció ───────────────────────────────────────────────────
const NAV_ITEMS = [
  { href: "/dashboard.html", label: "Dashboard",    icon: "dashboard", match: ["/dashboard.html", "/index.html", "/"] },
  { href: "/meteo.html",     label: "Meteorológia", icon: "meteo",     match: ["/meteo.html"] },
  { href: "/models.html",    label: "Modellek",     icon: "model",     match: ["/models.html", "/diseases.html"] },
  { href: "/forecast.html",    label: "Előrejelzés",  icon: "chart",     match: ["/forecast.html"] },
  { href: "/field.html",      label: "Táblaelemző",  icon: "field",     match: ["/field.html"] },
  { href: "/validation.html", label: "Validáció",    icon: "validate",  match: ["/validation.html"] },
  { href: "/sources.html",   label: "Forráselemzés", icon: "sources",  match: ["/sources.html"] },
];

const ICONS = {
  dashboard: `<path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z"/>`,
  meteo:     `<path d="M8 3v1M8 12v1M3 8H2M14 8h-1M4.9 4.9l-.7-.7M11.8 11.8l-.7-.7M4.9 11.1l-.7.7M11.8 4.2l-.7.7M11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/>`,
  chart:     `<path d="M2.5 13.5h11M4.5 13.5V8.5M7 13.5V5M9.5 13.5V9M12 13.5V6.5"/>`,
  disease:   `<path d="M8 2c-1.5 0-3 1-3 3 0 1 .5 2 1 2.5C4.5 8.5 3 10 3 12h10c0-2-1.5-3.5-3-4.5.5-.5 1-1.5 1-2.5 0-2-1.5-3-3-3zM6 14h4"/>`,
  model:     `<path d="M3 5h10M3 8h7M3 11h4M13 9l2 2-2 2"/>`,
  validate:  `<path d="M3 8l3 3 7-7"/><circle cx="8" cy="8" r="6"/>`,
  sources:   `<path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M10 2v3h3"/><line x1="5" y1="8" x2="11" y2="8"/><line x1="5" y1="11" x2="9" y2="11"/>`,
  field:     `<rect x="2" y="2" width="12" height="12" rx="1"/><path d="M2 6h12M2 10h12M6 2v12M10 2v12"/>`,
  admin:     `<circle cx="8" cy="8" r="2"/><path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.6 3.6l.7.7M11.7 11.7l.7.7M3.6 12.4l.7-.7M11.7 4.3l.7-.7"/>`,
  logout:    `<path d="M11 10l3-3-3-3M14 7H6M9 3H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h5"/>`,
  collapse:  `<path d="M10 3l-4 5 4 5"/>`,
  expand:    `<path d="M6 3l4 5-4 5"/>`,
  moon:      `<path d="M12 3a6 6 0 0 0-8.46 8.46A6 6 0 1 0 12 3z"/>`,
  sun:       `<circle cx="8" cy="8" r="2.5"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.2 3.2l1 1M11.8 11.8l1 1M3.2 12.8l1-1M11.8 4.2l1-1"/>`,
  monitor:   `<rect x="2" y="3" width="12" height="9" rx="1"/><path d="M5 15h6M8 12v3"/>`,
};

function svg(name, size = 16) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

// ── Témaváltás ────────────────────────────────────────────────────────────
const THEMES = ["dark", "grey", "light"];
const THEME_ICONS  = { dark: "moon", grey: "monitor", light: "sun" };
const THEME_LABELS = { dark: "Sötét", grey: "Szürke", light: "Világos" };

function applyTheme(theme) {
  THEMES.forEach(t => {
    document.body.classList.remove("theme-" + t);
    document.documentElement.classList.remove("theme-" + t);
  });
  document.body.classList.add("theme-" + theme);
  document.documentElement.classList.add("theme-" + theme);
  document.documentElement.style.visibility = "";
  localStorage.setItem("notox-theme", theme);
}

function initTheme() {
  const saved = localStorage.getItem("notox-theme") || "dark";
  applyTheme(saved);
  return saved;
}

function cycleTheme() {
  const current = localStorage.getItem("notox-theme") || "dark";
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
  applyTheme(next);
  // Update button label + icon
  const btn = document.getElementById("btn-theme");
  if (btn) {
    btn.title = THEME_LABELS[next];
    btn.setAttribute("aria-label", `Téma váltása: jelenleg ${THEME_LABELS[next]}`);
    btn.innerHTML = `${svg(THEME_ICONS[next], 13)}<span style="font-size:10px;font-family:var(--mono)">${THEME_LABELS[next]}</span>`;
  }
}

// ── Sidebar + topbar injektálás ───────────────────────────────────────────
async function injectShell() {
  const account = await requireAuth();
  if (!account) return; // redirect in progress

  window.__notoxAccount = account;
  logUserLogin(account);

  const path = window.location.pathname;
  const collapsed = localStorage.getItem("notox-sidebar") === "collapsed";
  const isAdmin = isAdminUser(account);
  const isResearcher = isResearcherUser(account);

  // Sidebar HTML
  const strippedPath = path.replace(/\.html$/, "");
  const allNavItems = isAdmin
    ? [...NAV_ITEMS, { href: "/admin.html", label: "Admin", icon: "admin", match: ["/admin.html"] }]
    : NAV_ITEMS;
  const navHtml = allNavItems.map(it => {
    const active = it.match.some(m => {
      const s = m.replace(/\.html$/, "");
      return strippedPath === s || strippedPath.endsWith(s);
    });
    const isAdminItem = it.icon === "admin";
    return `<a href="${it.href}" class="sb-item${active ? " active" : ""}${isAdminItem ? " sb-item-admin" : ""}">
      ${svg(it.icon, 14)}
      <span>${it.label}</span>
    </a>`;
  }).join("");

  const initials = (account.name || account.username || "?")
    .split(/\s+/).map(s => s[0]).slice(0, 2).join("").toUpperCase();

  const sidebar = document.createElement("aside");
  sidebar.id = "sidebar";
  sidebar.className = "sidebar" + (collapsed ? " collapsed" : "");
  sidebar.innerHTML = `
    <div class="sb-brand">
      <span class="brand-logo">N</span>
      <span class="sb-brand-name">No-tox</span>
      <span class="sb-beta">beta</span>
    </div>
    <nav class="sb-nav">${navHtml}</nav>
    <div class="sb-footer">
      <div class="sb-avatar">${initials}</div>
      <div class="sb-who">
        <div class="sb-name">${account.name || account.username}</div>
        <div class="sb-role">${account.username}</div>
      </div>
      <button class="sb-icon-btn" id="btn-logout" title="Kilépés" onclick="logout()">
        ${svg("logout", 14)}
      </button>
    </div>
  `;

  // Topbar HTML
  const currentTheme = localStorage.getItem("notox-theme") || "dark";
  const topbar = document.createElement("header");
  topbar.className = "topbar";
  const pageTitle = document.title.replace("No-tox — ", "");
  topbar.innerHTML = `
    <button class="sb-icon-btn" id="btn-collapse" title="Oldalsáv" style="margin-right:8px;">
      ${svg(collapsed ? "expand" : "collapse", 14)}
    </button>
    <span class="topbar-title">${pageTitle}</span>
    <div class="topbar-right">
      <button id="btn-theme" title="${THEME_LABELS[currentTheme]}" aria-label="Téma váltása: jelenleg ${THEME_LABELS[currentTheme]}" onclick="cycleTheme()"
        style="display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:6px;
               border:1px solid var(--border);background:var(--bg-2);color:var(--text-muted);
               cursor:pointer;font-family:var(--mono);font-size:10px;transition:border-color .12s,color .12s;"
        onmouseenter="this.style.borderColor='var(--green-line)';this.style.color='var(--text)'"
        onmouseleave="this.style.borderColor='var(--border)';this.style.color='var(--text-muted)'">
        ${svg(THEME_ICONS[currentTheme], 13)}<span style="font-size:10px">${THEME_LABELS[currentTheme]}</span>
      </button>
      <span class="env-pill" style="margin-left:6px;">LOCAL</span>
    </div>
  `;

  // App shell wrapper
  document.body.classList.add("app");
  if (collapsed) document.body.classList.add("sidebar-collapsed");
  const content = document.querySelector(".page-wrap, main, .page");
  if (content) content.classList.add("content");

  document.body.prepend(topbar);
  document.body.prepend(sidebar);

  // Collapse toggle
  document.getElementById("btn-collapse").addEventListener("click", () => {
    const sb = document.getElementById("sidebar");
    const isNowCollapsed = sb.classList.toggle("collapsed");
    document.body.classList.toggle("sidebar-collapsed", isNowCollapsed);
    localStorage.setItem("notox-sidebar", isNowCollapsed ? "collapsed" : "open");
    document.getElementById("btn-collapse").innerHTML = svg(isNowCollapsed ? "expand" : "collapse", 14);
  });

  document.documentElement.style.visibility = "";

  // Értesíti az oldalakat, hogy a shell betöltött (pl. admin.html jogosultság-ellenőrzés)
  window.dispatchEvent(new CustomEvent("notox-ready", { detail: { account, isAdmin, isResearcher } }));
}

// Auto-run
(function () {
  // Téma alkalmazása azonnal (villogás/FOUC ellen)
  const savedTheme = localStorage.getItem("notox-theme") || "dark";
  THEMES.forEach(t => document.body.classList.remove("theme-" + t));
  document.body.classList.add("theme-" + savedTheme);

  // Tartalom elrejtése villogás ellen
  const path = window.location.pathname;
  if (!PUBLIC_PAGES.some(p => path === p || path.endsWith(p))) {
    document.documentElement.style.visibility = "hidden";
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectShell);
  } else {
    injectShell();
  }
})();
