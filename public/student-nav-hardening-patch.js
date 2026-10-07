(() => {
  const VERSION = "20261007-router-loader-1";
  if (window.__studybridgeStudentNavHardening === VERSION) return;
  window.__studybridgeStudentNavHardening = VERSION;
  if (window.__studybridgeSidebarRouter) return;

  const script = document.createElement("script");
  script.async = false;
  script.src = "/sidebar-direct-router.js?v=20261007-final-router-1";
  document.body.appendChild(script);
})();
