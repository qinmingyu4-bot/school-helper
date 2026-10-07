(() => {
  const VERSION = "20261007-stable-1";
  if (window.__studybridgeSidebarDirectRouterShim === VERSION) return;
  window.__studybridgeSidebarDirectRouterShim = VERSION;
  if (window.__studybridgeStableRouter === VERSION) return;
  if (document.querySelector('script[src^="/student-stable-router.js"]')) return;
  const script = document.createElement("script");
  script.src = "/student-stable-router.js?v=20261007-stable-1";
  script.async = false;
  document.body.appendChild(script);
})();
