(() => {
  const VERSION = "20261007-admin-scroll-lite-1.0.55";
  if (window.__studybridgeAdminScrollFix === VERSION) return;
  window.__studybridgeAdminScrollFix = VERSION;

  let style = document.querySelector("#studybridge-admin-scroll-fix");
  if (!style) {
    style = document.createElement("style");
    style.id = "studybridge-admin-scroll-fix";
    document.head.appendChild(style);
  }
  style.textContent = `
    body.creator-clean-mode #workspacePage.workspace,
    body.creator-clean-mode .workspace#workspacePage {
      display: block !important;
      min-height: 100dvh !important;
      height: auto !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      overscroll-behavior: contain !important;
      scroll-behavior: auto !important;
      padding-bottom: 96px !important;
    }

    body.creator-clean-mode #developerPanel:not([hidden]) {
      display: block !important;
      max-height: none !important;
      overflow: visible !important;
      padding-bottom: 96px !important;
    }

    body.creator-clean-mode #developerPanel:not([hidden]) > *:last-child {
      margin-bottom: 48px !important;
    }
  `;
})();
