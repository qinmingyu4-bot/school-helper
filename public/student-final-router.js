(() => {
  if (window.__studybridgeStudentFinalRouterShim) return;
  window.__studybridgeStudentFinalRouterShim = true;

  function load(src) {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    document.body.appendChild(script);
  }

  if (window.__studybridgeNavigationHotfix !== "20261007.9") {
    load("/student-navigation-hotfix.js?v=20261007-9");
  }
  load("/student-sidebar-force-router.js?v=20261007-force-1");
})();
