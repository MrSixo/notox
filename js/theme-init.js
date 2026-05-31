// Téma-előtöltő — FOUC megelőzésére
// Minden oldal <head>-jében töltjük be (render-blocking), hogy a téma
// azonnal felkerüljön az <html> elemre, mielőtt bármi renderelődne.
(function () {
  try {
    var t = localStorage.getItem("notox-theme") || "dark";
    document.documentElement.classList.add("theme-" + t);
    // Elrejti az oldalt amíg a shell be nem tölt (villogás ellen)
    var path = window.location.pathname;
    var pub = ["/login.html", "/login"];
    var isPublic = pub.some(function (p) { return path === p || path.endsWith(p); });
    if (!isPublic) {
      document.documentElement.style.visibility = "hidden";
    }
  } catch (e) {}
})();
