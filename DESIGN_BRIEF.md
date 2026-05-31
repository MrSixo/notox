# No-tox — Frontend Design Brief & Architektúra

> **Cél:** Ez a dokumentum a No-tox növényvédelmi előrejelző platform teljes frontend tervét és
> a tervezett backend kapcsolódási pontjait írja le. Alapként szolgál UI/UX tervezéshez,
> backend fejlesztéshez és API-integrációhoz.

---

## 1. Projekt áttekintés

**No-tox** egy webalapú, tudományos igényű fuzárium (és egyéb gabonabetegség) kockázat-előrejelző
rendszer magyar gazdálkodók és kutatók számára.

| Tulajdonság | Érték |
|---|---|
| Célcsoport | Agrárkutatók, növényvédelmi szaktanácsadók, gazdálkodók |
| Nyelv | Magyar (HU) |
| Platform | Reszponzív web (desktop-first, tablet-kompatibilis) |
| Auth | Microsoft SSO (Azure AD / MSAL.js) |
| Jelenlegi állapot | Statikus frontend (HTML/CSS/JS) · localStorage adatkezelés |
| Tervezett állapot | REST API backend + adatbázis + valós idejű adatok |

---

## 2. Design rendszer

### Színpaletta

```
Háttér (mélyebb):   #0d0f0e   --bg-0
Háttér (alap):      #111412   --bg-1
Háttér (kártya):    #161a17   --bg-2
Háttér (bemenet):   #1c211d   --bg-3
Keret:              #242924   --border

Szöveg (fő):        #c8d4c9   --text
Szöveg (kiemelt):   #e8f0e9   --text-br
Szöveg (halk):      #7a8c7b   --text-dim

Zöld (akció):       #4caf7d   --green
Zöld (soft bg):     rgba(76,175,125,0.08)
Zöld (border):      rgba(76,175,125,0.2)
Kék (info):         #5b9cf6   --blue
Narancs (warning):  #dc5a1e
Piros (kritikus):   #e05252
```

### Tipográfia

```
Fejlécek, UI elemek:  IBM Plex Sans (400, 600)
Kód, adatok, mono:    IBM Plex Mono (400, 600)
Alap betűméret:       13px
```

### Layout

```
Sidebar szélesség:     240px (összecsukva: 52px)
Content max-width:     1200px
Topbar magasság:       48px
Border radius (lg):    10px
Border radius (sm):    6px
Gap (grid):            14–20px
```

### Komponensek

| Komponens | Leírás |
|---|---|
| `.btn-primary` | Zöld alapszín, fehér szöveg |
| `.btn` | Semleges, keretes gomb |
| `.btn-sm` | Kisebb méret (táblázatokban) |
| `.form-input` | Sötét bg, zöld focus border |
| `.result-card` / `.admin-card` | Keretes kártya, fejléccel |
| `.model-section-lbl` | Mono, uppercase, halk szín |
| `.tag-builtin` / `.tag-custom` | Kis kategória-badge |
| Kockázat szín: alacsony | `#4caf7d` — zöld |
| Kockázat szín: közepes | `#d4a017` — sárga |
| Kockázat szín: magas | `#dc5a1e` — narancs |
| Kockázat szín: kritikus | `#e05252` — piros |

---

## 3. Oldalak és funkciók

### 3.1 `/login` — Belépés

**Funkció:** Microsoft SSO belépési oldal.

```
┌────────────────────────────────┐
│  [N]  No-tox                   │
│                                │
│  Belépés a rendszerbe          │
│  Növényvédelmi előrejelző...   │
│                                │
│  [Microsoft fiókkal belépés]   │
│                                │
│  BETA · Csak meghívott...      │
└────────────────────────────────┘
```

**Backend kapcsolat:**
- `POST /auth/token` — MSAL token validálás
- `GET /auth/me` — bejelentkezett user adatai + role
- **Dev bypass:** `notox-dev-account` localStorage kulcs (csak localhost)

---

### 3.2 `/dashboard` — Főoldal

**Funkció:** Mentett helyszínek kockázati widgetjei, gyors áttekintés.

```
┌──────────────────────────────────────────────────┐
│  Dashboard                     Ma: 2026-05-24    │
│  [+ Helyszín]                                    │
├──────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐               │
│  │ Debrecen    │  │ Budapest    │               │
│  │ ████░░ 68   │  │ ██░░░░ 34  │               │
│  │ MAGAS       │  │ KÖZEPES    │               │
│  │ 22°C 85%RH  │  │ 18°C 70%RH │               │
│  └─────────────┘  └─────────────┘               │
│  [7 napos grafikon minden helyszínhez]           │
└──────────────────────────────────────────────────┘
```

