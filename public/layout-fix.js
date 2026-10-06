(() => {
  const RESTORE_PAGE_KEY = "studybridgeLastOpenPage";
  const SECONDARY_RESTORE_PAGES = new Set(["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"]);

  function installEarlyRestoreGuard() {
    let targetPage = "";
    try {
      targetPage = localStorage.getItem(RESTORE_PAGE_KEY) || "";
    } catch {
      targetPage = "";
    }
    if (!SECONDARY_RESTORE_PAGES.has(targetPage)) return;
    document.documentElement.classList.add("studybridge-restore-pending");
    if (document.querySelector("#studybridge-restore-shield-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-restore-shield-style";
    style.textContent = `
      html.studybridge-restore-pending #workspacePage {
        visibility: hidden !important;
      }
    `;
    document.head.appendChild(style);
  }

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

      body.study-sidebar-hidden:not(.creator-clean-mode) .sidebar > .panel {
        display: none !important;
      }

      body.creator-clean-mode #workspacePage {
        display: block !important;
        overflow: visible !important;
        background: #f4f6f9;
      }

      body.creator-clean-mode #appShell {
        height: 100vh !important;
        min-height: 0 !important;
        overflow: hidden !important;
      }

      body.creator-clean-mode .workspace {
        height: 100vh !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior: contain !important;
        scroll-behavior: auto !important;
      }

      body.creator-clean-mode .sidebar {
        height: 100vh !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior: contain !important;
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
        overflow: visible !important;
        overscroll-behavior: auto !important;
      }

      body.creator-clean-mode #developerPanel .panel-title,
      body.creator-clean-mode #developerPanel .invite-form,
      body.creator-clean-mode #developerPanel .admin-grid {
        max-width: 1120px;
      }

      body.creator-clean-mode #developerPanel .invite-list,
      body.creator-clean-mode #developerPanel .user-list,
      body.creator-clean-mode #passwordResetList {
        max-height: none !important;
        overflow: visible !important;
        overscroll-behavior: auto !important;
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

      #openStudyAreaButton,
      #openSchoolCommunityButton,
      #openClassmatesButton,
      #openEmailReplyButton,
      #openScheduleButton {
        display: grid !important;
        grid-template-columns: 34px minmax(0, 1fr) !important;
        min-height: 48px !important;
        max-height: 54px !important;
        align-items: center !important;
        overflow: hidden !important;
      }

      .study-entry:hover,
      .community-entry:hover,
      .classmates-entry:hover,
      .email-helper-entry:hover,
      .schedule-entry:hover {
        border-color: var(--green) !important;
      }

      .community-entry .small-button,
      .classmates-entry .small-button,
      .email-helper-entry .small-button,
      .schedule-entry .small-button,
      .study-entry .small-button,
      .community-entry button:not(.community-entry),
      .classmates-entry button:not(.classmates-entry),
      .email-helper-entry button:not(.email-helper-entry),
      .schedule-entry button:not(.schedule-entry),
      .study-entry button:not(.study-entry) {
        display: none !important;
      }

      #openStudyAreaButton .small-button,
      #openSchoolCommunityButton .small-button,
      #openClassmatesButton .small-button,
      #openEmailReplyButton .small-button,
      #openScheduleButton .small-button,
      #openStudyAreaButton > :nth-child(n + 3),
      #openSchoolCommunityButton > :nth-child(n + 3),
      #openClassmatesButton > :nth-child(n + 3),
      #openEmailReplyButton > :nth-child(n + 3),
      #openScheduleButton > :nth-child(n + 3) {
        display: none !important;
      }

      .study-entry *,
      .community-entry *,
      .classmates-entry *,
      .email-helper-entry *,
      .schedule-entry * {
        pointer-events: none !important;
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

  function cleanFeatureEntries() {
    ["#openStudyAreaButton", "#openSchoolCommunityButton", "#openClassmatesButton", "#openEmailReplyButton", "#openScheduleButton"].forEach((selector) => {
      const entry = document.querySelector(selector);
      if (!entry) return;
      entry.querySelectorAll(".small-button").forEach((control) => control.remove());
      Array.from(entry.children)
        .slice(2)
        .forEach((child) => child.remove());
    });
  }

  function syncCreatorCleanMode() {
    const developerPanel = document.querySelector("#developerPanel");
    document.body.classList.toggle("creator-clean-mode", Boolean(developerPanel && !developerPanel.hidden));
  }

  function syncStudySidebarPanels() {
    const workspacePage = document.querySelector("#workspacePage");
    const appShell = document.querySelector("#appShell");
    const developerPanel = document.querySelector("#developerPanel");
    const secondaryPageOpen = ["#profilePage", "#schoolCommunityPage", "#classmatesPage", "#emailReplyPage", "#schedulePage"].some((selector) => {
      const page = document.querySelector(selector);
      return Boolean(page && !page.hidden);
    });
    const inStudyArea = Boolean(
      appShell &&
        !appShell.hidden &&
        workspacePage &&
        !workspacePage.hidden &&
        !secondaryPageOpen &&
        !(developerPanel && !developerPanel.hidden)
    );
    document.body.classList.toggle("study-sidebar-hidden", !inStudyArea);
  }

  function loadScriptOnce(src) {
    const cleanSrc = src.split("?")[0];
    if (document.querySelector(`script[src^="${cleanSrc}"]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    document.body.appendChild(script);
  }

  installEarlyRestoreGuard();
  installCreatorLayoutFix();
  ensureStudyEntry();
  cleanFeatureEntries();
  syncCreatorCleanMode();
  syncStudySidebarPanels();
  loadScriptOnce("/school-autocomplete.js?v=20261005-1");
  loadScriptOnce("/admin-console-patch.js?v=20261005-1");
  loadScriptOnce("/system-status-patch.js?v=20261006-1");
  loadScriptOnce("/admin-boundary-patch.js?v=20261006-1");
  loadScriptOnce("/profile-onboarding-patch.js?v=20261005-1");
  loadScriptOnce("/profile-onboarding-fix.js?v=20261005-1");
  loadScriptOnce("/google-auth-patch.js?v=20261005-1");
  loadScriptOnce("/profile-fields-patch.js?v=20261005-3");
  loadScriptOnce("/major-autocomplete.js?v=20261005-1");
  loadScriptOnce("/school-datalist-patch.js?v=20261005-1");
  loadScriptOnce("/us-school-library-patch.js?v=20261005-1");
  loadScriptOnce("/admin-refresh-patch.js?v=20261005-1");
  loadScriptOnce("/school-community-patch.js?v=20261005-3");
  loadScriptOnce("/classmates-patch.js?v=20261005-2");
  loadScriptOnce("/classmates-request-patch.js?v=20261005-5");
  loadScriptOnce("/classmate-chat-bubble-fix.js?v=20261005-2");
  loadScriptOnce("/chat-bubble-compact-live.js?v=20261005-1");
  loadScriptOnce("/email-reply-patch.js?v=20261005-1");
  loadScriptOnce("/schedule-patch.js?v=20261005-3");
  loadScriptOnce("/schedule-dashboard-patch.js?v=20261005-1");
  loadScriptOnce("/schedule-notification-patch.js?v=20261005-2");
  loadScriptOnce("/page-restore-patch.js?v=20261006-2");
  setInterval(() => {
    installCreatorLayoutFix();
    ensureStudyEntry();
    cleanFeatureEntries();
    syncCreatorCleanMode();
    syncStudySidebarPanels();
  }, 1000);
})();
