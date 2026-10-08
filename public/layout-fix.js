(() => {
  const VERSION = "20261007-layout-stable-lite-1.0.55";
  if (window.__studybridgeLayoutFix === VERSION) return;
  window.__studybridgeLayoutFix = VERSION;

  function installStyle() {
    let style = document.querySelector("#studybridge-layout-fix");
    if (!style) {
      style = document.createElement("style");
      style.id = "studybridge-layout-fix";
      document.head.appendChild(style);
    }
    style.textContent = `
      html, body { scroll-behavior: auto !important; }
      #appShell { min-height: 100dvh; }
      .sidebar, #sidebar, .app-sidebar {
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior: contain !important;
        scroll-behavior: auto !important;
        -webkit-overflow-scrolling: touch;
      }
      #workspacePage, .workspace {
        min-height: 100dvh;
        overflow-x: hidden;
      }
      #developerPanel:not([hidden]),
      #profilePage:not([hidden]),
      #schoolCommunityPage:not([hidden]),
      #classmatesPage:not([hidden]),
      #emailReplyPage:not([hidden]),
      #schedulePage:not([hidden]) {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      #chatArea {
        min-height: 0 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior-y: contain !important;
        -webkit-overflow-scrolling: touch;
      }
      #quickPrompts { border-top: 1px solid rgba(216, 222, 232, 0.72); }
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
        padding: 9px 12px !important;
        gap: 10px !important;
        border: 1px solid var(--line, #d7e0ec) !important;
        border-radius: 8px !important;
        background: #fff !important;
        color: var(--navy, #0b2344) !important;
        text-align: left !important;
        overflow: hidden !important;
        cursor: pointer !important;
        font-family: inherit !important;
        box-shadow: 0 8px 24px rgba(25, 36, 58, 0.04) !important;
      }
      .study-entry:hover,
      .community-entry:hover,
      .classmates-entry:hover,
      .email-helper-entry:hover,
      .schedule-entry:hover,
      .study-entry.active,
      .community-entry.active,
      .classmates-entry.active,
      .email-helper-entry.active,
      .schedule-entry.active,
      #openStudyAreaButton:hover,
      #openSchoolCommunityButton:hover,
      #openClassmatesButton:hover,
      #openEmailReplyButton:hover,
      #openScheduleButton:hover,
      #openStudyAreaButton.active,
      #openSchoolCommunityButton.active,
      #openClassmatesButton.active,
      #openEmailReplyButton.active,
      #openScheduleButton.active { border-color: var(--green, #2f7d62) !important; }
      .study-entry .small-button,
      .community-entry .small-button,
      .classmates-entry .small-button,
      .email-helper-entry .small-button,
      .schedule-entry .small-button,
      #openStudyAreaButton .small-button,
      #openSchoolCommunityButton .small-button,
      #openClassmatesButton .small-button,
      #openEmailReplyButton .small-button,
      #openScheduleButton .small-button { display: none !important; }
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
        color: var(--navy, #0b2344) !important;
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
        color: var(--muted, #52617a) !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        line-height: 1.15 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
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
      body.creator-clean-mode #chatForm { display: none !important; }
    `;
  }

  installStyle();
})();
