(() => {
  const VERSION = "20261007-layout-stable-6";
  if (window.__studybridgeLayoutFix === VERSION) return;
  window.__studybridgeLayoutFix = VERSION;

  const RESTORE_PAGE_KEY = "studybridgeLastOpenPage";
  const SECONDARY_RESTORE_PAGES = new Set(["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"]);
  let layoutSyncFrame = 0;

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
      html.studybridge-restore-pending #workspacePage > .topbar,
      html.studybridge-restore-pending #workspacePage > #developerPanel,
      html.studybridge-restore-pending #workspacePage > #scheduleDashboard,
      html.studybridge-restore-pending #workspacePage > #chatArea,
      html.studybridge-restore-pending #workspacePage > #quickPrompts,
      html.studybridge-restore-pending #workspacePage > #chatForm {
        visibility: hidden !important;
      }
    `;
    document.head.appendChild(style);
  }

  function installLayoutStyle() {
    let style = document.querySelector("#studybridge-layout-fix");
    if (!style) {
      style = document.createElement("style");
      style.id = "studybridge-layout-fix";
      document.head.appendChild(style);
    }
    if (style.dataset.ready === VERSION) return;

    style.textContent = `
      #workspacePage {
        min-height: 0 !important;
      }

      #developerPanel:not([hidden]) {
        max-height: min(34vh, 310px);
        overflow: auto;
        overscroll-behavior: contain;
        position: relative;
        z-index: 2;
        box-shadow: 0 10px 24px rgba(25, 36, 58, 0.05);
      }

      #chatArea {
        min-height: 0 !important;
        border-top: 1px solid var(--line);
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

      body.creator-clean-mode #appShell {
        height: 100dvh !important;
        min-height: 0 !important;
        overflow: hidden !important;
      }

      body.creator-clean-mode .workspace,
      body.creator-clean-mode .sidebar {
        height: 100dvh !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior: contain !important;
      }

      body.creator-clean-mode #workspacePage {
        display: block !important;
        overflow: visible !important;
        background: #f4f6f9;
      }

      body.creator-clean-mode #developerPanel:not([hidden]) {
        display: block !important;
        max-height: none !important;
        min-height: 0 !important;
        margin: 0;
        padding: 20px 28px 44px;
        border: 0;
        box-shadow: none;
        background: #f4f6f9;
        overflow: visible !important;
        overscroll-behavior: auto !important;
      }

      body.creator-clean-mode #developerPanel .invite-list,
      body.creator-clean-mode #developerPanel .user-list,
      body.creator-clean-mode #passwordResetList {
        max-height: none !important;
        overflow: visible !important;
      }

      .study-entry,
      .community-entry,
      .classmates-entry,
      .email-helper-entry,
      .schedule-entry,
      #openStudyAreaButton,
      #openSchoolCommunityButton,
      #openClassmatesButton,
      #openEmailReplyButton,
      #openScheduleButton {
        appearance: none !important;
        display: grid !important;
        grid-template-columns: 34px minmax(0, 1fr) !important;
        align-items: center !important;
        width: 100% !important;
        min-height: 52px !important;
        max-height: none !important;
        padding: 9px 12px !important;
        gap: 10px !important;
        border: 1px solid var(--line) !important;
        border-radius: 8px !important;
        background: #fff !important;
        color: var(--navy) !important;
        text-align: left !important;
        overflow: hidden !important;
        cursor: pointer !important;
        box-shadow: 0 8px 24px rgba(25, 36, 58, 0.04) !important;
        font-family: inherit !important;
      }

      .study-entry:hover,
      .community-entry:hover,
      .classmates-entry:hover,
      .email-helper-entry:hover,
      .schedule-entry:hover,
      #openStudyAreaButton:hover,
      #openSchoolCommunityButton:hover,
      #openClassmatesButton:hover,
      #openEmailReplyButton:hover,
      #openScheduleButton:hover,
      .study-entry.active,
      .community-entry.active,
      .classmates-entry.active,
      .email-helper-entry.active,
      .schedule-entry.active,
      #openStudyAreaButton.active,
      #openSchoolCommunityButton.active,
      #openClassmatesButton.active,
      #openEmailReplyButton.active,
      #openScheduleButton.active {
        border-color: var(--green) !important;
      }

      .study-entry *,
      .community-entry *,
      .classmates-entry *,
      .email-helper-entry *,
      .schedule-entry *,
      #openStudyAreaButton *,
      #openSchoolCommunityButton *,
      #openClassmatesButton *,
      #openEmailReplyButton *,
      #openScheduleButton * {
        pointer-events: none !important;
      }

      .study-entry .small-button,
      .community-entry .small-button,
      .classmates-entry .small-button,
      .email-helper-entry .small-button,
      .schedule-entry .small-button,
      #openStudyAreaButton .small-button,
      #openSchoolCommunityButton .small-button,
      #openClassmatesButton .small-button,
      #openEmailReplyButton .small-button,
      #openScheduleButton .small-button {
        display: none !important;
      }

      .study-entry-icon,
      .community-entry-icon,
      .classmates-entry-icon,
      .email-helper-entry-icon,
      .schedule-entry-icon,
      #openStudyAreaButton > span:first-child,
      #openSchoolCommunityButton > span:first-child,
      #openClassmatesButton > span:first-child,
      #openEmailReplyButton > span:first-child,
      #openScheduleButton > span:first-child {
        display: grid !important;
        place-items: center !important;
        width: 34px !important;
        height: 34px !important;
        border-radius: 8px !important;
        background: linear-gradient(145deg, #1f3a5f, #2f7d62) !important;
        color: #fff !important;
        font-size: 15px !important;
        font-weight: 900 !important;
        line-height: 1 !important;
      }

      .study-entry > span:not(.study-entry-icon),
      .community-entry > span:not(.community-entry-icon),
      .classmates-entry > span:not(.classmates-entry-icon),
      .email-helper-entry > span:not(.email-helper-entry-icon),
      .schedule-entry > span:not(.schedule-entry-icon),
      #openStudyAreaButton > span:nth-child(2),
      #openSchoolCommunityButton > span:nth-child(2),
      #openClassmatesButton > span:nth-child(2),
      #openEmailReplyButton > span:nth-child(2),
      #openScheduleButton > span:nth-child(2) {
        display: grid !important;
        align-content: center !important;
        gap: 1px !important;
        min-width: 0 !important;
        line-height: 1.2 !important;
      }

      .study-entry strong,
      .community-entry strong,
      .classmates-entry strong,
      .email-helper-entry strong,
      .schedule-entry strong,
      #openStudyAreaButton strong,
      #openSchoolCommunityButton strong,
      #openClassmatesButton strong,
      #openEmailReplyButton strong,
      #openScheduleButton strong {
        color: var(--navy) !important;
        font-size: 14px !important;
        font-weight: 850 !important;
        line-height: 1.15 !important;
        white-space: nowrap !important;
      }

      .study-entry span span,
      .community-entry span span,
      .classmates-entry span span,
      .email-helper-entry span span,
      .schedule-entry span span,
      #openStudyAreaButton span span,
      #openSchoolCommunityButton span span,
      #openClassmatesButton span span,
      #openEmailReplyButton span span,
      #openScheduleButton span span {
        color: var(--muted) !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        line-height: 1.15 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
    `;
    style.dataset.ready = VERSION;
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
    const registry = (window.__studybridgeLoadedScripts ||= new Set());
    const key = new URL(cleanSrc, window.location.href).pathname;
    if (
      registry.has(key) ||
      Array.from(document.scripts).some((script) => {
        const scriptSrc = script.getAttribute("src");
        return scriptSrc && new URL(scriptSrc, window.location.href).pathname === key;
      })
    ) {
      registry.add(key);
      return;
    }
    registry.add(key);
    const script = document.createElement("script");
    script.async = false;
    script.src = src;
    script.addEventListener("error", () => registry.delete(key), { once: true });
    document.body.appendChild(script);
  }

  function loadSupportScripts() {
    [
      "/school-autocomplete.js?v=20261007-6",
      "/admin-console-patch.js?v=20261007-6",
      "/system-status-patch.js?v=20261007-6",
      "/admin-boundary-patch.js?v=20261007-6",
      "/profile-onboarding-patch.js?v=20261007-6",
      "/profile-onboarding-fix.js?v=20261007-6",
      "/google-auth-patch.js?v=20261007-6",
      "/profile-fields-patch.js?v=20261007-6",
      "/major-autocomplete.js?v=20261007-6",
      "/school-datalist-patch.js?v=20261007-6",
      "/us-school-library-patch.js?v=20261007-6",
      "/admin-refresh-patch.js?v=20261007-6",
      "/school-community-patch.js?v=20261007-6",
      "/classmates-patch.js?v=20261007-6",
      "/classmates-request-patch.js?v=20261007-6",
      "/classmate-chat-bubble-fix.js?v=20261007-6",
      "/classmates-performance-patch.js?v=20261007-6",
      "/email-reply-patch.js?v=20261007-6",
      "/schedule-patch.js?v=20261007-6",
      "/schedule-dashboard-patch.js?v=20261007-6",
      "/schedule-notification-patch.js?v=20261007-6",
      "/cheatsheet-mode-patch.js?v=20261007-6",
      "/student-navigation-hotfix.js?v=20261007-6"
    ].forEach(loadScriptOnce);
  }

  function syncLayoutState() {
    installLayoutStyle();
    ensureStudyEntry();
    syncCreatorCleanMode();
    syncStudySidebarPanels();
  }

  function scheduleLayoutSync() {
    if (layoutSyncFrame) return;
    layoutSyncFrame = requestAnimationFrame(() => {
      layoutSyncFrame = 0;
      syncLayoutState();
    });
  }

  installEarlyRestoreGuard();
  syncLayoutState();
  loadSupportScripts();

  const observer = new MutationObserver(scheduleLayoutSync);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "class", "style"]
  });
  setInterval(scheduleLayoutSync, 5000);
})();