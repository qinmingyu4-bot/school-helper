(() => {
  const VERSION = "20261007-16";
  if (window.__studybridgeSidebarDirectRouterShim === VERSION) return;
  window.__studybridgeSidebarDirectRouterShim = VERSION;
  if (window.__studybridgeStudentCoreRouter === VERSION) return;
  if (document.querySelector('script[src^="/student-core-router.js"]')) return;
  const script = document.createElement("script");
  script.src = "/student-core-router.js?v=20261007-16";
  script.async = false;
  document.body.appendChild(script);
})();
