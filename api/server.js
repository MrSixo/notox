// No-tox auth + per-user API — Express (Azure App Service, F1).
const express = require("express");
const cors = require("cors");
const { getPool } = require("./src/db");
const { hashPassword, verifyPassword, genToken, signJwt, verifyJwt } = require("./src/auth");

const app = express();
app.use(express.json());
app.use(cors({ origin: [
  "https://mrsixo.github.io",
  "https://notoxdatamate.z36.web.core.windows.net",
  "http://localhost:3003",
] }));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Egészség-ellenőrzés
app.get("/", (_req, res) => res.json({ status: "ok", service: "notox-api" }));

// ── POST /api/register — regisztráció (zárt kör: pending → admin jóváhagyás) ──
app.post("/api/register", async (req, res) => {
  const email = (req.body?.email || "").trim().toLowerCase();
  const password = req.body?.password || "";
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Érvénytelen email cím" });
  if (password.length < 8) return res.status(400).json({ error: "A jelszó legalább 8 karakter legyen" });

  const pool = getPool();
  try {
    const exists = await pool.query("SELECT 1 FROM users WHERE email = $1", [email]);
    if (exists.rowCount > 0)
      return res.status(200).json({ message: "Ha az email még nem regisztrált, elküldtük a megerősítőt." });

    const hash = await hashPassword(password);
    const userRes = await pool.query(
      `INSERT INTO users (email, password_hash, status, email_verified)
       VALUES ($1, $2, 'pending', false) RETURNING id`,
      [email, hash]
    );
    const userId = userRes.rows[0].id;

    const token = genToken();
    const expires = new Date(Date.now() + 24 * 3600 * 1000);
    await pool.query(
      `INSERT INTO tokens (user_id, token, type, expires_at) VALUES ($1, $2, 'email_verify', $3)`,
      [userId, token, expires]
    );

    const verifyUrl = `${process.env.PUBLIC_BASE_URL || ""}/api/verify-email?token=${token}`;
    console.log(`[DEV] Email-megerősítő link (${email}): ${verifyUrl}`);

    return res.status(201).json({
      message: "Regisztráció sikeres. Erősítsd meg az emailed, majd várj az admin jóváhagyásra.",
    });
  } catch (err) {
    console.error("register hiba:", err);
    return res.status(500).json({ error: "Szerverhiba" });
  }
});

// ── POST /api/login — bejelentkezés (csak megerősített + jóváhagyott) ──
app.post("/api/login", async (req, res) => {
  const email = (req.body?.email || "").trim().toLowerCase();
  const password = req.body?.password || "";
  if (!EMAIL_RE.test(email) || !password)
    return res.status(400).json({ error: "Email és jelszó megadása kötelező" });

  const pool = getPool();
  try {
    const r = await pool.query(
      "SELECT id, password_hash, status, email_verified, role FROM users WHERE email = $1",
      [email]
    );
    const GENERIC = { error: "Hibás email vagy jelszó" };
    if (r.rowCount === 0) return res.status(401).json(GENERIC);

    const u = r.rows[0];
    if (!(await verifyPassword(password, u.password_hash))) return res.status(401).json(GENERIC);

    if (!u.email_verified)
      return res.status(403).json({ error: "Erősítsd meg az email-címed a bejelentkezés előtt." });
    if (u.status === "pending")
      return res.status(403).json({ error: "A fiók admin jóváhagyásra vár." });
    if (u.status !== "approved")
      return res.status(403).json({ error: "A fiók le van tiltva." });

    const token = signJwt({ sub: u.id, email, role: u.role });
    return res.status(200).json({ token, user: { email, role: u.role } });
  } catch (err) {
    console.error("login hiba:", err);
    return res.status(500).json({ error: "Szerverhiba" });
  }
});

