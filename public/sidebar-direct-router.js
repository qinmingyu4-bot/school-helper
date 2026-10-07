(() => {
  const VERSION = "20261007-router-direct-1";
  if (window.__studybridgeSidebarDirectRouter === VERSION) return;
  window.__studybridgeSidebarDirectRouter = VERSION;

  const studyParts = [".topbar", "#developerPanel", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"];
  const pageIds = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage", "routerFallbackPage"];
  const loaded = new Set();

  const routes = {
    study: { pageId: "workspacePage", title: "学习区", selectors: ["#openStudyAreaButton", ".study-entry"], words: ["学习区", "Academic Coach"] },
    profile: { pageId: "profilePage", title: "个人资料", selectors: ["#profileCard", "#editProfileButton", "#openProfilePageButton"], words: ["Profile", "SB ID"], ensure: ensureProfile },
    community: { pageId: "schoolCommunityPage", title: "社区", selectors: ["#openSchoolCommunityButton", ".community-entry"], words: ["社区", "Community"], opener: "studybridgeOpenCommunityPage", scripts: ["/school-community-patch.js?v=20261007-router-direct-1"] },
    classmates: { pageId: "classmatesPage", title: "同学", selectors: ["#openClassmatesButton", ".classmates-entry"], words: ["同学", "Classmates", "SB ID 申请"], opener: "studybridgeOpenClassmatesPage", scripts: ["/classmates-request-patch.js?v=20261007-router-direct-1", "/classmate-chat-bubble-fix.js?v=20261007-router-direct-1", "/classmates-performance-patch.js?v=20261007-router-direct-1"] },
    email: { pageId: "emailReplyPage", title: "邮件助手", selectors: ["#openEmailReplyButton", ".email-helper-entry"], words: ["邮件助手", "Email"], opener: "studybridgeOpenEmailReplyPage", scripts: ["/email-reply-patch.js?v=20261007-router-direct-1"] },
    schedule: { pageId: "schedulePage", title: "时间表", selectors: ["#openScheduleButton", ".schedule-entry"], words: ["时间表", "Schedule"], opener: "studybridgeOpenSchedulePage", scripts: ["/schedule-patch.js?v=20261007-router-direct-1", "/schedule-dashboard-patch.js?v=20261007-router-direct-1", "/schedule-notification-patch.js?v=20261007-router-direct-1"] }
  };

  function $(selector, root = document) { return root.querySelector(selector); }
  function all(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }
  function html(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

  function workspace() {
    const root = $("#workspacePage") || $(".workspace");
    if (root && !root.id) root.id = "workspacePage";
    return root;
  }

  function setStatus(text) {
    const line = $("#statusLine");
    if (line) line.textContent = text;
  }

  function showStudyParts(visible) {
    const root = workspace();
    if (!root) return;
    studyParts.forEach((selector) => {
      const element = root.querySelector(`:scope > ${selector}`);
      if (element) element.hidden = !visible;
    });
  }

  function prepare() {
    const root = workspace();
    if (!root) return null;
    root.hidden = false;
    root.removeAttribute("hidden");
    root.style.display = "";
    root.style.visibility = "visible";
    root.style.opacity = "1";
    $("#developerPanel")?.setAttribute("hidden", "");
    $("#studentViewButton")?.classList.add("active");
    $("#creatorViewButton")?.classList.remove("active");
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active", "studybridge-nav-hotfix-page");
    document.documentElement.classList.remove("studybridge-restore-pending");
    return root;
  }

  function hidePages(except = "") {
    pageIds.forEach((id) => {
      const page = $(`#${id}`);
      if (!page) return;
      page.hidden = id !== except;
      if (id === except) {
        page.removeAttribute("hidden");
        page.style.display = "";
        page.style.visibility = "visible";
        page.style.opacity = "1";
      }
    });
  }

  function markActive(key) {
    Object.entries(routes).forEach(([routeKey, route]) => {
      route.selectors.forEach((selector) => {
        all(selector).forEach((button) => {
          if (selector === "#profileCard" || selector === "#editProfileButton") return;
          button.classList.toggle("active", routeKey === key);
          button.setAttribute("aria-current", routeKey === key ? "page" : "false");
        });
      });
    });
  }

  function pageReady(pageId) {
    const page = $(`#${pageId}`);
    if (!page) return false;
    const text = String(page.textContent || "").replace(/\s+/g, " ").trim();
    return text.length > 8 || Boolean(page.querySelector("button,input,textarea,select,form,article,section"));
  }

  function showRoute(key) {
    const route = routes[key];
    const root = prepare();
    if (!root || !route) return false;
    if (key === "study") {
      hidePages("");
      showStudyParts(true);
      document.body.classList.remove("studybridge-secondary-page", "study-sidebar-hidden");
      document.body.dataset.studybridgeActivePage = "workspacePage";
      markActive("study");
      setStatus("Workspace is ready.");
      localStorage.setItem("studybridgeLastOpenPage", "workspacePage");
      return true;
    }
    const page = $(`#${route.pageId}`);
    if (!page || !pageReady(route.pageId)) return false;
    if (page.parentElement !== root) root.appendChild(page);
    showStudyParts(false);
    hidePages(route.pageId);
    document.body.classList.add("studybridge-secondary-page", "study-sidebar-hidden");
    document.body.dataset.studybridgeActivePage = route.pageId;
    markActive(key);
    localStorage.setItem("studybridgeLastOpenPage", route.pageId);
    root.scrollTop = 0;
    setStatus(`${route.title} opened.`);
    return true;
  }

  function scriptKey(src) { return new URL(src.split("?")[0], location.href).pathname; }

  function loadScript(src) {
    const key = scriptKey(src);
    if (loaded.has(key) || all("script").some((script) => script.src && scriptKey(script.src) === key)) {
      loaded.add(key);
      return Promise.resolve();
    }
    loaded.add(key);
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.async = false;
      script.src = src;
      script.onload = resolve;
      script.onerror = resolve;
      document.body.appendChild(script);
      setTimeout(resolve, 2200);
    });
  }

  async function runOpener(route) {
    if (!route.opener || typeof window[route.opener] !== "function") return false;
    try {
      await window[route.opener]();
      return true;
    } catch (error) {
      console.warn("StudyBridge route failed:", error);
      return false;
    }
  }

  function fallback(key, message) {
    const route = routes[key];
    const root = prepare();
    if (!root || !route) return;
    let page = $("#routerFallbackPage");
    if (!page) {
      page = document.createElement("section");
      page.id = "routerFallbackPage";
      root.appendChild(page);
    }
    page.className = "router-fallback-page";
    page.innerHTML = `<header class="topbar"><div><p class="eyebrow">StudyBridge</p><h2>${html(route.title)}</h2><span>${html(message || "页面已打开，但功能内容还没有生成。")}</span></div><button class="ghost-button" id="routerBackToStudyButton" type="button">返回学习区</button></header><div class="router-fallback-card">如果这里还是空白，请刷新一次；这次不会再停在纯空页面。</div>`;
    $("#routerBackToStudyButton")?.addEventListener("click", () => showRoute("study"));
    showStudyParts(false);
    hidePages("routerFallbackPage");
    document.body.classList.add("studybridge-secondary-page", "study-sidebar-hidden");
    markActive(key);
  }

  async function openRoute(key) {
    const route = routes[key];
    if (!route) return;
    if (key === "study") return showRoute("study");
    prepare();
    setStatus(`Opening ${route.title}...`);
    route.ensure?.();
    await Promise.all((route.scripts || []).map(loadScript));
    route.ensure?.();
    for (const delay of [0, 100, 250, 500, 900]) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      await runOpener(route);
      route.ensure?.();
      if (showRoute(key)) return;
    }
    fallback(key, `${route.title}暂时没有生成内容。`);
  }

  function routeFromTarget(target) {
    const element = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
    if (!element || element.closest("input,textarea,select,option,form")) return "";
    for (const [key, route] of Object.entries(routes)) {
      if (route.selectors.some((selector) => element.closest(selector))) return key;
    }
    const sidebar = element.closest(".sidebar");
    if (!sidebar) return "";
    let node = element;
    while (node && node !== sidebar.parentElement) {
      const text = String(node.textContent || "").replace(/\s+/g, " ");
      const found = Object.entries(routes).find(([, route]) => route.words.some((word) => text.includes(word)));
      if (found) return found[0];
      if (node === sidebar) break;
      node = node.parentElement;
    }
    return "";
  }

  function handleClick(event) {
    const route = routeFromTarget(event.target);
    if (!route) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openRoute(route);
  }

  function ensureButton(key, afterSelector) {
    const route = routes[key];
    if (!route || $(route.selectors[0])) return;
    const after = $(afterSelector) || $("#profileCard");
    if (!after) return;
    const subtitles = { community: "全部、学校和专业频道", classmates: "SB ID 申请和聊天", email: "理解邮件并生成英文回复", schedule: "Deadline 和课程提醒", study: "课程资料、AI 对话和复习计划" };
    const icons = { community: "社", classmates: "友", email: "信", schedule: "时", study: "学" };
    const button = document.createElement("button");
    button.id = route.selectors[0].slice(1);
    button.type = "button";
    button.className = key === "community" ? "community-entry" : key === "classmates" ? "classmates-entry" : key === "email" ? "email-helper-entry" : key === "schedule" ? "schedule-entry" : "study-entry";
    button.innerHTML = `<span class="router-icon">${icons[key]}</span><span><strong>${route.title}</strong><span>${subtitles[key]}</span></span>`;
    after.insertAdjacentElement("afterend", button);
  }

  function decorate() {
    ensureButton("community", "#profileCard");
    ensureButton("classmates", "#openSchoolCommunityButton");
    ensureButton("email", "#openClassmatesButton");
    ensureButton("schedule", "#openEmailReplyButton");
    ensureButton("study", "#openScheduleButton");
    Object.entries(routes).forEach(([key, route]) => {
      route.selectors.forEach((selector) => all(selector).forEach((element) => {
        element.dataset.routerRoute = key;
        element.style.cursor = "pointer";
        element.style.pointerEvents = "auto";
        if (element.tagName === "BUTTON") element.type = "button";
      }));
    });
  }

  function ensureProfile() {
    const root = prepare();
    if (!root || $("#profilePage")) return;
    const page = document.createElement("section");
    page.id = "profilePage";
    page.className = "router-feature-page";
    page.innerHTML = `<header class="topbar"><div><p class="eyebrow">Profile</p><h2>个人资料</h2><span>学校、专业和 SB ID 会跟账号保存。</span></div><button class="ghost-button" type="button" id="profileBackToStudyButton">返回学习区</button></header><div class="router-fallback-card">Profile 页面已打开。如果编辑框没有出现，请刷新一次。</div>`;
    root.appendChild(page);
    $("#profileBackToStudyButton")?.addEventListener("click", () => showRoute("study"));
  }

  function installStyle() {
    if ($("#sidebar-direct-router-style")) return;
    const style = document.createElement("style");
    style.id = "sidebar-direct-router-style";
    style.textContent = `.sidebar [data-router-route],.community-entry,.classmates-entry,.email-helper-entry,.schedule-entry,.study-entry{cursor:pointer!important;pointer-events:auto!important}.sidebar [data-router-route] *{pointer-events:none!important}.community-entry,.classmates-entry,.email-helper-entry,.schedule-entry,.study-entry,#openSchoolCommunityButton,#openClassmatesButton,#openEmailReplyButton,#openScheduleButton,#openStudyAreaButton{display:grid!important;grid-template-columns:34px minmax(0,1fr)!important;align-items:center!important;gap:10px!important;width:100%!important;min-height:52px!important;padding:9px 12px!important;border:1px solid var(--line)!important;border-radius:8px!important;background:#fff!important;color:var(--navy)!important;text-align:left!important;font-family:inherit!important;box-shadow:0 8px 24px rgba(25,36,58,.04)!important}.community-entry.active,.classmates-entry.active,.email-helper-entry.active,.schedule-entry.active,.study-entry.active,#openSchoolCommunityButton.active,#openClassmatesButton.active,#openEmailReplyButton.active,#openScheduleButton.active,#openStudyAreaButton.active{border-color:var(--green)!important}.router-icon,.community-entry-icon,.classmates-entry-icon,.email-helper-entry-icon,.schedule-entry-icon,.study-entry-icon,#openSchoolCommunityButton>span:first-child,#openClassmatesButton>span:first-child,#openEmailReplyButton>span:first-child,#openScheduleButton>span:first-child,#openStudyAreaButton>span:first-child{display:grid!important;place-items:center!important;width:34px!important;height:34px!important;border-radius:8px!important;background:linear-gradient(145deg,#1f3a5f,#2f7d62)!important;color:#fff!important;font-size:15px!important;font-weight:900!important}.community-entry strong,.classmates-entry strong,.email-helper-entry strong,.schedule-entry strong,.study-entry strong,#openSchoolCommunityButton strong,#openClassmatesButton strong,#openEmailReplyButton strong,#openScheduleButton strong,#openStudyAreaButton strong{display:block!important;font-size:14px!important;line-height:1.15!important;color:var(--navy)!important}.community-entry span span,.classmates-entry span span,.email-helper-entry span span,.schedule-entry span span,.study-entry span span,#openSchoolCommunityButton span span,#openClassmatesButton span span,#openEmailReplyButton span span,#openScheduleButton span span,#openStudyAreaButton span span{display:block!important;font-size:12px!important;line-height:1.2!important;color:var(--muted)!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage{display:block!important;height:100dvh!important;overflow-y:auto!important;overflow-x:hidden!important;background:#f4f6f9!important;padding-bottom:48px!important}body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>.topbar,body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>#developerPanel,body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>#scheduleDashboard,body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>#chatArea,body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>#quickPrompts,body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>#chatForm{display:none!important}.router-fallback-page,.router-feature-page{min-height:100dvh;background:#f4f6f9}.router-fallback-card{margin:22px 28px 48px;padding:18px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--navy)}`;
    document.head.appendChild(style);
  }

  function boot() {
    installStyle();
    decorate();
    setTimeout(decorate, 400);
    setTimeout(decorate, 1200);
  }

  window.addEventListener("click", handleClick, true);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") handleClick(event);
  }, true);
  window.studybridgeDirectOpen = openRoute;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
  new MutationObserver(() => requestAnimationFrame(decorate)).observe(document.documentElement, { childList: true, subtree: true });
})();