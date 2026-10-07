(() => {
  const VERSION = "20261007-final-nav-2";
  if (window.__studybridgeFinalNavigation === VERSION) return;
  window.__studybridgeFinalNavigation = VERSION;

  const routes = {
    profile: { pageId: "profilePage", selectors: ["#profileCard", "#openProfilePageButton", "#editProfileButton"], words: ["个人资料", "Profile"] },
    community: { pageId: "schoolCommunityPage", selectors: ["#openSchoolCommunityButton", ".community-entry"], words: ["社区", "Community"], opener: "studybridgeOpenCommunityPage", scripts: ["/school-community-patch.js?v=20261007-final-nav-2"] },
    classmates: { pageId: "classmatesPage", selectors: ["#openClassmatesButton", ".classmates-entry"], words: ["同学", "Classmates", "好友"], opener: "studybridgeOpenClassmatesPage", scripts: ["/classmates-request-patch.js?v=20261007-final-nav-2", "/classmate-chat-bubble-fix.js?v=20261007-final-nav-2", "/classmates-performance-patch.js?v=20261007-final-nav-2"] },
    email: { pageId: "emailReplyPage", selectors: ["#openEmailReplyButton", ".email-helper-entry"], words: ["邮件助手", "Email"], opener: "studybridgeOpenEmailReplyPage", scripts: ["/email-reply-patch.js?v=20261007-final-nav-2"] },
    schedule: { pageId: "schedulePage", selectors: ["#openScheduleButton", ".schedule-entry"], words: ["时间表", "Schedule", "Deadline"], opener: "studybridgeOpenSchedulePage", scripts: ["/schedule-patch.js?v=20261007-final-nav-2", "/schedule-dashboard-patch.js?v=20261007-final-nav-2", "/schedule-notification-patch.js?v=20261007-final-nav-2"] },
    study: { pageId: "workspacePage", selectors: ["#openStudyAreaButton", ".study-entry"], words: ["学习区", "Academic Coach"] }
  };

  const loaded = new Map();
  let navToken = 0;
  const $ = (selector, root = document) => root.querySelector(selector);
  const all = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function installStyle() {
    if ($("#studybridge-final-navigation-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-final-navigation-style";
    style.textContent = `#routerFeatureMount{display:block;min-height:100dvh;background:#f4f6f9;overflow:auto}#routerFeatureMount[hidden],#workspacePage[hidden]{display:none!important}.router-final-loading{min-height:100dvh;padding:28px;background:#f4f6f9}.router-final-loading h2{margin:0 0 8px;color:var(--navy,#0b2144)}.sidebar [data-studybridge-final-route]{cursor:pointer!important;pointer-events:auto!important}.sidebar [data-studybridge-final-route] *{pointer-events:none!important}.sidebar [data-studybridge-final-route].active{border-color:var(--green,#2f7d62)!important}`;
    document.head.appendChild(style);
  }

  function workspace() {
    const app = $("#appShell");
    if (app) { app.hidden = false; app.removeAttribute("hidden"); }
    const node = $(".workspace") || $("#workspacePage")?.parentElement;
    if (node) { node.hidden = false; node.removeAttribute("hidden"); node.style.display = ""; node.style.visibility = "visible"; node.style.opacity = "1"; }
    return node;
  }

  function mount() {
    const root = workspace();
    if (!root) return null;
    let node = $("#routerFeatureMount");
    if (!node) { node = document.createElement("section"); node.id = "routerFeatureMount"; node.hidden = true; root.appendChild(node); }
    return node;
  }

  function hideFeatures(exceptId = "") {
    Object.values(routes).forEach((route) => {
      if (route.pageId === "workspacePage") return;
      const page = $("#" + route.pageId);
      if (!page) return;
      const show = route.pageId === exceptId;
      page.hidden = !show;
      page.toggleAttribute("hidden", !show);
      if (show) { page.style.display = ""; page.style.visibility = "visible"; page.style.opacity = "1"; }
    });
  }

  function setActive(key) {
    Object.entries(routes).forEach(([routeKey, route]) => {
      route.selectors.forEach((selector) => all(selector).forEach((node) => {
        node.classList.toggle("active", routeKey === key);
        node.setAttribute("aria-current", routeKey === key ? "page" : "false");
      }));
    });
  }

  function moveIntoMount(page) {
    const holder = mount();
    if (!holder || !page) return false;
    if (page.parentElement !== holder) holder.appendChild(page);
    return true;
  }

  function ready(page) {
    if (!page) return false;
    return String(page.textContent || "").replace(/\s+/g, " ").trim().length > 8 || Boolean(page.querySelector("input,textarea,select,button,article,form"));
  }

  function showStudy() {
    const study = $("#workspacePage");
    const holder = mount();
    if (!study) return false;
    hideFeatures("");
    if (holder) { holder.hidden = true; holder.setAttribute("hidden", ""); }
    study.hidden = false; study.removeAttribute("hidden"); study.style.display = "";
    document.body.classList.remove("studybridge-secondary-page", "study-sidebar-hidden", "creator-clean-mode", "admin-boundary-active");
    document.body.dataset.studybridgeActivePage = "workspacePage";
    try { localStorage.setItem("studybridgeLastOpenPage", "workspacePage"); localStorage.setItem("studybridgeWorkspaceMode", "student"); } catch {}
    setActive("study");
    const status = $("#statusLine");
    if (status) status.textContent = "Workspace is ready.";
    return true;
  }

  function showFeature(key) {
    const route = routes[key];
    const holder = mount();
    const study = $("#workspacePage");
    const page = route && $("#" + route.pageId);
    if (!route || !holder || !study || !page || !ready(page)) return false;
    moveIntoMount(page);
    holder.hidden = false; holder.removeAttribute("hidden");
    study.hidden = true; study.setAttribute("hidden", "");
    hideFeatures(route.pageId);
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active");
    document.body.classList.add("studybridge-secondary-page", "study-sidebar-hidden");
    document.body.dataset.studybridgeActivePage = route.pageId;
    try { localStorage.setItem("studybridgeLastOpenPage", route.pageId); localStorage.setItem("studybridgeWorkspaceMode", "student"); } catch {}
    setActive(key);
    const status = $("#statusLine");
    if (status) status.textContent = "Page opened.";
    return true;
  }

  function showLoading(key) {
    const route = routes[key];
    const holder = mount();
    const study = $("#workspacePage");
    if (!route || !holder || !study) return;
    holder.hidden = false; holder.removeAttribute("hidden");
    holder.innerHTML = `<section class="router-final-loading"><p class="eyebrow">StudyBridge</p><h2>${route.words[0] || "页面"}</h2><p>正在打开...</p></section>`;
    study.hidden = true; study.setAttribute("hidden", "");
    document.body.classList.add("studybridge-secondary-page", "study-sidebar-hidden");
    setActive(key);
  }

  function loadScript(src) {
    const key = new URL(src.split("?")[0], location.href).pathname;
    if (loaded.has(key)) return loaded.get(key);
    if (Array.from(document.scripts).some((script) => {
      const current = script.getAttribute("src");
      return current && new URL(current.split("?")[0], location.href).pathname === key;
    })) {
      const promise = new Promise((resolve) => setTimeout(resolve, 120));
      loaded.set(key, promise);
      return promise;
    }
    const promise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.async = false;
      script.src = src;
      script.onload = resolve;
      script.onerror = resolve;
      document.body.appendChild(script);
      setTimeout(resolve, 2200);
    });
    loaded.set(key, promise);
    return promise;
  }

  async function openRoute(key) {
    if (key === "study") return showStudy();
    const route = routes[key];
    if (!route) return false;
    const current = ++navToken;
    installStyle();
    showLoading(key);
    await Promise.all((route.scripts || []).map(loadScript));
    if (typeof window[route.opener] === "function") {
      try { await window[route.opener](); } catch (error) { console.warn("StudyBridge page opener failed", error); }
    }
    for (const delay of [0, 120, 300, 650, 1000]) {
      if (current !== navToken) return false;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      const page = $("#" + route.pageId);
      if (page) moveIntoMount(page);
      if (showFeature(key)) return true;
    }
    const holder = mount();
    if (holder) holder.innerHTML = `<section class="router-final-loading"><p class="eyebrow">StudyBridge</p><h2>页面暂时没有打开</h2><p>请刷新一次后再试。如果还不行，我会继续修。</p></section>`;
    return false;
  }

  function routeFromTarget(target) {
    const element = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
    if (!element || element.closest("input,textarea,select,option,form")) return "";
    const tagged = element.closest("[data-studybridge-final-route],[data-studybridge-main-route]");
    if (tagged) return tagged.dataset.studybridgeFinalRoute || tagged.dataset.studybridgeMainRoute || "";
    for (const [key, route] of Object.entries(routes)) if (route.selectors.some((selector) => element.closest(selector))) return key;
    const item = element.closest(".sidebar button,.sidebar [role='button'],.community-entry,.classmates-entry,.email-helper-entry,.schedule-entry,.study-entry");
    const text = String(item?.textContent || "").replace(/\s+/g, " ");
    const found = Object.entries(routes).find(([, route]) => route.words.some((word) => text.includes(word)));
    return found ? found[0] : "";
  }

  function intercept(event) {
    const key = routeFromTarget(event.target);
    if (!key) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openRoute(key);
  }

  function bindSidebar() {
    installStyle();
    Object.entries(routes).forEach(([key, route]) => route.selectors.forEach((selector) => all(selector).forEach((node) => {
      node.dataset.studybridgeFinalRoute = key;
      node.style.cursor = "pointer";
      node.style.pointerEvents = "auto";
      if (node.tagName === "BUTTON") node.type = "button";
      if (node.dataset.studybridgeFinalBound === key) return;
      node.dataset.studybridgeFinalBound = key;
      node.addEventListener("pointerup", intercept, true);
      node.addEventListener("click", intercept, true);
      node.onclick = intercept;
    })));
  }

  window.addEventListener("pointerup", intercept, true);
  window.addEventListener("click", intercept, true);
  document.addEventListener("pointerup", intercept, true);
  document.addEventListener("click", intercept, true);
  window.studybridgeOpenMainPage = openRoute;
  window.studybridgeDirectOpen = openRoute;
  window.studybridgeFinalOpen = openRoute;

  const start = () => { bindSidebar(); setTimeout(bindSidebar, 200); setTimeout(bindSidebar, 800); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
  new MutationObserver(() => requestAnimationFrame(bindSidebar)).observe(document.documentElement, { childList: true, subtree: true });
})();
