(() => {
  const VERSION = "20261008-sidebar-delegator-1.0.61";
  if (window.__studybridgeSidebarDelegator === VERSION) return;
  window.__studybridgeSidebarDelegator = VERSION;

  const DIRECT_PATH = "/studybridge-direct-pages.js";
  const DIRECT_SRC = `${DIRECT_PATH}?v=${VERSION}`;

  function hasDirectScript() {
    return Array.from(document.scripts).some((script) => {
      const src = script.getAttribute("src") || "";
      try {
        return new URL(src, window.location.href).pathname === DIRECT_PATH;
      } catch {
        return src.includes(DIRECT_PATH);
      }
    });
  }

  function loadDirectPages() {
    if (window.studybridgeOpenDirectPage || hasDirectScript()) return;
    const script = document.createElement("script");
    script.async = false;
    script.src = DIRECT_SRC;
    (document.head || document.documentElement).appendChild(script);
  }

  function openRoute(route) {
    loadDirectPages();
    if (typeof window.studybridgeOpenDirectPage === "function") {
      window.studybridgeOpenDirectPage(route);
      return true;
    }
    window.setTimeout(() => window.studybridgeOpenDirectPage?.(route), 80);
    return true;
  }

  window.studybridgeDirectOpen = window.studybridgeDirectOpen || openRoute;
  window.studybridgeOpenStudentPage = window.studybridgeOpenStudentPage || openRoute;
  window.studybridgeMasterOpen = window.studybridgeMasterOpen || openRoute;

  loadDirectPages();
})();