**Backend kapcsolat:**
- `GET /api/forecast?lat=&lon=&days=7` — előrejelzési adatok helyszínenként
- `GET /api/risk/summary?lat=&lon=` — napi kockázati index
- `GET /api/user/locations` — mentett helyszínek (jelenleg localStorage)
- `POST /api/user/locations` — helyszín mentése

**Adatfolyam (jelenlegi → tervezett):**
```
localStorage → PostgreSQL users.locations tábla
Open-Meteo API (kliens) → Backend cache (Redis 1h TTL)
```

---

### 3.3 `/meteo` — Meteorológia

**Funkció:** Interaktív térkép (Leaflet) + állomás-adatok, saját mérőállomások.

```
┌──────────────────────────────────────────────────┐
│  Meteorológia                  [Lista] [Térkép]  │
├──────────────────────┬───────────────────────────┤
│  ÁLLOMÁSOK           │  [Leaflet térkép]         │
│  ─────────────────── │  ●  Debrecen  68          │
│  ● Debrecen     68   │  ●  Budapest  34          │
│  ● Budapest     34   │  ●  Pécs      21          │
│  ● Pécs         21   │                           │
│  ─────────────────── │  [Hőtérkép overlay]       │
│  [+ Saját állomás]   │                           │
│                      │  [Időcsúszka]             │
└──────────────────────┴───────────────────────────┘
│  [Kiválasztott állomás idősor grafikonok]        │
│  T (°C)  RH (%)  Csapadék (mm)  Kockázat index  │
└──────────────────────────────────────────────────┘
```

**Backend kapcsolat:**
- `GET /api/meteo/stations` — állomáslista (koordinátákkal)
- `GET /api/meteo/forecast?lat=&lon=&vars=temperature,humidity,precipitation`
- `GET /api/meteo/history?lat=&lon=&start=&end=`
- `GET /api/meteo/grid?bbox=&resolution=0.5` — hőtérkép rácsadatok
- `POST /api/user/stations` — saját mérőállomás mentése
- `DELETE /api/user/stations/:id`

**Jelenleg:** Open-Meteo API hívás közvetlenül a kliensről (CORS ok).
**Tervezett:** Backend cache Redis-ben, rate-limit védelem, saját állomások DB-ben.

---

### 3.4 `/diseases` — Betegségek

**Funkció:** Gabonabetegségek enciklopédiája, azonosítási segédlet.

```
┌──────────────────────────────────────────────────┐
│  Betegségek                                      │
├──────────┬───────────────────────────────────────┤
│ LISTA    │  Fuzárium kalász-rothadás (FHB)       │
│ ──────── │  Fusarium graminearum                 │
│ Fuzárium │                                       │
│ Rozsdák  │  [Fotók]  [Tünetek]  [Kockázati tényezők] │
│ Liszthar │  [Védekezés]  [Irodalom]              │
│ mat      │                                       │
│          │  Kapcsolódó modell: De Wolf 2003 →    │
└──────────┴───────────────────────────────────────┘
```

**Backend kapcsolat:**
- `GET /api/diseases` — betegség lista
- `GET /api/diseases/:slug` — részletes adatlap
- `GET /api/diseases/:slug/models` — kapcsolódó előrejelző modellek

---

### 3.5 `/models` — Modell-könyvtár

**Funkció:** Irodalmi és egyéni matematikai modellek kezelése, variáns-létrehozás.

```
┌──────────────────────────────────────────────────┐
│  Modellek           [+ Modell hozzáadása]        │
├──────────────┬───────────────────────────────────┤
│  MODELLEK 5  │  Fuzárium kalász-rothadás (FHB)   │
│  ──────────  │  De Wolf, Madden & Lipps · 2003   │
│  ● De Wolf   │  [Variáns létrehozása]            │
│  ● De Wolf   │                                   │
│    2. variáns│  LEÍRÁS ──────────────────────    │
│  ● Wolf 1999 │  Napi hőmérséklet-alapú Gauss...  │
│  ● Coakley   │                                   │
│  ● Madden    │  PARAMÉTEREK ─────────────────    │
│              │  T_opt │ σ │ RH_thr │ risk_thr    │
│              │  22.5  │ 6 │  60%   │   50        │
│              │                                   │
│  [+ Importálás forrásból]                        │
└──────────────┴───────────────────────────────────┘
```

