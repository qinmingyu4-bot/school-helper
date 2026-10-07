(() => {
  const PAGE_KEY = "studybridgeLastOpenPage";
  const STYLE_ID = "studybridge-student-nav-hardening";
  const PAGE_IDS = ["workspacePage", "profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
  const TARGETS = {
    openStudyAreaButton: { pageId: "workspacePage" },
    openProfilePageButton: { pageId: "profilePage" },
    openSchoolCommunityButton: {
      pageId: "schoolCommunityPage",
      opener: "studybridgeOpenCommunityPage",
      scripts: ["/school-community-patch.js?v=20261007-nav-hardening"]
    },
    openClassmatesButton: {
      pageId: "classmatesPage",
      opener: "studybridgeOpenClassmatesPage",
      scripts: [
        "/classmates-patch.js?v=20261007-nav-hardening",
        "/classmates-request-patch.js?v=20261007-nav-hardening",
        "/classmate-chat-bubble-fix.js?v=20261007-nav-hardening",
        "/classmates-performance-patch.js?v=20261007-nav-hardening"
      ]
    },
    openEmailReplyButton: {
      pageId: "emailReplyPage",
      opener: "studybridgeOpenEmailReplyPage",
      scripts: ["/email-reply-patch.js?v=20261007-nav-hardening"]
    },
    openScheduleButton: {
      pageId: "schedulePage",
      opener: "studybridgeOpenSchedulePage",
      scripts: [
        "/schedule-patch.js?v=20261007-nav-hardening",
        "/schedule-dashboard-patch.js?v=20261007-nav-hardening",
        "/schedule-notification-patch.js?v=20261007-nav-hardening"
      ]
    }
  };

  function installStyle() {
    if (document.querySelector(`#${STYLE_ID}`)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      body:not(.creator-clean-mode) #openStudyAreaButton,
      body:not(.creator-clean-mode) #openProfilePageButton,
      body:not(.creator-clean-mode) #openSchoolCommunityButton,
      body:not(.creator-clean-mode) #openClassmatesButton,
      body:not(.creator-clean-mode) #openEmailReplyButton,
      body:not(.creator-clean-mode) #openScheduleButton {
        pointer-events: auto !important;
        cursor: pointer !important;
      }
    `;
    document.head.appendChild(style);
  }

  function isCreatorMode() {
    const developerPanel = document.querySelector("#developerPanel");
    return Boolean(developerPanel && !developerPanel.hidden);
  }

  function loadScriptOnce(src) {
    const cleanSrc = src.split("?")[0];
    const key = new URL(cleanSrc, window.location.href).pathname;
    const registry = (window.__studybridgeLoadedScripts ||= new Set());
    if (
      registry.has(key) ||
      Array.from(document.scripts).some((script) => {
        const scriptSrc = script.getAttribute("src");
        return scriptSrc && new URL(scriptSrc, window.location.href).pathname === key;
      })
    ) {
      registry.add(key);
      return Promise.resolve();
    }
    registry.add(key);
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener(
        "error",
        () => {
          registry.delete(key);
          resolve();
        },
        { once: true }
      );
      document.body.appendChild(script);
    });
  }

  function remember(pageId) {
    try {
      localStorage.setItem(PAGE_KEY, pageId);
    } catch {
      // Ignore browser storage restrictions.
    }
  }

  function setSidebarState(pageId) {
    document.body.classList.toggle("study-sidebar-hidden", pageId !== "workspacePage");
    Object.entries(TARGETS).forEach(([buttonId, target]) => {
      const button = document.querySelector(`#${buttonId}`);
      if (!button) return;
      button.classList.toggle("active", target.pageId === pageId);
      button.setAttribute("aria-current", target.pageId === pageId ? "page" : "false");
    });
  }

  function showOnly(pageId) {
    PAGE_IDS.forEach((id) => {
      const page = document.querySelector(`#${id}`);
      if (page) page.hidden = id !== pageId;
    });
    setSidebarState(pageId);
    remember(pageId);
    if (pageId === "workspacePage") {
      const chatArea = document.querySelector("#chatArea");
      if (chatArea) setTimeout(() => (chatArea.scrollTop = chatArea.scrollHeight), 30);
    }
    return Boolean(document.querySelector(`#${pageId}`));
  }

  async function openTarget(target) {
    if (!target || isCreatorMode()) return;
    installStyle();
    (target.scripts || []).forEach((src) => loadScriptOnce(src));

    const opener = target.opener ? window[target.opener] : null;
    if (typeof opener === "function") {
      await opener();
      setSidebarState(target.pageId);
      remember(target.pageId);
      return;
    }

    showOnly(target.pageId);

    const delays = [40, 100, 220, 420, 800, 1400, 2400];
    delays.forEach((delay) => {
      setTimeout(async () => {
        const lateOpener = target.opener ? window[target.opener] : null;
        if (typeof lateOpener === "function") {
          await lateOpener();
          setSidebarState(target.pageId);
          remember(target.pageId);
          return;
        }
        showOnly(target.pageId);
      }, delay);
    });
  }

  function handleNavigationClick(event) {
    const button = event.target.closest?.(Object.keys(TARGETS).map((id) => `#${id}`).join(", "));
    if (!button || isCreatorMode()) return;
    const target = TARGETS[button.id];
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openTarget(target);
  }

  installStyle();
  document.addEventListener("click", handleNavigationClick, true);
})();
