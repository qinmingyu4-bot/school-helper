(() => {
  const VERSION = "20261007-router-loader-2";
  if (window.__studybridgeRouterLoader === VERSION) return;
  window.__studybridgeRouterLoader = VERSION;

  const ROUTER_PATH = "/sidebar-direct-router.js";
  const ROUTER_SRC = `${ROUTER_PATH}?v=20261007-main-router-5`;

  function hasRouterScript() {
    return Array.from(document.scripts).some((script) => {
      const src = script.getAttribute("src") || "";
      try {
        return new URL(src, window.location.href).pathname === ROUTER_PATH;
      } catch {
        return src.includes(ROUTER_PATH);
      }
    });
  }

  function loadRouter() {
    if (hasRouterScript() || window.studybridgeDirectOpen) return;
    const script = document.createElement("script");
    script.async = false;
    script.src = ROUTER_SRC;
    document.body.appendChild(script);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadRouter, { once: true });
  } else {
    loadRouter();
  }
})();