**Modell adatstruktúra:**
```json
{
  "id": "dewolf2003",
  "name": "Fuzárium kalász-rothadás (FHB)",
  "authors": "De Wolf, Madden & Lipps",
  "year": 2003,
  "doi": "10.1094/PHYTO.2003.93.4.428",
  "disease": "Fusarium graminearum",
  "type": "gaussian",
  "builtin": true,
  "params": {
    "topt": 22.5,
    "sigma": 6,
    "rh_thr": 60,
    "precip_min": 1,
    "risk_thr": 50
  },
  "formula": "R = gauss(T, μ=22.5, σ=6) × RH_factor × precip_factor × 100"
}
```

**Backend kapcsolat:**
- `GET /api/models` — összes modell (beépített + felhasználói)
- `POST /api/models` — egyéni modell mentése
- `PUT /api/models/:id` — modell frissítése
- `DELETE /api/models/:id` — egyéni modell törlése
- `POST /api/models/:id/clone` — variáns létrehozása

**Jelenleg:** `notox-models` localStorage.
**Tervezett:** PostgreSQL `models` tábla, beépített modellek seed fájlból.

---

### 3.6 `/forecast` — Előrejelzés

**Funkció:** Helyszín + modell kiválasztás → 7+7 napos kockázati előrejelzés grafikonnal.

```
┌──────────────────────────────────────────────────┐
│  Fuzárium-kockázat előrejelzés                   │
├──────────────────────────────────────────────────┤
│  Helyszín: [Debrecen ▼]   Modell: [De Wolf ▼]   │
│  [Előrejelzés indítása]                          │
├──────────────────────────────────────────────────┤
│  Összefoglaló kártyák:                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ Max rizk │ │ Átl rizk │ │ Kritikus │         │
│  │   78     │ │   52     │ │  3 nap   │         │
│  └──────────┘ └──────────┘ └──────────┘         │
├──────────────────────────────────────────────────┤
│  [Chart.js dual-axis grafikon]                   │
│  ■ Kockázati index (bal)                         │
│  ░ Csapadék mm (jobb)  ─ Hőmérséklet (jobb)     │
│                                                  │
│  Múlt 7 nap ←│→ Előrejelzés 7 nap               │
├──────────────────────────────────────────────────┤
│  NAPI ADATOK TÁBLÁZAT                            │
│  Dátum │ Rizk │ T │ RH │ Csap │ Előrejelzés?   │
└──────────────────────────────────────────────────┘
```

**Backend kapcsolat:**
- `GET /api/forecast/run?lat=&lon=&model=dewolf2003&days=14`
  ```json
  {
    "daily": [
      { "date": "2026-05-24", "risk": 68.4, "tmean": 22.1,
        "rh_mean": 84, "precip": 5.2, "is_forecast": false }
    ],
    "summary": { "maxRisk": 78, "avgRisk": 52, "criticalDays": 3 }
  }
  ```
- `POST /api/forecast/save` — előrejelzés mentése (PDF / CSV export)

---

### 3.7 `/validation` — Validáció

**Funkció:** Terepi megfigyelések rögzítése, modell-pontosság értékelése (De Wolf 2003 módszertan).

```
┌──────────────────────────────────────────────────┐
│  Validáció                    [CSV export]       │
├──────────────────────────────────────────────────┤
│  [+ Új megfigyelés]                              │
│                                                  │
│  Koordináta: [Nominatim geocoder]                │
│  Dátum: [date picker]   Modell: [dropdown]       │
│  Kultúra: [búza/árpa/...]   Elővetemény: [...]   │
│  FHB fertőzöttség: [%]   DON: [ppb]              │
│  [Mentés → historikus időjárás lekérése]         │
├──────────────────────────────────────────────────┤
│  KONFÚZIÓS MÁTRIX          Küszöb: [30|40|50|60] │
│                                                  │
│         Valóság+  Valóság-                       │
│  Modell+  TP: 12   FP: 3                         │
│  Modell-  FN: 2    TN: 18                        │
│                                                  │
│  Pontosság: 86%  Szenzitivitás: 86%              │
│  Specificitás: 86%  AUC: 0.91                    │
├──────────────────────────────────────────────────┤
│  [Scatter plot: előrejelzett kockázat vs. valódi │
│   FHB fertőzöttség %]                            │
└──────────────────────────────────────────────────┘
```

