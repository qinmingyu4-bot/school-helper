(() => {
  const VERSION = "20261008-six-zone-router-equalizer-1.0.93";
  if (window.__studybridgeSixZoneRouterEqualizer === VERSION) return;
  window.__studybridgeSixZoneRouterEqualizer = VERSION;

  const ROUTES = {
    community: { icon: "社", title: "社区", subtitle: "全部、学校和专业频道" },
    classmates: { icon: "友", title: "同学", subtitle: "SB ID 申请和聊天" },
    email: { icon: "信", title: "邮件助手", subtitle: "理解邮件并生成英文回复" },
    schedule: { icon: "时", title: "时间表", subtitle: "Deadline 和课程提醒" },
    study: { icon: "学", title: "学习区", subtitle: "课程资料、AI 对话和复习计划" },
    tools: { icon: "工", title: "工具", subtitle: "SB Docs、Sheets、Slides" }
  };

  const LEGACY_SELECTORS = {
    community: ".community-entry,#openSchoolCommunityButton,[data-sb-route='community'],[data-nav='community']",
    classmates: ".classmates-entry,#openClassmatesButton,[data-sb-route='classmates'],[data-nav='classmates']",
    email: ".email-helper-entry,#openEmailReplyButton,[data-sb-route='email'],[data-nav='email']",
    schedule: ".schedule-entry,#openScheduleButton,[data-sb-route='schedule'],[data-nav='schedule']",
    study: ".study-entry,#openStudyAreaButton,#studentViewButton,[data-sb-route='study'],[data-nav='study']",
    tools: ".tools-entry,#openToolsButton,[data-sb-route='tools'],[data-nav='tools']"
  };

  const ROUTE_ORDER = ["community", "classmates", "email", "schedule", "study", "tools"];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  let lastPointerRoute = "";
  let lastPointerTime = 0;

  function workspace() {
    const root = $("#workspacePage") || $(".workspace");
    if (root && !root.id) root.id = "workspacePage";
    return root;
  }

  function setStatus(message) {
    const status = $("#statusLine");
    if (status) status.textContent = message;
  }

  function installStyles() {
    if ($("#six-zone-router-equalizer-style")) return;
    const style = document.createElement("style");
    style.id = "six-zone-router-equalizer-style";
    style.textContent = `
      #sbSixZoneNav {
        display: grid;
        gap: 10px;
        margin: 14px 0;
      }
      #sbSixZoneNav .sb-zone-card {
        width: 100%;
        min-height: 54px;
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr);
        align-items: center;
        gap: 10px;
        border: 1px solid #d4deeb;
        border-radius: 8px;
        background: #fff;
        color: #092552;
        padding: 9px 12px;
        text-align: left;
        cursor: pointer;
        font: inherit;
      }
      #sbSixZoneNav .sb-zone-card:hover,
      #sbSixZoneNav .sb-zone-card.is-active {
        border-color: #247a61;
        background: #fbfffd;
      }
      #sbSixZoneNav .sb-zone-icon {
        width: 34px;
        height: 34px;
        border-radius: 8px;
        display: grid;
        place-items: center;
        background: linear-gradient(135deg, #1f486b, #2b826b);
        color: #fff;
        font-weight: 900;
        line-height: 1;
      }
      #sbSixZoneNav strong {
        display: block;
        font-size: 16px;
        line-height: 1.15;
      }
      #sbSixZoneNav small {
        display: block;
        margin-top: 3px;
        color: #506482;
        font-size: 12px;
        line-height: 1.2;
      }
      #sbEqualZonePage {
        display: none;
        min-height: 100dvh;
        padding: 28px;
        color: #092552;
      }
      body.sb-equal-route-page #sbEqualZonePage {
        display: block;
      }
      body.sb-equal-route-page #workspacePage > .topbar,
      body.sb-equal-route-page #workspacePage > #scheduleDashboard,
      body.sb-equal-route-page #workspacePage > #chatArea,
      body.sb-equal-route-page #workspacePage > #quickPrompts,
      body.sb-equal-route-page #workspacePage > #chatForm,
      body.sb-equal-route-page #workspacePage > .composer {
        display: none !important;
      }
      .sb-equal-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        border-bottom: 1px solid #d5dfed;
        padding-bottom: 18px;
        margin-bottom: 18px;
      }
      .sb-equal-head p {
        margin: 0 0 4px;
        color: #08724f;
        font-size: 12px;
        font-weight: 900;
        text-transform: uppercase;
      }
      .sb-equal-head h2 {
        margin: 0 0 4px;
        font-size: 30px;
        line-height: 1.1;
      }
      .sb-equal-head span {
        color: #506482;
        font-size: 14px;
      }
      .sb-equal-card {
        background: #fff;
        border: 1px solid #d5dfed;
        border-radius: 8px;
        padding: 16px;
      }
      .sb-equal-tools {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }
      .sb-equal-tool {
        border: 1px solid #d5dfed;
        border-radius: 8px;
        padding: 16px;
        background: #fff;
      }
      .sb-equal-editor {
        width: 100%;
        min-height: 260px;
        box-sizing: border-box;
        border: 1px solid #cbd8e8;
        border-radius: 8px;
        padding: 14px;
        font: inherit;
        resize: vertical;
      }
      @media (max-width: 900px) {
        #sbEqualZonePage { padding: 18px; }
        .sb-equal-tools { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function removeOldNavCopies(sidebar) {
    $$(".sb-direct-nav", sidebar).forEach((node) => node.remove());
    ROUTE_ORDER.forEach((route) => {
      $$(LEGACY_SELECTORS[route], sidebar).forEach((node) => {
        if (!node.closest("#sbSixZoneNav")) node.remove();
      });
    });
  }

  function ensureNav() {
    const sidebar = $(".sidebar");
    if (!sidebar) return;
    removeOldNavCopies(sidebar);

    let nav = $("#sbSixZoneNav", sidebar);
    if (!nav) {
      nav = document.createElement("nav");
      nav.id = "sbSixZoneNav";
      nav.setAttribute("aria-label", "StudyBridge feature areas");
      nav.innerHTML = ROUTE_ORDER.map((route) => {
        const item = ROUTES[route];
        return `<button class="sb-zone-card" type="button" data-sb-zone-route="${route}">
          <span class="sb-zone-icon">${esc(item.icon)}</span>
          <span><strong>${esc(item.title)}</strong><small>${esc(item.subtitle)}</small></span>
        </button>`;
      }).join("");
      const roleSwitch = $("#roleSwitch", sidebar);
      const profile = $("#openProfilePageButton", sidebar)?.closest(".panel,.profile-card") || $(".profile-card", sidebar);
      if (roleSwitch) sidebar.insertBefore(nav, roleSwitch);
      else if (profile?.nextSibling) sidebar.insertBefore(nav, profile.nextSibling);
      else sidebar.appendChild(nav);
    }
    updateActive(localStorage.getItem("studybridgeLastRoute") || "study");
  }

  function ensureEqualPage() {
    const root = workspace();
    if (!root) return null;
    let page = $("#sbEqualZonePage", root);
    if (!page) {
      page = document.createElement("section");
      page.id = "sbEqualZonePage";
      root.appendChild(page);
    }
    return page;
  }

  function hideEqualPage() {
    const page = $("#sbEqualZonePage");
    if (page) {
      page.style.display = "none";
      page.innerHTML = "";
    }
  }

  function showStudy() {
    const root = workspace();
    if (!root) return;

    ["sb-equal-route-page", "sb-direct-mode", "studybridge-secondary-page", "study-sidebar-hidden", "creator-clean-mode", "admin-boundary-active", "sb-route-page", "sb-route-developer"].forEach((name) => document.body.classList.remove(name));
    document.body.classList.add("sb-study-mode", "sb-route-study");
    document.body.dataset.studybridgeActivePage = "workspacePage";

    const directPage = $("#sbDirectPage", root);
    const routePage = $("#studybridgeRoutePage", root);
    [directPage, routePage].forEach((page) => {
      if (!page) return;
      page.hidden = true;
      page.style.display = "none";
    });
    hideEqualPage();

    Array.from(root.children).forEach((child) => {
      if (["sbDirectPage", "studybridgeRoutePage", "sbEqualZonePage"].includes(child.id)) return;
      if (child.id === "developerPanel") {
        child.hidden = true;
        child.style.display = "none";
        return;
      }
      child.hidden = false;
      child.style.display = "";
      child.style.visibility = "";
    });

    updateActive("study");
    setStatus("Workspace is ready.");
    localStorage.setItem("studybridgeLastRoute", "study");
    localStorage.setItem("studybridge:lastRoute", "study");
  }

  function renderToolsPage() {
    const root = workspace();
    const page = ensureEqualPage();
    if (!root || !page) return;

    Array.from(root.children).forEach((child) => {
      if (child.id === "sbEqualZonePage") return;
      child.hidden = true;
      child.style.display = "none";
    });
    document.body.classList.remove("sb-study-mode", "sb-route-study", "sb-direct-mode", "sb-route-page", "sb-route-developer", "creator-clean-mode", "admin-boundary-active");
    document.body.classList.add("sb-equal-route-page", "studybridge-secondary-page");
    document.body.dataset.studybridgeActivePage = "tools";
    page.style.display = "block";
    page.hidden = false;
    page.innerHTML = `
      <header class="sb-equal-head">
        <div>
          <p>Study Tools</p>
          <h2>工具</h2>
          <span>SB Docs、SB Sheets、SB Slides 是可以手动编辑的学习工具，AI 作为旁边的辅助工具使用。</span>
        </div>
        <button class="small-button" type="button" data-sb-zone-route="study">返回学习区</button>
      </header>
      <section class="sb-equal-tools">
        <article class="sb-equal-tool">
          <h3>SB Docs</h3>
          <p>写 essay、report、reading response。</p>
          <textarea class="sb-equal-editor" placeholder="在这里开始写正文，也可以让 AI 帮你改结构、润色、生成 outline。"></textarea>
        </article>
        <article class="sb-equal-tool">
          <h3>SB Sheets</h3>
          <p>做表格、对比表、计划表。</p>
          <textarea class="sb-equal-editor" placeholder="例如：列课程计划、assignment tracker、分数计算表。"></textarea>
        </article>
        <article class="sb-equal-tool">
          <h3>SB Slides</h3>
          <p>做 PPT 大纲和 presentation 讲稿。</p>
          <textarea class="sb-equal-editor" placeholder="例如：输入主题、页数、rubric，整理每页要讲什么。"></textarea>
        </article>
      </section>
    `;
    updateActive("tools");
    setStatus("Tools opened.");
    localStorage.setItem("studybridgeLastRoute", "tools");
    localStorage.setItem("studybridge:lastRoute", "tools");
  }

  function renderFallback(route) {
    const root = workspace();
    const page = ensureEqualPage();
    const item = ROUTES[route] || ROUTES.study;
    if (!root || !page) return;
    Array.from(root.children).forEach((child) => {
      if (child.id === "sbEqualZonePage") return;
      child.hidden = true;
      child.style.display = "none";
    });
    document.body.classList.remove("sb-study-mode", "sb-route-study");
    document.body.classList.add("sb-equal-route-page", "studybridge-secondary-page");
    page.style.display = "block";
    page.hidden = false;
    page.innerHTML = `
      <header class="sb-equal-head">
        <div>
          <p>StudyBridge</p>
          <h2>${esc(item.title)}</h2>
          <span>${esc(item.subtitle)}</span>
        </div>
        <button class="small-button" type="button" data-sb-zone-route="study">返回学习区</button>
      </header>
      <section class="sb-equal-card">
        <strong>页面正在打开</strong>
        <p>如果这里停留太久，请刷新一次页面。新的统一导航已经接管了入口，不会再卡在工具区。</p>
      </section>
    `;
  }

  function updateActive(route) {
    ROUTE_ORDER.forEach((name) => {
      $$(`[data-sb-zone-route="${name}"]`).forEach((node) => {
        node.classList.toggle("is-active", name === route);
        if (name === route) node.setAttribute("aria-current", "page");
        else node.removeAttribute("aria-current");
      });
    });
  }

  function routeFromTarget(target) {
    const zoneNode = target?.closest?.("[data-sb-zone-route]");
    if (zoneNode?.dataset.sbZoneRoute) return zoneNode.dataset.sbZoneRoute;

    for (const route of ROUTE_ORDER) {
      const selector = LEGACY_SELECTORS[route];
      const node = target?.closest?.(selector);
      if (node) return route;
    }
    const profile = target?.closest?.("#profileCard,#openProfilePageButton,#editProfileButton,.profile-card,.profile-entry");
    if (profile) return "profile";
    const developer = target?.closest?.("#creatorViewButton,[data-sb-route='developer'],[data-nav='developer']");
    if (developer) return "developer";
    return "";
  }

  function openRoute(route) {
    ensureNav();
    if (route === "study") {
      showStudy();
      return;
    }
    if (route === "tools") {
      renderToolsPage();
      return;
    }

    localStorage.setItem("studybridgeLastRoute", route);
    localStorage.setItem("studybridge:lastRoute", route);
    updateActive(route);
    setStatus("Opening page...");

    try {
      if (typeof window.studybridgeDirectOpen === "function") {
        window.studybridgeDirectOpen(route);
        window.setTimeout(() => {
          updateActive(route);
          const visibleDirect = $("#sbDirectPage:not([hidden])");
          const visibleStable = $("#studybridgeRoutePage:not([hidden])");
          if (!visibleDirect && !visibleStable && !["profile", "developer"].includes(route)) renderFallback(route);
        }, 80);
        return;
      }
    } catch (error) {
      console.warn("[StudyBridge six-zone router]", error);
    }
    renderFallback(route);
  }

  function intercept(event) {
    const route = routeFromTarget(event.target);
    if (!route) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    if (event.type === "click" && route === lastPointerRoute && Date.now() - lastPointerTime < 450) return;
    if (event.type === "pointerdown") {
      lastPointerRoute = route;
      lastPointerTime = Date.now();
    }
    openRoute(route);
  }

  function init() {
    installStyles();
    ensureNav();
    window.addEventListener("pointerdown", intercept, true);
    window.addEventListener("click", intercept, true);
    window.studybridgeOpenSixZone = openRoute;
    window.setTimeout(ensureNav, 400);
    window.setTimeout(ensureNav, 1200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
