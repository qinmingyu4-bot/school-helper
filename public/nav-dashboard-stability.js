(() => {
  window.__studybridgeNavDashboardStabilityDisabled = "20261008-1.0.80";

  const STYLE_ID = "studybridge-composer-layout-stability";

  function installComposerLayout() {
    let style = document.querySelector(`#${STYLE_ID}`);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }

    style.textContent = `
      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm,
      body.sb-study-mode #chatForm {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) 86px !important;
        align-items: end !important;
        gap: 10px !important;
      }

      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm.study-attachment-ready,
      body.sb-study-mode #chatForm.study-attachment-ready {
        grid-template-columns: 44px minmax(0, 1fr) 86px !important;
      }

      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm .study-attachment-button,
      body.sb-study-mode #chatForm .study-attachment-button {
        grid-column: 1 !important;
        grid-row: 1 !important;
        align-self: end !important;
        width: 44px !important;
        height: 52px !important;
      }

      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm #messageInput,
      body.sb-study-mode #chatForm #messageInput {
        grid-column: 1 !important;
        grid-row: 1 !important;
        min-width: 0 !important;
      }

      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm.study-attachment-ready #messageInput,
      body.sb-study-mode #chatForm.study-attachment-ready #messageInput {
        grid-column: 2 !important;
      }

      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm #sendButton,
      body.sb-study-mode #chatForm #sendButton {
        grid-column: 2 !important;
        grid-row: 1 !important;
        align-self: end !important;
        width: 86px !important;
        min-width: 86px !important;
        height: 52px !important;
      }

      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm.study-attachment-ready #sendButton,
      body.sb-study-mode #chatForm.study-attachment-ready #sendButton {
        grid-column: 3 !important;
      }

      body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm .study-attachment-tray,
      body.sb-study-mode #chatForm .study-attachment-tray {
        grid-column: 1 / -1 !important;
        grid-row: 2 !important;
      }

      @media (max-width: 560px) {
        body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm.study-attachment-ready,
        body.sb-study-mode #chatForm.study-attachment-ready {
          grid-template-columns: 44px minmax(0, 1fr) !important;
        }

        body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm.study-attachment-ready #sendButton,
        body.sb-study-mode #chatForm.study-attachment-ready #sendButton {
          grid-column: 1 / -1 !important;
          grid-row: 2 !important;
          width: 100% !important;
        }

        body.studybridge-app-live:not(.studybridge-secondary-page):not(.creator-clean-mode) #chatForm.study-attachment-ready .study-attachment-tray,
        body.sb-study-mode #chatForm.study-attachment-ready .study-attachment-tray {
          grid-row: 3 !important;
        }
      }
    `;
  }

  installComposerLayout();
  new MutationObserver(installComposerLayout).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
