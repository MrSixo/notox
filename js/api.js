// No-tox API-kliens — per-user CRUD a backend felé, JWT-vel.
// Entitások: "fields" | "locations" | "models". A rekord: { id, name, data, created_at, updated_at }.
(function () {
  function base() { return (window.NOTOX_CONFIG && NOTOX_CONFIG.apiBase) || ""; }
  function token() { return localStorage.getItem("notox-token") || ""; }
  function headers() {
    return { "Content-Type": "application/json", Authorization: `Bearer ${token()}` };
  }

  // Lejárt/érvénytelen munkamenet → vissza a loginra
  function onAuthFail() {
    localStorage.removeItem("notox-token");
    localStorage.removeItem("notox-user");
    window.location.replace("/login.html");
  }

  async function list(entity) {
    const r = await fetch(`${base()}/api/${entity}`, { headers: headers() });
    if (r.status === 401) { onAuthFail(); return []; }
    if (!r.ok) throw new Error(`${entity} list: ${r.status}`);
    return r.json();
  }

  async function create(entity, name, data) {
    const r = await fetch(`${base()}/api/${entity}`, {
      method: "POST", headers: headers(), body: JSON.stringify({ name, data }),
    });
    if (r.status === 401) { onAuthFail(); return null; }
    if (!r.ok) throw new Error(`${entity} create: ${r.status}`);
    return r.json();
  }

  async function update(entity, id, name, data) {
    const r = await fetch(`${base()}/api/${entity}/${id}`, {
      method: "PUT", headers: headers(), body: JSON.stringify({ name, data }),
    });
    if (r.status === 401) { onAuthFail(); return null; }
    if (!r.ok) throw new Error(`${entity} update: ${r.status}`);
    return r.json();
  }

  async function remove(entity, id) {
    const r = await fetch(`${base()}/api/${entity}/${id}`, { method: "DELETE", headers: headers() });
    if (r.status === 401) { onAuthFail(); return false; }
    return r.ok;
  }

  window.NotoxAPI = { list, create, update, remove };
})();
