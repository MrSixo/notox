// No-tox — Microsoft Azure AD konfiguráció
// Az admin.html-ben a "API kulcsok" fülön állítható be a Client ID és Tenant ID.
// A beállítások a notox-msal-config localStorage kulcsban tárolódnak.

(function () {
  // Beállítás betöltése localStorage-ból (admin-ban megadott értékek)
  let savedMsal = {};
  try { savedMsal = JSON.parse(localStorage.getItem("notox-msal-config") || "{}"); } catch {}

  window.NOTOX_CONFIG = {
    msal: {
      clientId:    savedMsal.clientId    || "AZURE_CLIENT_ID_IDE",
      authority:   savedMsal.tenantId
        ? `https://login.microsoftonline.com/${savedMsal.tenantId}`
        : "https://login.microsoftonline.com/common",
      redirectUri: window.location.origin,
    },
    scopes: ["openid", "profile", "email", "User.Read"],
  };
})();