**Megfigyelés adatstruktúra:**
```json
{
  "id": "uuid",
  "user_id": "user@org.hu",
  "date": "2026-05-15",
  "lat": 47.53, "lon": 21.63,
  "location_name": "Debrecen — Pallag",
  "crop": "búza",
  "variety_resistance": "fogékony",
  "prev_crop": "kukorica",
  "tillage": "szántás",
  "fhb_severity_pct": 18.5,
  "don_ppb": 1250,
  "method": "visual",
  "model_id": "dewolf2003",
  "predicted_risk": 72.4,
  "weather_window": { "tmean": 21.8, "rh_mean": 88, "precip": 12.3 }
}
```

**Backend kapcsolat:**
- `GET /api/validation` — saját megfigyelések listája
- `POST /api/validation` — új megfigyelés mentése
- `PUT /api/validation/:id`
- `DELETE /api/validation/:id`
- `GET /api/validation/summary?model=&threshold=50` — konfúziós mátrix számítás
- `GET /api/meteo/history?lat=&lon=&start=&end=` — historikus időjárás validációhoz

---

### 3.8 `/sources` — Forráselemzés

**Funkció:** Tudományos cikk (PDF) feltöltése → Claude AI elemzés → paraméter-kinyerés → modell-import.

```
┌──────────────────────────────────────────────────┐
│  Forráselemzés                                   │
├──────────────────────────────────────────────────┤
│  [Claude API kulcs beállítás ⚙]                 │
│                                                  │
│  ┌────────────────────────────────┐              │
│  │  📄 PDF feltöltés / szöveg     │              │
│  └────────────────────────────────┘              │
│  [Elemzés indítása]  claude-haiku-4-5            │
├──────────────────────────────────────────────────┤
│  EREDMÉNYEK                                      │
│  Metaadatok │ Betegség │ Egyéb adatok │ Modell   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ MODELL AZONOSÍTVA                         │   │
│  │ T_opt: 22.5°C │ σ: 6 │ RH_thr: 65%      │   │
│  │                                           │   │
│  │ [Importálás a modellek közé →]            │   │
│  └──────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

**Backend kapcsolat (tervezett):**
- `POST /api/sources/analyze` — PDF szöveg küldése, Claude API hívás backenden
  ```json
  { "text": "...", "model_id": "claude-haiku-4-5-20251001" }
  ```
  → visszaad: metadata, disease, model params, other_data
- **Jelenlegi:** Claude API hívás közvetlenül kliensről (API kulcs browserben)
- **Tervezett:** Backenden hívja a Claude API-t, kulcs szerveren marad

---

### 3.9 `/admin` — Admin

**Funkció:** API kulcsok, meteorológia beállítások, felhasználókezelés, rendszer.

```
┌──────────────────────────────────────────────────┐
│  Admin   [API kulcsok][Meteorológia][Felhasználók][Rendszer]
├──────────────────────────────────────────────────┤
│  Claude API kulcs:        [••••••••] [Mentés] [✓Test]
│  Open-Meteo Pro kulcs:    [••••••••] [Mentés] [✓Test]
│  Azure AD Client ID:      [input]    [Tenant ID: input]
│  Redirect URI:            http://localhost/login.html
├──────────────────────────────────────────────────┤
│  Meteorológia:                                   │
│  Batch méret: [6]  Késleltetés: [250ms]          │
│  Előrejelzési napok: [7]  Visszatekintő: [7]     │
│  Alap coords: [47.16, 19.50]  Zoom: [7]         │
├──────────────────────────────────────────────────┤
│  Felhasználók:                                   │
│  Admin e-mailek: [lista + hozzáadás]             │
│  Belépési napló: [táblázat]                      │
├──────────────────────────────────────────────────┤
│  Rendszer:                                       │
│  localStorage méret + kulcsok listája            │
│  [Export JSON] [Import] [Adatok törlése]         │
└──────────────────────────────────────────────────┘
```

**Backend kapcsolat:**
- `GET /api/admin/users` — felhasználók listája (role: admin/user)
- `PUT /api/admin/users/:id/role` — szerep módosítása
- `DELETE /api/admin/users/:id`
- `GET /api/admin/config` — rendszer konfiguráció
- `PUT /api/admin/config` — konfiguráció frissítése (API kulcsok szerveren)
- `GET /api/admin/logs` — belépési napló
- **Jogosultság:** `role: admin` JWT claim szükséges

---

## 4. Frontend → Backend architektúra

```
┌─────────────────────────────────────────────────────────────────┐
│                        BÖNGÉSZŐ (kliens)                        │
│                                                                 │
│  HTML/CSS/JS (statikus)          Külső szolgáltatások          │
│  ┌─────────────────────┐         ┌──────────────────────┐      │
│  │ shell.js (nav+auth) │         │  Open-Meteo API      │      │
│  │ fusarium.js (model) │         │  api.open-meteo.com  │      │
│  │ app.js (logic)      │         │  archive-api.o-m.com │      │
│  │ Leaflet.js (térkép) │         └──────────────────────┘      │
│  │ Chart.js (grafikon) │                                        │
│  │ MSAL.js (auth)      │         ┌──────────────────────┐      │
│  └──────────┬──────────┘         │  Anthropic Claude    │      │
│             │ fetch()            │  api.anthropic.com   │      │
│             │                   └──────────────────────┘      │
└─────────────┼───────────────────────────────────────────────────┘
              │ HTTPS + JWT Bearer token
              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (REST API)                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   API Gateway / Router                   │   │
