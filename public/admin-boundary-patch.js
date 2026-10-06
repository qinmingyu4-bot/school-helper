(() => {
  const ADMIN_SCOPE_ID = "adminScopeNotice";
  const STUDENT_PAGE_IDS = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];

  const text = {
    title: "\u5f00\u53d1\u8005\u7aef\u8303\u56f4",
    body: "\u8fd9\u91cc\u53ea\u4fdd\u7559\u76d1\u7ba1\u3001\u9080\u8bf7\u7801\u3001\u7528\u6237\u3001\u6570\u636e\u6982\u89c8\u3001\u91cd\u7f6e\u5bc6\u7801\u548c\u7cfb\u7edf\u72b6\u6001\u3002\u666e\u901a\u5b66\u751f\u7684\u5b66\u4e60\u533a\u3001\u793e\u533a\u3001\u540c\u5b66\u3001\u90ae\u4ef6\u52a9\u624b\u548c\u65f6\u95f4\u8868\u529f\u80fd\u5df2\u653e\u56de\u666e\u901a\u7528\u6237\u7aef\u3002",
    badge: "\u540e\u53f0\u63a7\u5236\u53f0",
    blocked: "\u5f00\u53d1\u8005\u7aef\u4e0d\u6253\u5f00\u5b66\u751f\u529f\u80fd\uff0c\u8bf7\u5148\u5207\u56de\u666e\u901a\u7528\u6237\u7aef\u3002"
  };

  function installStyle() {
    if (document.querySelector("#studybridge-admin-boundary-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-admin-boundary-style";
    style.textContent = `
      body.admin-boundary-active #profileCard,
      body.admin-boundary-active #openProfilePageButton,
      body.admin-boundary-active #openStudyAreaButton,
      body.admin-boundary-active #openSchoolCommunityButton,
      body.admin-boundary-active #openClassmatesButton,
      body.admin-boundary-active #openEmailReplyButton,
      body.admin-boundary-active #openScheduleButton,
      body.admin-boundary-active #profilePage,
      body.admin-boundary-active #schoolCommunityPage,
      body.admin-boundary-active #classmatesPage,
      body.admin-boundary-active #emailReplyPage,
      body.admin-boundary-active #schedulePage,
      body.admin-boundary-active .profile-card,
      body.admin-boundary-active .feature-entry,
      body.admin-boundary-active .community-entry,
      body.admin-boundary-active .classmates-entry,
      body.admin-boundary-active .email-helper-entry,
      body.admin-boundary-active .schedule-entry,
      body.admin-boundary-active .study-entry,
      body.creator-clean-mode #profileCard,
      body.creator-clean-mode #openProfilePageButton,
      body.creator-clean-mode #openStudyAreaButton,
      body.creator-clean-mode #openSchoolCommunityButton,
      body.creator-clean-mode #openClassmatesButton,
      body.creator-clean-mode #openEmailReplyButton,
      body.creator-clean-mode #openScheduleButton,
      body.creator-clean-mode #emailReplyPage,
      body.creator-clean-mode .profile-card,
      body.creator-clean-mode .feature-entry,
      body.creator-clean-mode .community-entry,
      body.creator-clean-mode .classmates-entry,
      body.creator-clean-mode .email-helper-entry,
      body.creator-clean-mode .schedule-entry,
      body.creator-clean-mode .study-entry {
        display: none !important;
      }

      body.creator-clean-mode .sidebar {
        background: #ffffff;
      }

      body.creator-clean-mode #roleSwitch {
        margin-top: 14px;
      }

      body.creator-clean-mode #workspacePage {
        grid-column: 2;
      }

      .admin-scope-notice {
        display: grid;
        gap: 8px;
        max-width: 1120px;
        margin: 0 0 18px;
        padding: 14px 16px;
        border: 1px solid #cbd8ea;
        border-radius: 8px;
        background: #fff;
        box-shadow: 0 12px 30px rgba(25, 36, 58, 0.05);
      }

      .admin-scope-notice strong {
        color: var(--navy);
        font-size: 16px;
      }

      .admin-scope-notice p {
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
        font-size: 13px;
      }

      .admin-scope-badge {
        width: max-content;
        border-radius: 999px;
        background: #e9f4ef;
        color: var(--green);
        font-size: 12px;
        font-weight: 850;
        padding: 4px 9px;
      }
    `;
    document.head.appendChild(style);
  }

  function isCreatorMode() {
    const developerPanel = document.querySelector("#developerPanel");
    return Boolean(developerPanel && !developerPanel.hidden);
  }

  function hideStudentPages() {
    STUDENT_PAGE_IDS.forEach((id) => {
      const page = document.querySelector(`#${id}`);
      if (page) page.hidden = true;
    });
  }

  function ensureWorkspaceShell() {
    const workspacePage = document.querySelector("#workspacePage");
    if (workspacePage) workspacePage.hidden = false;
    const chatArea = document.querySelector("#chatArea");
    const quickPrompts = document.querySelector("#quickPrompts");
    const chatForm = document.querySelector("#chatForm");
    if (chatArea) chatArea.hidden = false;
    if (quickPrompts) quickPrompts.hidden = false;
    if (chatForm) chatForm.hidden = false;
  }

  function ensureScopeNotice() {
    const developerPanel = document.querySelector("#developerPanel");
    if (!developerPanel) return;
    let notice = document.querySelector(`#${ADMIN_SCOPE_ID}`);
    if (!notice) {
      notice = document.createElement("section");
      notice.id = ADMIN_SCOPE_ID;
      notice.className = "admin-scope-notice";
      notice.innerHTML = `
        <span class="admin-scope-badge">${text.badge}</span>
        <strong>${text.title}</strong>
        <p>${text.body}</p>
      `;
      developerPanel.insertAdjacentElement("afterbegin", notice);
    }
  }

  function protectStudentEntrypoints() {
    ["openProfilePageButton", "openStudyAreaButton", "openSchoolCommunityButton", "openClassmatesButton", "openEmailReplyButton", "openScheduleButton"].forEach((id) => {
      const button = document.querySelector(`#${id}`);
      if (!button || button.dataset.adminBoundaryProtected === "true") return;
      button.dataset.adminBoundaryProtected = "true";
      button.addEventListener(
        "click",
        (event) => {
          if (!isCreatorMode()) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          const adminMessage = document.querySelector("#adminMessage");
          if (adminMessage) adminMessage.textContent = text.blocked;
          hideStudentPages();
          ensureWorkspaceShell();
        },
        true
      );
    });
  }

  function syncBoundary() {
    installStyle();
    ensureScopeNotice();
    protectStudentEntrypoints();
    const creatorMode = isCreatorMode();
    document.body.classList.toggle("admin-boundary-active", creatorMode);
    if (!creatorMode) return;
    hideStudentPages();
    ensureWorkspaceShell();
  }

  syncBoundary();
  setInterval(syncBoundary, 250);
})();
