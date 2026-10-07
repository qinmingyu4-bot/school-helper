(() => {
  const VERSION = "20261007-router-loader-8";
  if (window.__studybridgeStudentNavHardening === VERSION) return;
  window.__studybridgeStudentNavHardening = VERSION;
  if (window.__studybridgeNavigationHotfix === "20261007.8") return;

  const script = document.createElement("script");
  script.async = false;
  script.src = "/student-navigation-hotfix.js?v=20261007-8";
  document.body.appendChild(script);
})();
