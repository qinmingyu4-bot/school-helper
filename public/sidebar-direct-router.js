(() => {
  const VERSION = "20261007-router-bridge-1";
  if (window.__studybridgeSidebarDirectRouter === VERSION) return;
  window.__studybridgeSidebarDirectRouter = VERSION;

  const CORE_PATH = "/student-core-router.js";
  const CORE_SRC = `${CORE_PATH}?v=20261007-19`;

  function hasCoreRouter() {
    if (window.studybridgeOpenCorePage || window.studybridgeOpenStudentPage) return true;
    return Array.from(document.scripts).some((script) => {
      const src = script.getAttribute("src") || "";
      try {
        return new URL(src, window.location.href).pathname === CORE_PATH;
      } catch {
        return src.includes(CORE_PATH);
      }
    });
  }

  function loadCoreRouter() {
    if (hasCoreRouter()) return;
    const script = document.createElement("script");
    script.async = false;
    script.src = CORE_SRC;
    document.body.appendChild(script);
  }

  function openPage(pageId) {
    loadCoreRouter();
    const start = Date.now();
    const timer = setInterval(() => {
      if (window.studybridgeOpenStudentPage) {
        clearInterval(timer);
        window.studybridgeOpenStudentPage(pageId);
      } else if (Date.now() - start > 3000) {
        clearInterval(timer);
      }
    }, 50);
  }

  window.studybridgeDirectOpen = (pageId) => openPage(pageId);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadCoreRouter, { once: true });
  } else {
    loadCoreRouter();
  }
})();
