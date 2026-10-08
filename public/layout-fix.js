(() => {
  const VERSION = "20261007-layout-stable-lite-1.0.56";
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
      html, body {
        scroll-behavior: auto !important;
      }

      #appShell {
        min-height: 100dvh;
      }

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

      #quickPrompts {
        border-top: 1px solid rgba(216, 222, 232, 0.72);
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
      #openScheduleButton.active {
        border-color: var(--green, #2f7d62) !important;
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
      body.creator-clean-mode #chatForm {
        display: none !important;
      }
    `;
  }

  const featureEntries = [
    {
      id: "openSchoolCommunityButton",
      className: "community-entry",
      route: "community",
      icon: "\u793e",
      title: "\u793e\u533a",
      subtitle: "\u5168\u90e8\u3001\u5b66\u6821\u548c\u4e13\u4e1a\u9891\u9053"
    },
    {
      id: "openClassmatesButton",
      className: "classmates-entry",
      route: "classmates",
      icon: "\u53cb",
      title: "\u540c\u5b66",
      subtitle: "SB ID \u7533\u8bf7\u548c\u804a\u5929"
    },
    {
      id: "openEmailReplyButton",
      className: "email-helper-entry",
      route: "email",
      icon: "\u4fe1",
      title: "\u90ae\u4ef6\u52a9\u624b",
      subtitle: "\u7406\u89e3\u90ae\u4ef6\u5e76\u751f\u6210\u82f1\u6587\u56de\u590d"
    },
    {
      id: "openScheduleButton",
      className: "schedule-entry",
      route: "schedule",
      icon: "\u65f6",
      title: "\u65f6\u95f4\u8868",
      subtitle: "Deadline \u548c\u8bfe\u7a0b\u63d0\u9192"
    },
    {
      id: "openStudyAreaButton",
      className: "study-entry",
      route: "study",
      icon: "\u5b66",
      title: "\u5b66\u4e60\u533a",
      subtitle: "\u8bfe\u7a0b\u8d44\u6599\u3001AI \u5bf9\u8bdd\u548c\u590d\u4e60\u8ba1\u5212"
    }
  ];

  function sidebar() {
    return document.querySelector(".sidebar, #sidebar, .app-sidebar");
  }

  function roleSwitch() {
    return document.querySelector("#roleSwitch, .role-switch");
  }

  function entryMarkup(entry) {
    return `
      <span class="${entry.className}-icon">${entry.icon}</span>
      <span>
        <strong>${entry.title}</strong>
        <span>${entry.subtitle}</span>
      </span>
    `;
  }

  function ensureFeatureEntries() {
    const nav = sidebar();
    if (!nav) return;
    const anchor = roleSwitch();
    featureEntries.forEach((entry) => {
      let button = document.getElementById(entry.id);
      if (!button) {
        button = document.createElement("button");
        button.id = entry.id;
      }
      button.type = "button";
      button.className = entry.className;
      button.dataset.studybridgeRoute = entry.route;
      button.innerHTML = entryMarkup(entry);
      if (anchor && button.nextElementSibling !== anchor) {
        nav.insertBefore(button, anchor);
      } else if (!anchor && button.parentElement !== nav) {
        nav.appendChild(button);
      }
    });
  }

  function clearStaleHiddenState() {
    if (document.body.classList.contains("creator-clean-mode")) return;
    document.body.classList.remove("study-sidebar-hidden");
  }

  installStyle();
  ensureFeatureEntries();
  clearStaleHiddenState();

  document.addEventListener("click", (event) => {
    if (!event.target?.closest?.("#studentViewButton, #openStudyAreaButton, .study-entry")) return;
    window.setTimeout(clearStaleHiddenState, 0);
  }, true);

  window.setTimeout(ensureFeatureEntries, 100);
  window.setTimeout(ensureFeatureEntries, 800);
  window.setTimeout(clearStaleHiddenState, 100);
})();
