(() => {
  const VERSION = "20261007-developer-access-lite-1.0.55";
  if (window.__studybridgeDeveloperAccessFix === VERSION) return;
  window.__studybridgeDeveloperAccessFix = VERSION;

  function openRoute(route) {
    if (typeof window.studybridgeDirectOpen === "function") return window.studybridgeDirectOpen(route);
    return false;
  }

  function bind() {
    const creatorButton = document.querySelector("#creatorViewButton");
    const studentButton = document.querySelector("#studentViewButton");

    if (creatorButton && creatorButton.dataset.developerAccessLite !== "true") {
      creatorButton.dataset.developerAccessLite = "true";
      creatorButton.addEventListener("click", (event) => {
        event.preventDefault();
        openRoute("developer");
      }, true);
    }

    if (studentButton && studentButton.dataset.developerAccessLite !== "true") {
      studentButton.dataset.developerAccessLite = "true";
      studentButton.addEventListener("click", (event) => {
        event.preventDefault();
        openRoute("study");
      }, true);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();
