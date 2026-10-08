(() => {
  const VERSION = "20261008-direct-loader-1.0.60";
  if (window.__studybridgeRouterLoader === VERSION) return;
  window.__studybridgeRouterLoader = VERSION;

  const DIRECT_PATH = "/studybridge-direct-pages.js";
  const DIRECT_SRC = `${DIRECT_PATH}?v=${VERSION}`;
  const queuedRoutes = [];

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
        ".profile-entry",
        ".community-entry",
        ".classmates-entry",
        ".email-helper-entry",
        ".schedule-entry",
        ".study-entry",
        ".role-switch-button"
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

  function hasDirectScript() {
    return Array.from(document.scripts).some((script) => {
      const src = script.getAttribute("src") || "";
      try {
        return new URL(src, window.location.href).pathname === DIRECT_PATH;
      } catch {
        return src.includes(DIRECT_PATH);
      }
    });
  }

  function flushQueuedRoutes() {
    if (!window.studybridgeOpenDirectPage) return;
    while (queuedRoutes.length) {
      window.studybridgeOpenDirectPage(queuedRoutes.shift());
    }
  }

  function loadDirectPages() {
    if (!hasDirectScript()) {
      const script = document.createElement("script");
      script.async = false;
      script.src = DIRECT_SRC;
      script.addEventListener("load", flushQueuedRoutes, { once: true });
      (document.head || document.documentElement).appendChild(script);
    } else {
      flushQueuedRoutes();
    }
  }

  function openRoute(route) {
    if (!route) return;
    loadDirectPages();
    if (window.studybridgeOpenDirectPage) {
      window.studybridgeOpenDirectPage(route);
    } else {
      queuedRoutes.push(route);
    }
  }

  function interceptNavigation(event) {
    const route = routeFromTarget(event.target);
    if (!route) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    openRoute(route);
  }

  function interceptKeyboard(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const route = routeFromTarget(event.target);
    if (!route) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    openRoute(route);
  }

  document.addEventListener("pointerdown", interceptNavigation, true);
  document.addEventListener("click", interceptNavigation, true);
  document.addEventListener("keydown", interceptKeyboard, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadDirectPages, { once: true });
  } else {
    loadDirectPages();
  }
})();
