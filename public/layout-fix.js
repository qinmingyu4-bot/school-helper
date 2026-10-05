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

      body.creator-clean-mode .profile-entry,
      body.creator-clean-mode .study-entry,
      body.creator-clean-mode .community-entry,
      body.creator-clean-mode .classmates-entry,
      body.creator-clean-mode .email-helper-entry,
      body.creator-clean-mode .schedule-entry,
      body.creator-clean-mode .sidebar > .panel,
      body.creator-clean-mode #workspacePage > .topbar,
      body.creator-clean-mode #scheduleDashboard,
      body.creator-clean-mode #chatArea,
      body.creator-clean-mode #quickPrompts,
      body.creator-clean-mode #chatForm {
        display: none !important;
      }

      body.creator-clean-mode #workspacePage {
        display: block !important;
        overflow: auto !important;
        background: #f4f6f9;
      }

      body.creator-clean-mode #developerPanel:not([hidden]) {
        display: block !important;
        max-height: none !important;
        min-height: calc(100vh - 24px);
        margin: 0;
        padding: 28px;
        border: 0;
        box-shadow: none;
        background: #f4f6f9;
      }

      body.creator-clean-mode #developerPanel .panel-title,
      body.creator-clean-mode #developerPanel .invite-form,
      body.creator-clean-mode #developerPanel .admin-grid {
        max-width: 1120px;
      }

      body.creator-clean-mode #developerPanel .invite-list,
      body.creator-clean-mode #developerPanel .user-list,
      body.creator-clean-mode #passwordResetList {
        max-height: 54vh;
      }

      .study-entry,
      .community-entry,
      .classmates-entry,
      .email-helper-entry,
      .schedule-entry {
        display: grid !important;
        grid-template-columns: 34px minmax(0, 1fr) !important;
        align-items: center !important;
        width: 100% !important;
        min-height: 48px !important;
        padding: 9px 12px !important;
        gap: 10px !important;
        border: 1px solid var(--line) !important;
        border-radius: 8px !important;
        background: white !important;
        color: var(--navy) !important;
        text-align: left !important;
        overflow: hidden !important;
        cursor: pointer !important;
        box-shadow: 0 8px 24px rgba(25, 36, 58, 0.04) !important;
      }

      .study-entry:hover,
      .community-entry:hover,
      .classmates-entry:hover,
      .email-helper-entry:hover,
      .schedule-entry:hover {
        border-color: var(--green) !important;
      }

      .community-entry > .small-button,
      .classmates-entry > .small-button,
      .email-helper-entry > .small-button,
      .schedule-entry > .small-button {
        display: none !important;
      }

      .study-entry > span:not(.study-entry-icon),
      .community-entry > span:not(.community-entry-icon),
      .classmates-entry > span:not(.classmates-entry-icon),
      .email-helper-entry > span:not(.email-helper-entry-icon),
      .schedule-entry > span:not(.schedule-entry-icon) {
        display: grid !important;
        align-content: center !important;
        gap: 1px !important;
        min-width: 0 !important;
        line-height: 1.2 !important;
        overflow: hidden !important;
      }

      .study-entry > span:not(.study-entry-icon) > strong,
      .community-entry > span:not(.community-entry-icon) > strong,
      .classmates-entry > span:not(.classmates-entry-icon) > strong,
      .email-helper-entry > span:not(.email-helper-entry-icon) > strong,
      .schedule-entry > span:not(.schedule-entry-icon) > strong,
      .study-entry > span:not(.study-entry-icon) > span,
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

      .study-entry > span:not(.study-entry-icon) > strong,
      .community-entry > span:not(.community-entry-icon) > strong,
      .classmates-entry > span:not(.classmates-entry-icon) > strong,
      .email-helper-entry > span:not(.email-helper-entry-icon) > strong,
      .schedule-entry > span:not(.schedule-entry-icon) > strong {
        color: var(--navy) !important;
        font-size: 14px !important;
        font-weight: 850 !important;
        line-height: 1.15 !important;
      }

      .study-entry > span:not(.study-entry-icon) > span,
      .community-entry > span:not(.community-entry-icon) > span,
      .classmates-entry > span:not(.classmates-entry-icon) > span,
      .email-helper-entry > span:not(.email-helper-entry-icon) > span,
      .schedule-entry > span:not(.schedule-entry-icon) > span {
        color: var(--muted) !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        line-height: 1.15 !important;
      }

      .study-entry-icon,
      .community-entry-icon,
      .classmates-entry-icon,
      .email-helper-entry-icon,
      .schedule-entry-icon {
        display: grid !important;
        place-items: center !important;
        width: 34px !important;
        height: 34px !important;
        border-radius: 8px !important;
        flex: 0 0 auto !important;
        background: linear-gradient(145deg, #1f3a5f, #2f7d62) !important;
        color: white !important;
        font-weight: 900 !important;
      }

      @media (max-height: 760px) {
        #developerPanel:not([hidden]) {
          max-height: 240px;
        }
      }
    `;
  }

  function ensureStudyEntry() {
    if (document.querySelector("#openStudyAreaButton")) return;
    const profile = document.querySelector("#openProfilePageButton");
    if (!profile) return;
    const button = document.createElement("button");
    button.id = "openStudyAreaButton";
    button.type = "button";
    button.className = "study-entry";
    button.innerHTML = `
      <span class="study-entry-icon">学</span>
      <span><strong>学习区</strong><span>课程资料、AI 对话和复习计划</span></span>
    `;
    const firstFeature = document.querySelector("#openSchoolCommunityButton") || profile.nextElementSibling;
    if (firstFeature && firstFeature !== button) firstFeature.insertAdjacentElement("beforebegin", button);
    else profile.insertAdjacentElement("afterend", button);
    button.addEventListener("click", () => {
      ["#profilePage", "#schoolCommunityPage", "#classmatesPage", "#emailReplyPage", "#schedulePage"].forEach((selector) => {
        const element = document.querySelector(selector);
        if (element) element.hidden = true;
      });
      const workspacePage = document.querySelector("#workspacePage");
      if (workspacePage) workspacePage.hidden = false;
      const chatArea = document.querySelector("#chatArea");
      if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
    });
  }

  function syncCreatorCleanMode() {
    const developerPanel = document.querySelector("#developerPanel");
    document.body.classList.toggle("creator-clean-mode", Boolean(developerPanel && !developerPanel.hidden));
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
  ensureStudyEntry();
  syncCreatorCleanMode();
  loadScriptOnce("/school-autocomplete.js?v=20261005-1");
  loadScriptOnce("/admin-console-patch.js?v=20261005-1");
  loadScriptOnce("/profile-onboarding-patch.js?v=20261005-1");
  loadScriptOnce("/profile-fields-patch.js?v=20261005-1");
  loadScriptOnce("/major-autocomplete.js?v=20261005-1");
  loadScriptOnce("/school-datalist-patch.js?v=20261005-1");
  loadScriptOnce("/us-school-library-patch.js?v=20261005-1");
  loadScriptOnce("/admin-refresh-patch.js?v=20261005-1");
  loadScriptOnce("/school-community-patch.js?v=20261005-3");
  loadScriptOnce("/classmates-patch.js?v=20261005-2");
  loadScriptOnce("/email-reply-patch.js?v=20261005-1");
  loadScriptOnce("/schedule-patch.js?v=20261005-3");
  loadScriptOnce("/schedule-dashboard-patch.js?v=20261005-1");
  loadScriptOnce("/schedule-notification-patch.js?v=20261005-2");
  loadScriptOnce("/page-restore-patch.js?v=20261005-1");
  setInterval(() => {
    installCreatorLayoutFix();
    ensureStudyEntry();
    syncCreatorCleanMode();
  }, 1000);
})();
