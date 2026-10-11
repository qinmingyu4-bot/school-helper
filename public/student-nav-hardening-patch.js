(() => {
  const VERSION = "20261008-student-nav-delegator-1.0.61";
  if (window.__studybridgeStudentNavDelegator === VERSION) return;
  window.__studybridgeStudentNavDelegator = VERSION;

  function open(route) {
    if (typeof window.studybridgeOpenDirectPage === "function") {
      window.studybridgeOpenDirectPage(route);
      return true;
    }
    if (typeof window.studybridgeDirectOpen === "function") {
      window.studybridgeDirectOpen(route);
      return true;
    }
    const script = document.createElement("script");
    script.async = false;
    script.src = `/studybridge-direct-pages.js?v=${VERSION}`;
    script.addEventListener("load", () => window.studybridgeOpenDirectPage?.(route), { once: true });
    (document.head || document.documentElement).appendChild(script);
    return true;
  }

  window.studybridgeOpenStudentPage = open;
})();
