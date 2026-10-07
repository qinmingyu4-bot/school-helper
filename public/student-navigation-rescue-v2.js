(() => {
  const VERSION = "20261007-rescue-v6";
  if (window.__studybridgeNavigationRescueV2 === VERSION) return;
  window.__studybridgeNavigationRescueV2 = VERSION;

  const MASTER_PATH = "/student-navigation-master.js";
  const MASTER_SRC = `${MASTER_PATH}?v=20261007-master-nav-4`;

  const aliases = {
    profile: "profile",
    community: "community",
    classmates: "classmates",
    email: "email",
    schedule: "schedule",
    study: "study",
    developer: "developer",
    openProfilePageButton: "profile",
    editProfileButton: "profile",
    profileCard: "profile",
    profilePage: "profile",
    openSchoolCommunityButton: "community",
    schoolCommunityPage: "community",
    communityPage: "community",
    openClassmatesButton: "classmates",
    classmatesPage: "classmates",
    openEmailReplyButton: "email",
    emailReplyPage: "email",
    emailPage: "email",
    openScheduleButton: "schedule",
    schedulePage: "schedule",
    openStudyAreaButton: "study",
    workspacePage: "study",
    studentViewButton: "study",
    creatorViewButton: "developer",
    developerPanel: "developer"
  };

  const idRoutes = {
    profileCard: "profile",
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

  const classRoutes = [
    ["profile-card", "profile"],
    ["community-entry", "community"],
    ["classmates-entry", "classmates"],
    ["email-helper-entry", "email"],
    ["schedule-entry", "schedule"],
    ["study-entry", "study"],
    ["student-mode-entry", "study"],
    ["developer-mode-entry", "developer"]
  ];

  function normalize(routeName) {
    const key = String(routeName || "").trim();
    return aliases[key] || key;
  }

  function routeFromText(text) {
    const value = String(text || "").replace(/\s+/g, "");
    if (!value) return "";
    if (value.includes("\u793e\u533a") || value.toLowerCase().includes("community")) return "community";
    if (value.includes("\u540c\u5b66") || value.toLowerCase().includes("classmates")) return "classmates";
    if (value.includes("\u90ae\u4ef6\u52a9\u624b") || value.toLowerCase().includes("email")) return "email";
    if (value.includes("\u65f6\u95f4\u8868") || value.toLowerCase().includes("schedule")) return "schedule";
    if (value.includes("\u5b66\u4e60\u533a") || value.toLowerCase().includes("study")) return "study";
    if (value.includes("\u666e\u901a\u7528\u6237\u7aef")) return "study";
    if (value.includes("\u5f00\u53d1\u8005\u7aef")) return "developer";
    if (value.includes("\u6253\u5f00") && document.activeElement?.id === "openProfilePageButton") return "profile";
    return "";
  }

  function findRouteTarget(target) {
    if (!target?.closest) return null;
    return target.closest([
      "[data-studybridge-route]",
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
      ".study-entry",
      ".student-mode-entry",
      ".developer-mode-entry",
      ".role-switch button",
      ".role-switch-button"
    ].join(","));
  }

  function routeFromTarget(target) {
    const node = findRouteTarget(target);
    if (!node) return "";

    const declared = normalize(node.dataset?.studybridgeRoute);
    if (declared) return declared;

    if (node.id && idRoutes[node.id]) return idRoutes[node.id];

    for (const [className, route] of classRoutes) {
      if (node.classList?.contains(className)) return route;
    }

    return routeFromText(node.textContent || "");
  }

  function hasMaster() {
    if (typeof window.studybridgeMasterOpen === "function") return true;
    return Array.from(document.scripts).some((script) => {
      const src = script.getAttribute("src") || "";
      try {
        return new URL(src, window.location.href).pathname === MASTER_PATH;
      } catch {
        return src.includes(MASTER_PATH);
      }
    });
  }

  function loadMaster() {
    if (hasMaster()) return;
    const script = document.createElement("script");
    script.async = false;
    script.src = MASTER_SRC;
    document.body.appendChild(script);
  }

  function decorateNavigation() {
    Object.entries(idRoutes).forEach(([id, route]) => {
      const node = document.getElementById(id);
      if (node) {
        node.dataset.studybridgeRoute = route;
        node.style.cursor = "pointer";
      }
    });

    classRoutes.forEach(([className, route]) => {
      document.querySelectorAll(`.${className}`).forEach((node) => {
        node.dataset.studybridgeRoute = route;
        node.style.cursor = "pointer";
      });
    });
  }

  function setStatus(message) {
    const status = document.getElementById("appStatus");
    if (status) status.textContent = message;
  }

  function openRoute(routeName) {
    const route = normalize(routeName);
    if (!route) return false;

    loadMaster();
    decorateNavigation();
    setStatus("Opening page...");

    let attempts = 0;
    const run = () => {
      attempts += 1;
      if (typeof window.studybridgeMasterOpen === "function") {
        const opened = window.studybridgeMasterOpen(route);
        setStatus(opened === false ? "Page unavailable." : "Page opened.");
        return true;
      }
      if (attempts > 70) {
        setStatus("Page loader is not ready. Refresh once and try again.");
        return true;
      }
      return false;
    };

    if (run()) return true;

    const timer = window.setInterval(() => {
      if (run()) window.clearInterval(timer);
    }, 50);

    return true;
  }

  function handleNavigationEvent(event) {
    const route = routeFromTarget(event.target);
    if (!route) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    openRoute(route);
  }

  function init() {
    decorateNavigation();
    loadMaster();
    document.addEventListener("click", handleNavigationEvent, true);
    document.addEventListener("pointerup", handleNavigationEvent, true);

    const observer = new MutationObserver(decorateNavigation);
    observer.observe(document.body, { childList: true, subtree: true });

    window.studybridgeNavigationRescueOpen = openRoute;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
