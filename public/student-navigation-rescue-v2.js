(() => {
  const VERSION = "20261007-rescue-delegated-1.0.55";
  if (window.__studybridgeNavigationRescueV2 === VERSION) return;
  window.__studybridgeNavigationRescueV2 = VERSION;

  const ROUTER_PATH = "/sidebar-direct-router.js";
  const ROUTER_SRC = `${ROUTER_PATH}?v=20261007-clean-router-1.0.55`;

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
    if (window.studybridgeDirectOpen || hasRouterScript()) return;
    const script = document.createElement("script");
    script.async = false;
    script.src = ROUTER_SRC;
    document.body.appendChild(script);
  }

  window.studybridgeNavigationRescueOpen = (route) => {
    if (typeof window.studybridgeDirectOpen === "function") return window.studybridgeDirectOpen(route);
    loadRouter();
    window.setTimeout(() => window.studybridgeDirectOpen?.(route), 50);
    return true;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadRouter, { once: true });
  } else {
    loadRouter();
  }
})();
