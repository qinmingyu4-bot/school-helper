(() => {
  const VERSION = "20261007-nav-hardening-2";
  if (window.__studybridgeStudentNavHardening === VERSION) return;
  window.__studybridgeStudentNavHardening = VERSION;

  function loadStableRouter() {
    if (window.studybridgeNavigationHotfixOpen) return;
    const src = "/sidebar-direct-router.js?v=20261007-nav-hardening-2";
    const exists = Array.from(document.scripts).some((script) => script.getAttribute("src") === src);
    if (exists) return;
    const script = document.createElement("script");
    script.async = false;
    script.src = src;
    document.body.appendChild(script);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadStableRouter, { once: true });
  else loadStableRouter();
})();
