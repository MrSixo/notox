// No-tox Audit Log — megosztott naplózó utility
// Minden releváns eseményt localStorage-ba ment (max 500 bejegyzés).

const AUDIT_KEY = "notox-audit-log";
const AUDIT_MAX = 500;

/**
 * Audit bejegyzés hozzáadása.
 * @param {string} action  — rövid eseménynév, pl. "model_run", "field_save"
 * @param {string} detail  — részletes leírás
 */
function auditLog(action, detail = "") {
  try {
    const log = JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]");
    log.unshift({
      ts:     new Date().toISOString(),
      action,
      detail: String(detail).slice(0, 300),
    });
    if (log.length > AUDIT_MAX) log.length = AUDIT_MAX;
    localStorage.setItem(AUDIT_KEY, JSON.stringify(log));
  } catch {}
}

/**
 * Az összes bejegyzés lekérése (legfrissebb először).
 * @returns {Array<{ts, action, detail}>}
 */
function auditGetAll() {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]"); } catch { return []; }
}

/**
 * Napló törlése.
 */
function auditClear() {
  localStorage.removeItem(AUDIT_KEY);
}
