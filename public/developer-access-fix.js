(() => {
  const VERSION = "20261008-developer-delegator-1.0.61";
  if (window.__studybridgeDeveloperDelegator === VERSION) return;
  window.__studybridgeDeveloperDelegator = VERSION;

  function open(route) {
    if (typeof window.studybridgeOpenDirectPage === "function") {
      window.studybridgeOpenDirectPage(route);
      return true;
    }
    if (typeof window.studybridgeDirectOpen === "function") {
      window.studybridgeDirectOpen(route);
      return true;
    }
    return false;
  }

  document.addEventListener("click", (event) => {
    const creator = event.target.closest?.("#creatorViewButton");
    const student = event.target.closest?.("#studentViewButton");
    if (!creator && !student) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    open(creator ? "developer" : "study");
  }, true);
})();
