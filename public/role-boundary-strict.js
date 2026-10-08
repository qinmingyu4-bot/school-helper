(() => {
  const VERSION = "20261008-role-boundary-strict-1.0.92";
  if (window.__studybridgeRoleBoundaryStrictVersion === VERSION) return;
  window.__studybridgeRoleBoundaryStrictVersion = VERSION;

  const STUDENT_ROUTE = "study";
  const DEVELOPER_ROUTE = "developer";
  let effectiveRole = "";
  let loaded = false;

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function isAdmin() {
    return effectiveRole === "admin";
  }

  async function loadCurrentRole() {
    try {
      const response = await fetch("/api/me", { credentials: "include", cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json();
      effectiveRole = String(result?.user?.role || "").toLowerCase();
      loaded = Boolean(result?.user);
    } catch {
      loaded = false;
    }
  }

  function rememberStudentMode() {
    try {
      if (localStorage.getItem("studybridgeWorkspaceMode") === "creator") {
        localStorage.setItem("studybridgeWorkspaceMode", "student");
      }
      if (localStorage.getItem("studybridgeLastRoute") === DEVELOPER_ROUTE) {
        localStorage.setItem("studybridgeLastRoute", STUDENT_ROUTE);
      }
    } catch {
      // localStorage can be blocked in some browser privacy modes.
    }
  }

  function openStudentFallback() {
    rememberStudentMode();
    const developerPanel = $("#developerPanel");
    if (developerPanel && !developerPanel.hidden) developerPanel.hidden = true;
    const studyButton = $("#openStudyAreaButton") || $(".study-entry") || $("#studentViewButton");
    if (typeof window.studybridgeDirectOpen === "function") {
      window.studybridgeDirectOpen(STUDENT_ROUTE);
    } else if (typeof window.openStudyArea === "function") {
      window.openStudyArea();
    } else {
      studyButton?.click?.();
    }
  }

  function setElementBlocked(element, blocked) {
    if (!element) return;
    element.hidden = blocked;
    element.toggleAttribute("aria-hidden", blocked);
    element.toggleAttribute("disabled", blocked);
    if (blocked) element.tabIndex = -1;
    else element.removeAttribute("tabindex");
  }

  function applyBoundary() {
    if (!loaded) return;
    const roleSwitch = $("#roleSwitch");
    const studentButton = $("#studentViewButton");
    const developerButton = $("#creatorViewButton");
    const developerNavItems = document.querySelectorAll('[data-sb-route="developer"],[data-nav="developer"]');

    if (isAdmin()) {
      setElementBlocked(roleSwitch, false);
      setElementBlocked(developerButton, false);
      developerNavItems.forEach((item) => setElementBlocked(item, false));
      return;
    }

    rememberStudentMode();
    setElementBlocked(roleSwitch, true);
    setElementBlocked(developerButton, true);
    developerNavItems.forEach((item) => setElementBlocked(item, true));

    if (studentButton) {
      studentButton.classList.add("active");
      studentButton.setAttribute("aria-selected", "true");
    }

    const developerPanel = $("#developerPanel");
    const visibleDeveloperPanel = developerPanel && !developerPanel.hidden;
    const creatorModeActive = developerButton?.classList?.contains("active");
    if (visibleDeveloperPanel || creatorModeActive) openStudentFallback();
  }

  function interceptDeveloperAccess(event) {
    if (!loaded || isAdmin()) return;
    const blockedTarget = event.target?.closest?.("#creatorViewButton,[data-sb-route='developer'],[data-nav='developer']");
    if (!blockedTarget) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    openStudentFallback();
  }

  async function boot() {
    await loadCurrentRole();
    applyBoundary();
    document.addEventListener("click", interceptDeveloperAccess, true);
    document.addEventListener("submit", interceptDeveloperAccess, true);

    const observer = new MutationObserver(() => applyBoundary());
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class"] });
    setInterval(applyBoundary, 1200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();