(() => {
  const VERSION = "20261008-shell-rescue-1.0.63";
  if (window.__studybridgeStudyScrollHardeningV2 === VERSION) return;
  window.__studybridgeStudyScrollHardeningV2 = VERSION;

  const STYLE_ID = "studybridge-study-scroll-hardening";
  const DIRECT_SCRIPT = "/studybridge-direct-pages.js";
  let frame = 0;

  function isVisible(element) {
    return Boolean(element && !element.hidden && element.offsetParent !== null);
  }

  function isStudyViewActive() {
    const workspacePage = document.querySelector("#workspacePage") || document.querySelector(".workspace");
    const developerPanel = document.querySelector("#developerPanel");
    return isVisible(workspacePage) && !(developerPanel && !developerPanel.hidden);
  }

  function getChatArea() {
    const chatArea = document.querySelector("#chatArea");
    return isVisible(chatArea) ? chatArea : null;
  }

  function installStyle() {
    let style = document.querySelector(`#${STYLE_ID}`);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }

    style.textContent = `
      html,
      body {
        height: 100% !important;
        overflow: hidden !important;
        scroll-behavior: auto !important;
      }

      #appShell,
      .app-shell {
        height: 100dvh !important;
        max-height: 100dvh !important;
        overflow: hidden !important;
      }

      .sidebar {
        height: 100dvh !important;
        max-height: 100dvh !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        scroll-behavior: auto !important;
        overscroll-behavior: contain !important;
        -webkit-overflow-scrolling: touch !important;
      }

      #workspacePage,
      .workspace {
        height: 100dvh !important;
        max-height: 100dvh !important;
        min-height: 0 !important;
        overflow: hidden !important;
      }

      body:not(.creator-clean-mode) #workspacePage,
      body:not(.creator-clean-mode) .workspace {
        min-height: 0 !important;
      }

      body.sb-direct-page #workspacePage,
      body.sb-direct-page .workspace {
        display: block !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
      }

      body.sb-direct-page #sbDirectPage {
        display: block !important;
        min-height: 100dvh !important;
      }

      body.sb-direct-page #workspacePage > .topbar,
      body.sb-direct-page #workspacePage > #scheduleDashboard,
      body.sb-direct-page #workspacePage > #chatArea,
      body.sb-direct-page #workspacePage > #quickPrompts,
      body.sb-direct-page #workspacePage > #chatForm,
      body.sb-direct-page #workspacePage > #developerPanel {
        display: none !important;
      }

      body.sb-direct-study #workspacePage,
      body.sb-direct-study .workspace {
        display: grid !important;
        grid-template-rows: auto auto minmax(0, 1fr) auto !important;
        overflow: hidden !important;
      }

      body:not(.creator-clean-mode) #workspacePage #chatArea {
        min-height: 0 !important;
        height: auto !important;
        max-height: none !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior-y: contain !important;
        -webkit-overflow-scrolling: touch !important;
        touch-action: pan-y !important;
        scrollbar-gutter: stable !important;
      }

      body:not(.creator-clean-mode) #workspacePage #chatArea .message {
        flex: 0 0 auto !important;
      }
    `;
  }

  function markScrollable() {
    const chatArea = getChatArea();
    if (!chatArea || !isStudyViewActive()) return;
    chatArea.dataset.studyScrollHardening = "native";
    chatArea.tabIndex = chatArea.tabIndex >= 0 ? chatArea.tabIndex : 0;
  }

  function routeFromTarget(target) {
    const node = target?.closest?.(
      [
        "[data-sb-direct-route]",
        "[data-sb-route]",
        "#profileCard",
        "#openProfilePageButton",
        "#editProfileButton",
        "#openSchoolCommunityButton",
        "#openClassmatesButton",
        "#openEmailReplyButton",
        "#openScheduleButton",
        "#openStudyAreaButton",
        "#studentViewButton",
        "#creatorViewButton",
        ".profile-card",
        ".community-entry",
        ".classmates-entry",
        ".email-helper-entry",
        ".schedule-entry",
        ".study-entry"
      ].join(",")
    );
    if (!node) return "";
    if (node.dataset.sbDirectRoute) return node.dataset.sbDirectRoute;
    if (node.dataset.sbRoute) return node.dataset.sbRoute;
    if (node.id === "profileCard" || node.id === "openProfilePageButton" || node.id === "editProfileButton") return "profile";
    if (node.id === "openSchoolCommunityButton" || node.classList.contains("community-entry")) return "community";
    if (node.id === "openClassmatesButton" || node.classList.contains("classmates-entry")) return "classmates";
    if (node.id === "openEmailReplyButton" || node.classList.contains("email-helper-entry")) return "email";
    if (node.id === "openScheduleButton" || node.classList.contains("schedule-entry")) return "schedule";
    if (node.id === "openStudyAreaButton" || node.id === "studentViewButton" || node.classList.contains("study-entry")) return "study";
    if (node.id === "creatorViewButton") return "developer";
    return "";
  }

  function resetScroll() {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const workspacePage = document.querySelector("#workspacePage") || document.querySelector(".workspace");
    if (workspacePage) workspacePage.scrollTop = 0;
  }

  function ensureDirectScript(callback) {
    if (typeof window.studybridgeOpenDirectPage === "function") {
      callback();
      return;
    }
    const existing = Array.from(document.scripts).find((script) => {
      try {
        return new URL(script.src, window.location.href).pathname === DIRECT_SCRIPT;
      } catch {
        return (script.src || "").includes(DIRECT_SCRIPT);
      }
    });
    if (existing) {
      window.setTimeout(callback, 80);
      return;
    }
    const script = document.createElement("script");
    script.async = false;
    script.src = `${DIRECT_SCRIPT}?v=${VERSION}`;
    script.addEventListener("load", callback, { once: true });
    (document.head || document.documentElement).appendChild(script);
  }

  function openShellRoute(route) {
    if (!route) return false;
    resetScroll();
    ensureDirectScript(() => {
      if (typeof window.studybridgeOpenDirectPage === "function") {
        window.studybridgeOpenDirectPage(route);
        resetScroll();
        window.setTimeout(resetScroll, 80);
      }
    });
    return true;
  }

  function scheduleMark() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      installStyle();
      markScrollable();
    });
  }

  installStyle();
  scheduleMark();
  window.addEventListener("resize", scheduleMark);
  document.addEventListener("visibilitychange", scheduleMark);
  document.addEventListener(
    "pointerdown",
    (event) => {
      const route = routeFromTarget(event.target);
      if (route) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        openShellRoute(route);
        return;
      }
      const chatArea = getChatArea();
      if (chatArea && chatArea.contains(event.target) && event.target === chatArea) chatArea.focus({ preventScroll: true });
    },
    true
  );
  document.addEventListener(
    "click",
    (event) => {
      const route = routeFromTarget(event.target);
      if (!route) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      openShellRoute(route);
    },
    true
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const route = routeFromTarget(event.target);
      if (!route) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      openShellRoute(route);
    },
    true
  );
  window.studybridgeShellOpen = openShellRoute;
  new MutationObserver(scheduleMark).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "class", "style"]
  });
})();