│  │  /auth/*  /api/meteo/*  /api/models/*  /api/forecast/*  │   │
│  │  /api/validation/*  /api/sources/*  /api/admin/*        │   │
│  └──────┬──────────────────────────────────────────────────┘   │
│         │                                                       │
│  ┌──────┴──────┐  ┌─────────────┐  ┌───────────────────────┐   │
│  │ Auth Service│  │ Meteo Cache │  │   Model Engine         │   │
│  │ MSAL/JWT   │  │ Redis 1h TTL│  │   fusarium.js logika   │   │
│  │ Role check │  │             │  │   (Node.js portolás)   │   │
│  └─────────────┘  └──────┬──────┘  └──────────┬────────────┘   │
│                          │                    │                 │
│  ┌───────────────────────┴────────────────────┴──────────────┐  │
│  │                  Adatbázis (PostgreSQL)                    │  │
│  │  users │ models │ locations │ validation │ stations │ logs │  │
│  └─────────────────────────────────────────────────────────── ┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Külső API hívások (backendről)               │   │
│  │  Open-Meteo  ·  Claude Anthropic  ·  Microsoft Graph    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. REST API endpoint összefoglaló

### Auth
| Method | Endpoint | Leírás |
|---|---|---|
| POST | `/auth/login` | MSAL token csere |
| GET | `/auth/me` | Bejelentkezett user + role |
| POST | `/auth/logout` | Token érvénytelenítése |

### Meteorológia
| Method | Endpoint | Leírás |
|---|---|---|
| GET | `/api/meteo/forecast` | `?lat=&lon=&days=7&vars=...` |
| GET | `/api/meteo/history` | `?lat=&lon=&start=&end=` |
| GET | `/api/meteo/stations` | Állomáslista |
| GET | `/api/meteo/grid` | `?bbox=&resolution=0.5` hőtérkép |

### Modellek
| Method | Endpoint | Leírás |
|---|---|---|
| GET | `/api/models` | Összes modell (builtin + user) |
| POST | `/api/models` | Új egyéni modell |
| PUT | `/api/models/:id` | Modell frissítése |
| DELETE | `/api/models/:id` | Törlés (csak saját) |
| POST | `/api/models/:id/clone` | Variáns létrehozása |

### Előrejelzés
| Method | Endpoint | Leírás |
|---|---|---|
| GET | `/api/forecast/run` | `?lat=&lon=&model=&days=` |
| POST | `/api/forecast/export` | PDF / CSV generálás |

### Validáció
| Method | Endpoint | Leírás |
|---|---|---|
| GET | `/api/validation` | Saját megfigyelések |
| POST | `/api/validation` | Új megfigyelés |
| PUT | `/api/validation/:id` | Szerkesztés |
| DELETE | `/api/validation/:id` | Törlés |
| GET | `/api/validation/summary` | `?model=&threshold=` konfúziós mátrix |

### Forráselemzés
| Method | Endpoint | Leírás |
|---|---|---|
| POST | `/api/sources/analyze` | PDF szöveg → Claude API |
| POST | `/api/sources/import` | Elemzett modell mentése |

### Admin
| Method | Endpoint | Leírás | Auth |
|---|---|---|---|
| GET | `/api/admin/users` | Felhasználók | admin |
| PUT | `/api/admin/users/:id/role` | Szerep módosítás | admin |
| GET | `/api/admin/config` | Rendszer konfig | admin |
| PUT | `/api/admin/config` | Konfig frissítés | admin |

---

## 6. Adatbázis sémavázlat

```sql
-- Felhasználók
CREATE TABLE users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  name       TEXT,
  role       TEXT DEFAULT 'user',  -- 'user' | 'admin'
  created_at TIMESTAMPTZ DEFAULT now(),
  last_login TIMESTAMPTZ
);

-- Modellek (builtin = seed adatból jön)
CREATE TABLE models (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  authors    TEXT,
  year       INT,
  doi        TEXT,
  disease    TEXT,
  type       TEXT,   -- gaussian | logistic | linear
  builtin    BOOLEAN DEFAULT false,
  user_id    UUID REFERENCES users(id),
  params     JSONB,
  formula    TEXT,
  desc       TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Mentett helyszínek
CREATE TABLE locations (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  UUID REFERENCES users(id),
  name     TEXT,
  lat      NUMERIC,
  lon      NUMERIC,
  color    TEXT
);

-- Terepi megfigyelések (validáció)
CREATE TABLE validation_obs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id),
  model_id            TEXT REFERENCES models(id),
  date                DATE NOT NULL,
  lat                 NUMERIC,
  lon                 NUMERIC,
  location_name       TEXT,
  crop                TEXT,
  variety_resistance  TEXT,
  prev_crop           TEXT,
  tillage             TEXT,
  fhb_severity_pct    NUMERIC,
  don_ppb             NUMERIC,
  method              TEXT,
  predicted_risk      NUMERIC,
  weather_window      JSONB,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Saját meteorológiai állomások
CREATE TABLE stations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id),
  name       TEXT,
  lat        NUMERIC,
  lon        NUMERIC,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 7. Autentikáció flow

```
1. Felhasználó → /login oldal
2. [Microsoft fiókkal belépés] gomb → MSAL popup
3. Microsoft AAD → access_token + id_token
4. Frontend → POST /auth/login { id_token }
5. Backend validálja az id_token-t a Microsoft kulcsokkal
6. Backend kiadja saját JWT-t (role + user_id claim)
7. Frontend tárolja a JWT-t (memory / httpOnly cookie)
8. Minden API híváshoz: Authorization: Bearer <jwt>
9. Backend middleware ellenőrzi a JWT-t és a role-t
```

**Fejlesztői bypass (localhost):**
```js
localStorage.setItem("notox-dev-account", JSON.stringify({
  username: "dev@localhost",
  name: "Dev User"
}));
```

---

## 8. Jelenlegi állapot → Tervezett állapot

| Funkció | Jelenlegi | Tervezett |
|---|---|---|
| Auth | MSAL + dev bypass | MSAL + backend JWT |
| Modellek tárolása | localStorage | PostgreSQL |
| Helyszínek | localStorage | PostgreSQL |
| Validációs adatok | localStorage | PostgreSQL |
| Meteorológiai adatok | Kliens → Open-Meteo direkt | Backend cache (Redis) |
| Claude API hívás | Kliens (kulcs browserben) | Backend proxy (kulcs szerveren) |
| Export (CSV/PDF) | Kliens oldali JS | Backend generált fájl |
| Felhasználó mgmt | localStorage admin lista | DB users tábla + role |
| Rate limiting | Kliens batch + delay | Backend API gateway |

---

## 9. Tech stack javaslat (backend)

```
Runtime:    Node.js 22+ / Bun  (a fusarium.js logika könnyen portolható)
Framework:  Hono / Fastify  (lightweight, TypeScript-native)
DB:         PostgreSQL + Drizzle ORM
Cache:      Redis (meteo cache, session)
Auth:       jose (JWT) + Microsoft OIDC
AI:         Anthropic SDK (@anthropic-ai/sdk)
Deploy:     Vercel (frontend) + Railway / Fly.io (backend)
```

---

## 10. Nem funkcionális követelmények

| Követelmény | Elvárás |
|---|---|
| Válaszidő (forecast) | < 2 sec (cache-elt meteo esetén) |
| Offline működés | Dashboard + mentett adatok olvasható |
| Reszponzivitás | Desktop 1280px+ · Tablet 768px+ |
| Hozzáférhetőség | WCAG 2.1 AA (kontrast, aria-label) |
| Adatvédelem | GDPR: minimális adat, EU szerver |
| Böngésző | Chrome/Edge/Firefox utolsó 2 verzió |

---

*Dokumentum: No-tox Design Brief v1.0 · 2026-05-24*
*Generálva a Claude Code session alapján*
