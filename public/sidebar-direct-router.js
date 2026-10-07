(() => {
  const VERSION = "20261007-master-bridge-3";
  if (window.__studybridgeSidebarDirectRouter === VERSION) return;
  window.__studybridgeSidebarDirectRouter = VERSION;

  const RESCUE_PATH = "/student-navigation-rescue-v2.js";
  const RESCUE_SRC = `${RESCUE_PATH}?v=20261007-rescue-v6`;
  const MASTER_PATH = "/student-navigation-master.js";
  const MASTER_SRC = `${MASTER_PATH}?v=20261007-master-nav-4`;

  const aliases = {
    workspacePage: "study",
    study: "study",
    profilePage: "profile",
    profile: "profile",
    schoolCommunityPage: "community",
    communityPage: "community",
    community: "community",
    classmatesPage: "classmates",
    classmates: "classmates",
    emailReplyPage: "email",
    emailPage: "email",
    email: "email",
    schedulePage: "schedule",
    schedule: "schedule",
    developerPanel: "developer",
    developer: "developer",
    openProfilePageButton: "profile",
    editProfileButton: "profile",
    openSchoolCommunityButton: "community",
    openClassmatesButton: "classmates",
    openEmailReplyButton: "email",
    openScheduleButton: "schedule",
    openStudyAreaButton: "study",
    studentViewButton: "study",
    creatorViewButton: "developer"
  };

  const selectorRoutes = [
    ["#profileCard, #openProfilePageButton, #editProfileButton, .profile-card", "profile"],
    ["#openSchoolCommunityButton, .community-entry", "community"],
    ["#openClassmatesButton, .classmates-entry", "classmates"],
    ["#openEmailReplyButton, .email-helper-entry", "email"],
    ["#openScheduleButton, .schedule-entry", "schedule"],
    ["#openStudyAreaButton, .study-entry", "study"],
    ["#studentViewButton, .student-mode-entry", "study"],
    ["#creatorViewButton, .developer-mode-entry", "developer"]
  ];

  function normalize(routeName) {
    const key = String(routeName || "").trim();
    return aliases[key] || key;
  }

  function scriptLoaded(path) {
    return Array.from(document.scripts).some((script) => {
      const src = script.getAttribute("src") || "";
      try {
        return new URL(src, window.location.href).pathname === path;
      } catch {
        return src.includes(path);
      }
    });
  }

  function loadScript(path, src) {
    if (scriptLoaded(path)) return;
    const script = document.createElement("script");
    script.async = false;
    script.src = src;
    document.body.appendChild(script);
  }

  function loadRouters() {
    loadScript(MASTER_PATH, MASTER_SRC);
    loadScript(RESCUE_PATH, RESCUE_SRC);
  }

  function openPage(routeName) {
    const route = normalize(routeName);
    if (!route) return false;

    loadRouters();

    let attempts = 0;
    const run = () => {
      attempts += 1;
      if (typeof window.studybridgeNavigationRescueOpen === "function") {
        window.studybridgeNavigationRescueOpen(route);
        return true;
      }
      if (typeof window.studybridgeMasterOpen === "function") {
        window.studybridgeMasterOpen(route);
        return true;
      }
      return attempts > 70;
    };

    if (run()) return true;

    const timer = window.setInterval(() => {
      if (run()) window.clearInterval(timer);
    }, 50);
    return true;
  }

  function routeFromTarget(target) {
    if (!target?.closest) return "";
    const declared = normalize(target.closest("[data-studybridge-route]")?.dataset?.studybridgeRoute);
    if (declared) return declared;

    for (const [selector, route] of selectorRoutes) {
      if (target.closest(selector)) return route;
    }
    return "";
  }

  function handleClick(event) {
    const route = routeFromTarget(event.target);
    if (!route) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    openPage(route);
  }

  function init() {
    loadRouters();
    document.addEventListener("click", handleClick, true);
    document.addEventListener("pointerup", handleClick, true);
  }

  window.studybridgeDirectOpen = openPage;
  window.studybridgeOpenStudentPage = openPage;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
