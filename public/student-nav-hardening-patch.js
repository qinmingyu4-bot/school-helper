(() => {
  const VERSION = "20261007-router-loader-6";
  if (window.__studybridgeStudentNavHardening === VERSION) return;
  window.__studybridgeStudentNavHardening = VERSION;
  if (window.studybridgeDirectOpenPage) return;

  const script = document.createElement("script");
  script.async = false;
  script.src = "/student-navigation-hotfix.js?v=20261007-6";
  document.body.appendChild(script);
})();
