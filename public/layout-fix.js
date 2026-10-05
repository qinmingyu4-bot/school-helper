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

      .community-entry,
      .classmates-entry,
      .email-helper-entry,
      .schedule-entry {
        grid-template-columns: 34px minmax(0, 1fr) !important;
        min-height: 48px !important;
        padding: 9px 12px !important;
        gap: 10px !important;
        overflow: hidden !important;
        cursor: pointer !important;
      }

      .community-entry > .small-button,
      .classmates-entry > .small-button,
      .email-helper-entry > .small-button,
      .schedule-entry > .small-button {
        display: none !important;
      }

      .community-entry > span:not(.community-entry-icon),
      .classmates-entry > span:not(.classmates-entry-icon),
      .email-helper-entry > span:not(.email-helper-entry-icon),
      .schedule-entry > span:not(.schedule-entry-icon) {
        display: grid !important;
        align-content: center !important;
        gap: 2px !important;
        min-width: 0 !important;
        line-height: 1.22 !important;
        overflow: hidden !important;
      }

      .community-entry > span:not(.community-entry-icon) > strong,
      .classmates-entry > span:not(.classmates-entry-icon) > strong,
      .email-helper-entry > span:not(.email-helper-entry-icon) > strong,
      .schedule-entry > span:not(.schedule-entry-icon) > strong,
      .community-entry > span:not(.community-entry-icon) > span,
      .classmates-entry > span:not(.classmates-entry-icon) > span,
      .email-helper-entry > span:not(.email-helper-entry-icon) > span,
      .schedule-entry > span:not(.schedule-entry-icon) > span {
        min-width: 0 !important;
        max-width: 100% !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }

      .community-entry-icon,
      .classmates-entry-icon,
      .email-helper-entry-icon,
      .schedule-entry-icon {
        flex: 0 0 auto !important;
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
  loadScriptOnce("/school-datalist-patch.js?v=20261005-1");
  loadScriptOnce("/us-school-library-patch.js?v=20261005-1");
  loadScriptOnce("/admin-refresh-patch.js?v=20261005-1");
  loadScriptOnce("/school-community-patch.js?v=20261005-1");
  loadScriptOnce("/classmates-patch.js?v=20261005-1");
  loadScriptOnce("/email-reply-patch.js?v=20261005-1");
  loadScriptOnce("/schedule-patch.js?v=20261005-1");
  setInterval(installCreatorLayoutFix, 1000);
})();