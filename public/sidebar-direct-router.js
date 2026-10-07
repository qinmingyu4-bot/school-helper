(() => {
  if (window.__studybridgeSidebarDirectRouterShim) return;
  window.__studybridgeSidebarDirectRouterShim = true;
  if (window.studybridgeDirectOpenPage) return;
  const script = document.createElement("script");
  script.src = "/student-navigation-hotfix.js?v=20261007-6";
  script.async = false;
  document.body.appendChild(script);
})();