// ── GET /api/verify-email?token=... — email-cím megerősítése ──
function verifyHtml(title, msg) {
  return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#0b0f0d;color:#e0e0e0;
display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:#141a17;border:1px solid #2a3530;border-radius:12px;padding:32px 40px;max-width:440px;text-align:center}
h1{font-size:18px;margin:0 0 12px;color:#4caf7d}p{font-size:14px;line-height:1.55;color:#a0a0a0;margin:0}</style>
</head><body><div class="card"><h1>${title}</h1><p>${msg}</p></div></body></html>`;
}

app.get("/api/verify-email", async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).type("html").send(verifyHtml("Hiányzó token", "A megerősítő link érvénytelen."));

  const pool = getPool();
  try {
    const r = await pool.query(
      `UPDATE tokens SET used = true
       WHERE token = $1 AND type = 'email_verify' AND used = false AND expires_at > now()
       RETURNING user_id`,
      [token]
    );
    if (r.rowCount === 0)
      return res.status(400).type("html").send(verifyHtml("Érvénytelen link", "A megerősítő link érvénytelen vagy lejárt. Regisztrálj újra."));

    await pool.query("UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1", [r.rows[0].user_id]);
    return res.status(200).type("html").send(verifyHtml("Email megerősítve ✓", "Köszönjük! A fiókod most admin jóváhagyásra vár."));
  } catch (err) {
    console.error("verify-email hiba:", err);
    return res.status(500).type("html").send(verifyHtml("Hiba", "Szerverhiba történt. Próbáld újra később."));
  }
});

// ── POST /api/forgot-password — reset-token kérése (generikus válasz) ──
app.post("/api/forgot-password", async (req, res) => {
  const email = (req.body?.email || "").trim().toLowerCase();
  const GENERIC = { message: "Ha az email regisztrált, elküldtük a jelszó-visszaállító linket." };
  if (!EMAIL_RE.test(email)) return res.status(200).json(GENERIC);

  const pool = getPool();
  try {
    const r = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (r.rowCount === 0) return res.status(200).json(GENERIC);

    const token = genToken();
    const expires = new Date(Date.now() + 3600 * 1000); // 1 óra
    await pool.query(
      `INSERT INTO tokens (user_id, token, type, expires_at) VALUES ($1, $2, 'password_reset', $3)`,
      [r.rows[0].id, token, expires]
    );
    const resetUrl = `${process.env.PUBLIC_BASE_URL || ""}/reset-password?token=${token}`;
    console.log(`[DEV] Jelszó-visszaállító link (${email}): ${resetUrl}`);
    return res.status(200).json(GENERIC);
  } catch (err) {
    console.error("forgot-password hiba:", err);
    return res.status(200).json(GENERIC); // hibánál is generikus
  }
});

// ── POST /api/reset-password — új jelszó tokennel ──
app.post("/api/reset-password", async (req, res) => {
  const token = req.body?.token || "";
  const password = req.body?.password || "";
  if (!token) return res.status(400).json({ error: "Hiányzó token" });
  if (password.length < 8) return res.status(400).json({ error: "A jelszó legalább 8 karakter legyen" });

  const pool = getPool();
  try {
    const r = await pool.query(
      `UPDATE tokens SET used = true
       WHERE token = $1 AND type = 'password_reset' AND used = false AND expires_at > now()
       RETURNING user_id`,
      [token]
    );
    if (r.rowCount === 0) return res.status(400).json({ error: "Érvénytelen vagy lejárt link. Kérj újat." });

    const hash = await hashPassword(password);
    await pool.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [hash, r.rows[0].user_id]);
    return res.status(200).json({ message: "A jelszó megváltozott. Most már bejelentkezhetsz." });
  } catch (err) {
    console.error("reset-password hiba:", err);
    return res.status(500).json({ error: "Szerverhiba" });
  }
});

// ── JWT-middleware: a védett endpointok a Bearer-tokenből veszik a user_id-t ──
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Bejelentkezés szükséges" });
  try {
    const payload = verifyJwt(token);
    req.userId = payload.sub;
    req.userRole = payload.role;
    next();
  } catch {
    return res.status(401).json({ error: "Érvénytelen vagy lejárt munkamenet" });
  }
}

// ── Generikus per-user CRUD egy táblára (fields / locations / models) ─────────
// Az `entity` fix, belső érték (nem user-input) → biztonságos a query-be illeszteni.
function crudRoutes(entity) {
  app.get(`/api/${entity}`, requireAuth, async (req, res) => {
    try {
      const r = await getPool().query(
        `SELECT id, name, data, created_at, updated_at FROM ${entity} WHERE user_id = $1 ORDER BY created_at`,
        [req.userId]
      );
      res.json(r.rows);
    } catch (err) { console.error(`${entity} list:`, err); res.status(500).json({ error: "Szerverhiba" }); }
  });

  app.post(`/api/${entity}`, requireAuth, async (req, res) => {
    const name = (req.body?.name || "").trim();
    const data = req.body?.data ?? {};
    if (!name) return res.status(400).json({ error: "A név kötelező" });
    try {
      const r = await getPool().query(
        `INSERT INTO ${entity} (user_id, name, data) VALUES ($1, $2, $3)
         RETURNING id, name, data, created_at, updated_at`,
        [req.userId, name, data]
      );
      res.status(201).json(r.rows[0]);
    } catch (err) { console.error(`${entity} create:`, err); res.status(500).json({ error: "Szerverhiba" }); }
  });

  app.put(`/api/${entity}/:id`, requireAuth, async (req, res) => {
    const name = (req.body?.name || "").trim();
    const data = req.body?.data ?? {};
    try {
      const r = await getPool().query(
        `UPDATE ${entity} SET name = $1, data = $2, updated_at = now()
         WHERE id = $3 AND user_id = $4 RETURNING id, name, data, created_at, updated_at`,
        [name, data, req.params.id, req.userId]
      );
      if (r.rowCount === 0) return res.status(404).json({ error: "Nem található" });
      res.json(r.rows[0]);
    } catch (err) { console.error(`${entity} update:`, err); res.status(500).json({ error: "Szerverhiba" }); }
  });

  app.delete(`/api/${entity}/:id`, requireAuth, async (req, res) => {
    try {
      const r = await getPool().query(
        `DELETE FROM ${entity} WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.userId]
      );
      if (r.rowCount === 0) return res.status(404).json({ error: "Nem található" });
      res.status(204).end();
    } catch (err) { console.error(`${entity} delete:`, err); res.status(500).json({ error: "Szerverhiba" }); }
  });
}

crudRoutes("fields");
crudRoutes("locations");
crudRoutes("models");

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`notox-api Express listening on ${port}`));
