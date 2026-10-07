(() => {
  const VERSION = "20261007-sidebar-loader-3";
  if (window.__studybridgeSidebarDirectRouter === VERSION) return;
  window.__studybridgeSidebarDirectRouter = VERSION;

  function loadStableRouter() {
    if (window.studybridgeNavigationHotfixOpen) return;
    const src = "/student-navigation-hotfix.js?v=20261007-3";
    const path = new URL(src.split("?")[0], location.href).pathname;
    const exists = Array.from(document.scripts).some((script) => {
      const value = script.getAttribute("src");
      return value && new URL(value, location.href).pathname === path;
    });
    if (exists) return;
    const script = document.createElement("script");
    script.async = false;
    script.src = src;
    document.body.appendChild(script);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadStableRouter, { once: true });
  else loadStableRouter();
})();
