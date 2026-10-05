(() => {
  function installCreatorLayoutFix() {
    let style = document.querySelector("#studybridge-creator-layout-fix");
    if (!style) {
      style = document.createElement("style");
      style.id = "studybridge-creator-layout-fix";
      document.head.appendChild(style);
    }

    style.textContent = `
      #workspacePage {
        min-height: 0 !important;
        overflow: hidden !important;
      }

      #developerPanel:not([hidden]) {
        max-height: min(34vh, 310px);
        overflow: auto;
        overscroll-behavior: contain;
        position: relative;
        z-index: 2;
        box-shadow: 0 10px 24px rgba(25, 36, 58, 0.05);
      }

      #developerPanel .admin-grid {
        align-items: start;
      }

      #developerPanel .invite-list,
      #developerPanel .user-list,
      #passwordResetList {
        max-height: 150px;
        overflow: auto;
        overscroll-behavior: contain;
      }

      #chatArea {
        min-height: 0 !important;
        border-top: 1px solid var(--line);
        padding-top: 20px !important;
      }

      #quickPrompts {
        border-top: 1px solid rgba(216, 222, 232, 0.72);
      }

      @media (max-height: 760px) {
        #developerPanel:not([hidden]) {
          max-height: 240px;
        }
      }
    `;
  }

  function loadScriptOnce(src) {
    const cleanSrc = src.split("?")[0];
    if (document.querySelector(`script[src^="${cleanSrc}"]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    document.body.appendChild(script);
  }

  installCreatorLayoutFix();
  loadScriptOnce("/school-autocomplete.js?v=20261005-1");
  loadScriptOnce("/admin-console-patch.js?v=20261005-1");
  loadScriptOnce("/profile-onboarding-patch.js?v=20261005-1");
  setInterval(installCreatorLayoutFix, 1000);
})();