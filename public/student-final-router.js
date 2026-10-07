(() => {
  if (window.__studybridgeStudentFinalRouterShim) return;
  window.__studybridgeStudentFinalRouterShim = true;
  if (window.studybridgeDirectOpenPage) return;
  const script = document.createElement("script");
  script.src = "/student-navigation-hotfix.js?v=20261007-8";
  script.async = false;
  document.body.appendChild(script);
})();
