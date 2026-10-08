(() => {
  const VERSION = "20261008-main-nav-stabilizer-1.0.95";
  if (window.__studybridgeMainNavStabilizer === VERSION) return;
  window.__studybridgeMainNavStabilizer = VERSION;

  const ROUTES = [
    ["community", "社", "社区", "全部、学校和专业频道"],
    ["classmates", "友", "同学", "SB ID 申请和聊天"],
    ["email", "信", "邮件助手", "理解邮件并生成英文回复"],
    ["schedule", "时", "时间表", "Deadline 和课程提醒"],
    ["study", "学", "学习区", "课程资料、AI 对话和复习计划"],
    ["tools", "工", "工具", "SB Docs、Sheets、Slides"],
  ];
  const ROUTE_KEYS = new Set(ROUTES.map(([key]) => key).concat(["profile", "developer"]));
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));

  let normalizing = false;
  let retryTimer = 0;
  let observer = null;

  function addStyle() {
    if ($("#sbMainNavStabilizerStyle")) return;
    const style = document.createElement("style");
    style.id = "sbMainNavStabilizerStyle";
    style.textContent = `
      #sbMainNav { display: grid; gap: 10px; margin: 14px 0; }
      #sbMainNav .sb-main-nav-card {
        width: 100%; min-height: 54px; display: grid; grid-template-columns: 36px minmax(0,1fr);
        align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid #d7e0ec;
        border-radius: 8px; background: #fff; color: #0b2344; text-align: left; font: inherit; cursor: pointer;
      }
      #sbMainNav .sb-main-nav-card:hover,
      #sbMainNav .sb-main-nav-card.is-active { border-color: #2f7d62; background: #fbfffd; }
      #sbMainNav .sb-main-nav-icon {
        width: 36px; height: 36px; display: grid; place-items: center; border-radius: 8px;
        color: #fff; background: linear-gradient(135deg,#1f3a5f,#2f7d62); font-weight: 900;
      }
      #sbMainNav strong { display: block; line-height: 1.15; }
      #sbMainNav small { display: block; margin-top: 2px; color: #52617a; line-height: 1.25; }
      .sidebar { overflow-y: auto !important; scroll-behavior: auto !important; }
      body.sb-direct-mode #workspacePage > .topbar,
      body.sb-direct-mode #workspacePage > #scheduleDashboard,
      body.sb-direct-mode #workspacePage > #chatArea,
      body.sb-direct-mode #workspacePage > #quickPrompts,
      body.sb-direct-mode #workspacePage > #chatForm { display: none !important; }
      body:not(.sb-direct-mode) #workspacePage > .topbar,
      body:not(.sb-direct-mode) #workspacePage > #scheduleDashboard,
      body:not(.sb-direct-mode) #workspacePage > #chatArea,
      body:not(.sb-direct-mode) #workspacePage > #quickPrompts,
      body:not(.sb-direct-mode) #workspacePage > #chatForm { display: revert; }
    `;
    document.head.appendChild(style);
  }

  function appReady() {
    return Boolean($("#appShell:not([hidden])") && $("#workspacePage"));
  }

  function mark(route) {
    $$("[data-sb-main-route]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.sbMainRoute === route);
    });
  }

  function cleanOldNav(sidebar) {
    $$("#sbSixZoneNav, .sb-direct-nav, #sbDirectNav", sidebar).forEach((node) => node.remove());
  }

  function normalizeSidebar() {
    const sidebar = $(".sidebar");
    if (!sidebar || normalizing) return;
    normalizing = true;
    try {
      cleanOldNav(sidebar);
      let nav = $("#sbMainNav", sidebar);
      if (!nav) {
        nav = document.createElement("nav");
        nav.id = "sbMainNav";
        nav.setAttribute("aria-label", "StudyBridge 功能区");
      }
      nav.innerHTML = ROUTES.map(([key, icon, title, subtitle]) => `
        <button class="sb-main-nav-card" type="button" data-sb-main-route="${key}">
          <span class="sb-main-nav-icon">${esc(icon)}</span>
          <span><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></span>
        </button>
      `).join("");

      const profile = $("#profileCard", sidebar) || $(".profile-card", sidebar);
      const roleSwitch = $("#roleSwitch", sidebar);
      if (profile?.nextSibling !== nav) {
        if (profile?.nextSibling) sidebar.insertBefore(nav, profile.nextSibling);
        else if (roleSwitch) sidebar.insertBefore(nav, roleSwitch);
        else sidebar.appendChild(nav);
      }
    } finally {
      normalizing = false;
    }
  }

  function setStatus(text) {
    const status = $("#statusLine");
    if (status) status.textContent = text;
  }

  function openWithDirectRouter(route) {
    if (typeof window.studybridgeDirectOpen === "function") {
      document.body.classList.toggle("sb-direct-mode", route !== "study");
      window.studybridgeDirectOpen(route);
      window.setTimeout(() => mark(route), 80);
      return true;
    }
    return false;
  }

  function openRoute(route, attempt = 0) {
    if (!ROUTE_KEYS.has(route)) return;
    normalizeSidebar();
    mark(route);
    localStorage.setItem("studybridgeLastRoute", route);

    if (!appReady() && attempt < 25) {
      clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => openRoute(route, attempt + 1), 120);
      return;
    }

    if (openWithDirectRouter(route)) return;

    if (attempt < 25) {
      clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => openRoute(route, attempt + 1), 120);
      return;
    }

    setStatus("页面还没加载完成，请刷新一次。");
  }

  function routeFromTarget(target) {
    const navButton = target.closest?.("[data-sb-main-route]");
    if (navButton) return navButton.dataset.sbMainRoute;

    const routed = target.closest?.("[data-sb-route]");
    if (routed) return routed.dataset.sbRoute;

    const creator = target.closest?.("#creatorViewButton");
    if (creator) return "developer";

    const student = target.closest?.("#studentViewButton");
    if (student) return "study";

    const profile = target.closest?.("#openProfilePageButton,#editProfileButton,#profileCard,.profile-card");
    if (profile) return "profile";

    return "";
  }

  function onClick(event) {
    const route = routeFromTarget(event.target);
    if (!route) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    openRoute(route);
  }

  function watchSidebar() {
    const sidebar = $(".sidebar");
    if (!sidebar || observer) return;
    observer = new MutationObserver(() => window.requestAnimationFrame(normalizeSidebar));
    observer.observe(sidebar, { childList: true, subtree: false });
  }

  function init() {
    addStyle();
    normalizeSidebar();
    watchSidebar();
    document.addEventListener("click", onClick, true);
    window.studybridgeOpenRoute = openRoute;
    window.studybridgeNormalizeMainNav = normalizeSidebar;
    window.setTimeout(normalizeSidebar, 300);
    window.setTimeout(normalizeSidebar, 1200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
