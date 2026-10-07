(() => {
  const VERSION = "20261007-stable-router-2";
  if (window.__studybridgeStableStudentRouter === VERSION) return;
  window.__studybridgeStableStudentRouter = VERSION;

  const pageKey = "studybridgeLastOpenPage";
  const pages = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
  const chrome = [".topbar", "#developerPanel", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"];
  const loaded = new Map();
  let token = 0;

  const routes = {
    openStudyAreaButton: { pageId: "workspacePage", navId: "openStudyAreaButton", title: "学习区", eyebrow: "ACADEMIC COACH" },
    openProfilePageButton: { pageId: "profilePage", navId: "openProfilePageButton", title: "个人资料", eyebrow: "PROFILE" },
    editProfileButton: { pageId: "profilePage", navId: "openProfilePageButton", title: "个人资料", eyebrow: "PROFILE" },
    profileCard: { pageId: "profilePage", navId: "openProfilePageButton", title: "个人资料", eyebrow: "PROFILE" },
    openSchoolCommunityButton: { pageId: "schoolCommunityPage", navId: "openSchoolCommunityButton", title: "社区", eyebrow: "COMMUNITY", opener: "studybridgeOpenCommunityPage", scripts: ["/school-community-patch.js?v=20261007-stable-router"] },
    openClassmatesButton: { pageId: "classmatesPage", navId: "openClassmatesButton", title: "同学", eyebrow: "CLASSMATES", opener: "studybridgeOpenClassmatesPage", scripts: ["/classmates-patch.js?v=20261007-stable-router", "/classmates-request-patch.js?v=20261007-stable-router", "/classmate-chat-bubble-fix.js?v=20261007-stable-router", "/classmates-performance-patch.js?v=20261007-stable-router"] },
    openEmailReplyButton: { pageId: "emailReplyPage", navId: "openEmailReplyButton", title: "邮件助手", eyebrow: "EMAIL COACH", opener: "studybridgeOpenEmailReplyPage", scripts: ["/email-reply-patch.js?v=20261007-stable-router"] },
    openScheduleButton: { pageId: "schedulePage", navId: "openScheduleButton", title: "时间表", eyebrow: "SCHEDULE", opener: "studybridgeOpenSchedulePage", scripts: ["/schedule-patch.js?v=20261007-stable-router", "/schedule-dashboard-patch.js?v=20261007-stable-router", "/schedule-notification-patch.js?v=20261007-stable-router"] }
  };
  const selector = Object.keys(routes).map((id) => `#${id}`).join(",");

  function $(query, root = document) { return root.querySelector(query); }
  function appOpen() { const shell = $("#appShell"); return Boolean(shell && !shell.hidden); }
  function root() { const workspace = $("#workspacePage") || $(".workspace"); if (workspace && !workspace.id) workspace.id = "workspacePage"; return workspace; }
  function status(text) { const line = $("#statusLine"); if (line) line.textContent = text; }
  function remember(pageId) { try { localStorage.setItem(pageKey, pageId); localStorage.setItem("studybridgeWorkspaceMode", "student"); } catch {} }
  function forceStudent() { try { localStorage.setItem("studybridgeWorkspaceMode", "student"); } catch {} document.body.classList.remove("creator-clean-mode", "admin-boundary-active", "studybridge-page-switching", "studybridge-direct-routing"); const developer = $("#developerPanel"); if (developer) developer.hidden = true; $("#studentViewButton")?.classList.add("active"); $("#creatorViewButton")?.classList.remove("active"); }
  function active(route) { Object.values(routes).forEach((item) => { const button = item.navId ? $(`#${item.navId}`) : null; if (!button) return; const isActive = item.pageId === route.pageId; button.classList.toggle("active", isActive); button.setAttribute("aria-current", isActive ? "page" : "false"); }); }
  function chromeVisible(visible) { const workspace = root(); if (!workspace) return; chrome.forEach((query) => { const item = workspace.querySelector(`:scope > ${query}`); if (item) item.hidden = !visible; }); }

  function fallback(route) {
    if (route.pageId === "workspacePage") return root();
    const workspace = root();
    if (!workspace) return null;
    let page = $(`#${route.pageId}`);
    if (!page) {
      page = document.createElement("section");
      page.id = route.pageId;
      page.className = "studybridge-stable-page";
      page.hidden = true;
      page.innerHTML = `<header class="topbar"><div><p class="eyebrow">${route.eyebrow}</p><h2>${route.title}</h2><span>正在打开页面...</span></div><button class="ghost-button studybridge-back-to-study" type="button">返回学习区</button></header><div class="studybridge-stable-empty">正在加载 ${route.title}。</div>`;
    }
    if (page.parentElement !== workspace) workspace.appendChild(page);
    return page;
  }

  function show(route) {
    const workspace = root();
    if (!workspace) return false;
    forceStudent();
    workspace.hidden = false;
    workspace.removeAttribute("hidden");
    workspace.style.display = "";
    workspace.style.visibility = "visible";

    if (route.pageId === "workspacePage") {
      pages.forEach((id) => { const page = $(`#${id}`); if (page) page.hidden = true; });
      chromeVisible(true);
      document.body.classList.remove("studybridge-secondary-page", "study-sidebar-hidden", "studybridge-final-secondary");
      document.body.dataset.studybridgeActivePage = "workspacePage";
      active(route);
      remember("workspacePage");
      status("Workspace is ready.");
      return true;
    }

    const page = fallback(route);
    if (!page) return false;
    chromeVisible(false);
    pages.forEach((id) => {
      const item = $(`#${id}`);
      if (!item) return;
      const selected = id === route.pageId;
      item.hidden = !selected;
      if (selected) {
        item.removeAttribute("hidden");
        item.style.display = "";
        item.style.visibility = "visible";
        item.style.opacity = "1";
      }
    });
    document.body.classList.add("studybridge-secondary-page", "study-sidebar-hidden", "studybridge-final-secondary");
    document.body.dataset.studybridgeActivePage = route.pageId;
    active(route);
    remember(route.pageId);
    status(`${route.title} opened.`);
    return true;
  }

  function scriptPath(src) { return new URL(src.split("?")[0], location.href).pathname; }
  function hasScript(src) { const path = scriptPath(src); return Array.from(document.scripts).some((script) => { const current = script.getAttribute("src"); return current && new URL(current, location.href).pathname === path; }); }
  function load(src, opener) {
    if (opener && typeof window[opener] === "function") return Promise.resolve();
    const path = scriptPath(src);
    if (loaded.has(path)) return loaded.get(path);
    if (hasScript(src)) return Promise.resolve();
    const promise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.async = false;
      script.src = src;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", resolve, { once: true });
      document.body.appendChild(script);
      setTimeout(resolve, 1800);
    });
    loaded.set(path, promise);
    return promise;
  }

  async function open(id) {
    const route = routes[id];
    if (!route || !appOpen()) return;
    const current = ++token;
    show(route);
    if (route.pageId === "workspacePage") return;
    await Promise.all((route.scripts || []).map((src) => load(src, route.opener)));
    if (current !== token) return;
    if (route.opener && typeof window[route.opener] === "function") {
      try { await window[route.opener](); } catch (error) { console.warn("StudyBridge page opener failed:", error); }
    }
    for (const delay of [0, 80, 240, 600, 1200]) {
      if (current !== token) return;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      show(route);
    }
    const refresh = { schoolCommunityPage: "#refreshCommunityButton", classmatesPage: "#refreshClassmatesButton, #refreshClassmateRequestsButton", schedulePage: "#refreshScheduleButton" }[route.pageId];
    if (refresh) setTimeout(() => $(refresh)?.click(), 180);
  }

  function routeId(event) { const direct = event.target.closest?.(selector); if (direct) return direct.id; const card = event.target.closest?.("#profileCard"); if (card && !event.target.closest("input, textarea, select, form, button")) return "profileCard"; return ""; }
  function intercept(event) { const id = routeId(event); if (!id) return; event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); open(id); }

  function installStyle() {
    if ($("#studybridge-stable-router-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-stable-router-style";
    style.textContent = `
      #openProfilePageButton,#editProfileButton,#openStudyAreaButton,#openSchoolCommunityButton,#openClassmatesButton,#openEmailReplyButton,#openScheduleButton,#profileCard{pointer-events:auto!important;cursor:pointer!important}
      #openProfilePageButton *,#editProfileButton *,#openStudyAreaButton *,#openSchoolCommunityButton *,#openClassmatesButton *,#openEmailReplyButton *,#openScheduleButton *{pointer-events:none!important}
      body.studybridge-final-secondary:not(.creator-clean-mode) #workspacePage{display:block!important;visibility:visible!important;height:100vh!important;min-height:100vh!important;overflow:auto!important;background:#f4f6f9!important}
      body.studybridge-final-secondary:not(.creator-clean-mode) #workspacePage>.topbar,body.studybridge-final-secondary:not(.creator-clean-mode) #workspacePage>#developerPanel,body.studybridge-final-secondary:not(.creator-clean-mode) #workspacePage>#scheduleDashboard,body.studybridge-final-secondary:not(.creator-clean-mode) #workspacePage>#chatArea,body.studybridge-final-secondary:not(.creator-clean-mode) #workspacePage>#quickPrompts,body.studybridge-final-secondary:not(.creator-clean-mode) #workspacePage>#chatForm{display:none!important}
      body.studybridge-final-secondary:not(.creator-clean-mode) #profilePage:not([hidden]),body.studybridge-final-secondary:not(.creator-clean-mode) #schoolCommunityPage:not([hidden]),body.studybridge-final-secondary:not(.creator-clean-mode) #classmatesPage:not([hidden]),body.studybridge-final-secondary:not(.creator-clean-mode) #emailReplyPage:not([hidden]),body.studybridge-final-secondary:not(.creator-clean-mode) #schedulePage:not([hidden]){display:block!important;visibility:visible!important;opacity:1!important}
      .studybridge-stable-page{min-height:100vh;background:#f4f6f9}.studybridge-stable-empty{padding:28px;color:var(--muted)}
      #classmatesPage .direct-message-list{align-content:end!important;gap:10px!important}#classmatesPage .direct-message{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:end!important;gap:16px!important;box-sizing:border-box!important;width:fit-content!important;min-width:min(360px,72vw)!important;max-width:min(720px,86%)!important;min-height:0!important;height:auto!important;padding:9px 14px!important;line-height:1.42!important;white-space:pre-wrap!important}#classmatesPage .direct-message>span{display:block!important;min-width:0!important}#classmatesPage .direct-message.mine{justify-self:end!important}#classmatesPage .direct-message time{display:block!important;align-self:end!important;margin:0!important;white-space:nowrap!important;text-align:right!important}
    `;
    document.head.appendChild(style);
  }

  function boot() {
    root();
    installStyle();
    Object.keys(routes).forEach((id) => { const item = $(`#${id}`); if (item?.tagName === "BUTTON") item.type = "button"; });
  }

  window.addEventListener("pointerdown", intercept, true);
  window.addEventListener("click", intercept, true);
  window.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") intercept(event); }, true);
  document.addEventListener("click", (event) => { if (!event.target.closest?.(".studybridge-back-to-study")) return; event.preventDefault(); open("openStudyAreaButton"); });

  window.studybridgeFinalOpenPage = open;
  window.studybridgeDirectOpenPage = open;
  window.studybridgeOpenStudentPage = (pageId) => { const found = Object.entries(routes).find(([, route]) => route.pageId === pageId); if (found) open(found[0]); };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
  new MutationObserver(() => requestAnimationFrame(boot)).observe(document.documentElement, { childList: true, subtree: true });
})();
