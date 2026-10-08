(() => {
  const VERSION = "20261008-navigation-emergency-1.0.69";
  if (window.__studybridgeNavigationEmergency === VERSION) return;
  window.__studybridgeNavigationEmergency = VERSION;

  const staleBodyClasses = [
    "studybridge-secondary-page",
    "study-sidebar-hidden",
    "studybridge-nav-hotfix-page",
    "creator-clean-mode",
    "admin-boundary-active",
    "studybridge-page-switching"
  ];

  const routeSelectors = [
    "[data-route]",
    "[data-studybridge-route]",
    "#profileCard",
    "#editProfileButton",
    "#openProfilePageButton",
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
  ].join(",");

  function clearStaleState() {
    document.body.classList.remove(...staleBodyClasses);
    const workspace = document.querySelector("#workspacePage, .workspace");
    if (workspace) {
      workspace.hidden = false;
      workspace.style.removeProperty("display");
      workspace.style.removeProperty("visibility");
      workspace.style.removeProperty("opacity");
    }
  }

  function routeFor(node) {
    if (!node) return "";
    const explicit = node.dataset?.route || node.dataset?.studybridgeRoute;
    if (explicit) return explicit;
    if (node.id === "profileCard" || node.id === "editProfileButton" || node.id === "openProfilePageButton" || node.classList?.contains("profile-card")) return "profile";
    if (node.id === "openSchoolCommunityButton" || node.classList?.contains("community-entry")) return "community";
    if (node.id === "openClassmatesButton" || node.classList?.contains("classmates-entry")) return "classmates";
    if (node.id === "openEmailReplyButton" || node.classList?.contains("email-helper-entry")) return "email";
    if (node.id === "openScheduleButton" || node.classList?.contains("schedule-entry")) return "schedule";
    if (node.id === "openStudyAreaButton" || node.id === "studentViewButton" || node.classList?.contains("study-entry")) return "study";
    if (node.id === "creatorViewButton") return "developer";
    return "";
  }

  function open(route) {
    clearStaleState();
    if (typeof window.studybridgeOpenRoute === "function") {
      window.studybridgeOpenRoute(route);
      return true;
    }
    return false;
  }

  function handle(event) {
    const node = event.target?.closest?.(routeSelectors);
    const route = routeFor(node);
    if (!route) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (!open(route)) {
      window.setTimeout(() => open(route), 80);
    }
  }

  function tagExistingButtons() {
    [
      ["#openSchoolCommunityButton,.community-entry", "community"],
      ["#openClassmatesButton,.classmates-entry", "classmates"],
      ["#openEmailReplyButton,.email-helper-entry", "email"],
      ["#openScheduleButton,.schedule-entry", "schedule"],
      ["#openStudyAreaButton,.study-entry", "study"],
      ["#profileCard,#editProfileButton,#openProfilePageButton,.profile-card", "profile"],
      ["#creatorViewButton", "developer"],
      ["#studentViewButton", "study"]
    ].forEach(([selector, route]) => {
      document.querySelectorAll(selector).forEach((node) => {
        node.dataset.route = route;
        node.style.pointerEvents = "auto";
        node.style.cursor = "pointer";
      });
    });
  }

  document.addEventListener("click", handle, true);
  document.addEventListener("pointerup", handle, true);
  document.addEventListener("DOMContentLoaded", () => {
    clearStaleState();
    tagExistingButtons();
    window.setTimeout(tagExistingButtons, 250);
    window.setTimeout(tagExistingButtons, 1000);
  }, { once: true });
  window.setInterval(tagExistingButtons, 2500);
})();
