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

  installCreatorLayoutFix();
  setInterval(installCreatorLayoutFix, 1000);
})();
