(() => {
  const VERSION = "20261008-sidebar-role-boundary-1.0.85";
  if (window.__studybridgeSidebarRoleBoundaryVersion === VERSION) return;
  window.__studybridgeSidebarRoleBoundaryVersion = VERSION;

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function $$(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function installStyle() {
    if ($("#studybridgeSidebarRoleBoundaryStyle")) return;
    const style = document.createElement("style");
    style.id = "studybridgeSidebarRoleBoundaryStyle";
    style.textContent = `
      body.sb-creator-sidebar #openProfilePageButton,
      body.sb-creator-sidebar .profile-entry,
      body.sb-creator-sidebar #sbDirectNav,
      body.sb-creator-sidebar .sidebar > .panel {
        display: none !important;
      }
      body.sb-creator-sidebar .sidebar {
        overflow-y: auto !important;
      }
      #roleSwitch .role-switch-button.active,
      #roleSwitch .role-switch-button.is-active {
        background: #fff !important;
        color: #0b2344 !important;
        box-shadow: 0 8px 20px rgba(25,36,58,.08) !important;
      }
      #roleSwitch .role-switch-button:not(.active):not(.is-active) {
        background: transparent !important;
        color: #52617a !important;
        box-shadow: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function visibleDirectTitle() {
    const page = $("#sbDirectPage:not([hidden])");
    return page?.querySelector(".sb-page-head h2")?.textContent?.trim() || "";
  }

  function routeFromPage() {
    const remembered = localStorage.getItem("studybridgeLastRoute") || "";
    const title = visibleDirectTitle();
    if (/开发者端/.test(title) || remembered === "developer") return "developer";
    if (/个人资料/.test(title) || remembered === "profile") return "profile";
    if (/社区/.test(title) || remembered === "community") return "community";
    if (/同学/.test(title) || remembered === "classmates") return "classmates";
    if (/邮件/.test(title) || remembered === "email") return "email";
    if (/时间表/.test(title) || remembered === "schedule") return "schedule";
    if (document.body.classList.contains("sb-study-mode") || remembered === "study") return "study";
    return remembered || "study";
  }

  function setButtonState(route) {
    const student = $("#studentViewButton");
    const creator = $("#creatorViewButton");
    if (!student || !creator) return;
    const isCreator = route === "developer";
    student.classList.toggle("active", !isCreator);
    student.classList.toggle("is-active", !isCreator);
    student.setAttribute("aria-pressed", String(!isCreator));
    creator.classList.toggle("active", isCreator);
    creator.classList.toggle("is-active", isCreator);
    creator.setAttribute("aria-pressed", String(isCreator));
  }

  function applyBoundary() {
    const route = routeFromPage();
    const isCreator = route === "developer";
    document.body.classList.toggle("sb-creator-sidebar", isCreator);
    document.body.classList.toggle("sb-student-sidebar", !isCreator);
    setButtonState(route);
    const switcher = $("#roleSwitch");
    if (switcher) switcher.hidden = false;
  }

  function installClickFallback() {
    document.addEventListener("click", (event) => {
      const student = event.target.closest?.("#studentViewButton");
      const creator = event.target.closest?.("#creatorViewButton");
      if (!student && !creator) return;
      window.setTimeout(applyBoundary, 0);
      window.setTimeout(applyBoundary, 150);
      window.setTimeout(applyBoundary, 600);
    }, true);
  }

  function patchDirectOpen() {
    if (window.__studybridgeSidebarRoleBoundaryPatched) return;
    window.__studybridgeSidebarRoleBoundaryPatched = true;
    const timer = window.setInterval(() => {
      if (typeof window.studybridgeDirectOpen !== "function" || window.studybridgeDirectOpen.__roleBoundaryWrapped) return;
      const original = window.studybridgeDirectOpen;
      const wrapped = function(route) {
        const result = original.apply(this, arguments);
        window.setTimeout(applyBoundary, 0);
        window.setTimeout(applyBoundary, 250);
        return result;
      };
      wrapped.__roleBoundaryWrapped = true;
      window.studybridgeDirectOpen = wrapped;
      window.clearInterval(timer);
    }, 200);
    window.setTimeout(() => window.clearInterval(timer), 8000);
  }

  function init() {
    installStyle();
    installClickFallback();
    patchDirectOpen();
    applyBoundary();
    new MutationObserver(() => window.requestAnimationFrame(applyBoundary)).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "class", "style"]
    });
    window.setInterval(applyBoundary, 1200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
