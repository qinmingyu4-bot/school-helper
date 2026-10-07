(() => {
  const VERSION = "20261007-16";
  if (window.__studybridgeStudentCoreRouter === VERSION) return;
  window.__studybridgeStudentCoreRouter = VERSION;

  const PAGE_KEY = "studybridgeLastOpenPage";
  const WORKSPACE_ID = "workspacePage";
  const STUDY_SELECTORS = [".topbar", "#developerPanel", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"];
  const PAGE_IDS = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
  const loadedScripts = new Map();
  let openingPage = "";

  const routes = {
    openStudyAreaButton: { pageId: WORKSPACE_ID, title: "\u5b66\u4e60\u533a" },
    openProfilePageButton: { pageId: "profilePage", title: "Profile", ensure: ensureProfilePage, refresh: refreshProfilePage },
    editProfileButton: { pageId: "profilePage", title: "Profile", ensure: ensureProfilePage, refresh: refreshProfilePage },
    profileCard: { pageId: "profilePage", title: "Profile", ensure: ensureProfilePage, refresh: refreshProfilePage },
    openSchoolCommunityButton: {
      pageId: "schoolCommunityPage",
      title: "\u793e\u533a",
      opener: "studybridgeOpenCommunityPage",
      scripts: ["/school-community-patch.js?v=20261007-16"]
    },
    openClassmatesButton: {
      pageId: "classmatesPage",
      title: "\u540c\u5b66",
      opener: "studybridgeOpenClassmatesPage",
      scripts: [
        "/classmates-request-patch.js?v=20261007-16",
        "/classmate-chat-bubble-fix.js?v=20261007-16",
        "/classmates-performance-patch.js?v=20261007-16"
      ],
      refreshSelectors: ["#refreshClassmatesButton", "#refreshClassmateRequestsButton"]
    },
    openEmailReplyButton: {
      pageId: "emailReplyPage",
      title: "\u90ae\u4ef6\u52a9\u624b",
      opener: "studybridgeOpenEmailReplyPage",
      scripts: ["/email-reply-patch.js?v=20261007-16"]
    },
    openScheduleButton: {
      pageId: "schedulePage",
      title: "\u65f6\u95f4\u8868",
      opener: "studybridgeOpenSchedulePage",
      scripts: [
        "/schedule-patch.js?v=20261007-16",
        "/schedule-dashboard-patch.js?v=20261007-16",
        "/schedule-notification-patch.js?v=20261007-16"
      ],
      refreshSelectors: ["#refreshScheduleButton"]
    }
  };

  const textRoutes = [
    { id: "openSchoolCommunityButton", words: ["\u793e\u533a", "Community"] },
    { id: "openClassmatesButton", words: ["\u540c\u5b66", "Classmates", "SB ID"] },
    { id: "openEmailReplyButton", words: ["\u90ae\u4ef6\u52a9\u624b", "Email"] },
    { id: "openScheduleButton", words: ["\u65f6\u95f4\u8868", "Schedule"] },
    { id: "openStudyAreaButton", words: ["\u5b66\u4e60\u533a", "Academic Coach"] }
  ];

  function $(selector, root = document) { return root.querySelector(selector); }
  function appShellOpen() { const shell = $("#appShell"); return Boolean(shell && !shell.hidden); }
  function workspace() { const root = $(`#${WORKSPACE_ID}`) || $(".workspace"); if (root && !root.id) root.id = WORKSPACE_ID; return root; }
  function cleanText(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
  function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

  async function api(path, options = {}) {
    const response = await fetch(path, { method: options.method || "GET", headers: options.body ? { "content-type": "application/json" } : undefined, body: options.body ? JSON.stringify(options.body) : undefined });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  function setStatus(text) { const line = $("#statusLine"); if (line) line.textContent = text; }
  function remember(pageId) { try { localStorage.setItem(PAGE_KEY, pageId); localStorage.setItem("studybridgeWorkspaceMode", "student"); } catch {} }
  function resetScroll() { const root = workspace(); if (root) root.scrollTop = 0; try { window.scrollTo({ top: 0, left: 0, behavior: "auto" }); } catch { window.scrollTo(0, 0); } }

  function prepareStudentWorkspace() {
    const root = workspace();
    if (!root) return null;
    root.hidden = false;
    root.removeAttribute("hidden");
    root.style.display = "";
    root.style.visibility = "visible";
    root.style.opacity = "1";
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active", "studybridge-restore-pending");
    document.documentElement.classList.remove("studybridge-restore-pending");
    $("#studentViewButton")?.classList.add("active");
    $("#creatorViewButton")?.classList.remove("active");
    return root;
  }

  function setStudyVisible(visible) {
    const root = workspace();
    if (!root) return;
    STUDY_SELECTORS.forEach((selector) => { const element = root.querySelector(`:scope > ${selector}`); if (element) element.hidden = !visible; });
  }

  function hidePages(except = "") {
    PAGE_IDS.forEach((pageId) => {
      const page = $(`#${pageId}`);
      if (!page) return;
      page.hidden = pageId !== except;
      if (pageId === except) { page.removeAttribute("hidden"); page.style.display = ""; page.style.visibility = "visible"; page.style.opacity = "1"; }
    });
  }

  function markActive(pageId) {
    Object.entries(routes).forEach(([routeId, route]) => {
      const button = $(`#${routeId}`);
      if (!button || routeId === "profileCard") return;
      const active = route.pageId === pageId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
  }

  function showStudyArea() {
    const root = prepareStudentWorkspace();
    if (!root) return false;
    hidePages("");
    setStudyVisible(true);
    document.body.classList.remove("studybridge-secondary-page", "study-sidebar-hidden", "studybridge-nav-hotfix-page");
    document.body.dataset.studybridgeActivePage = WORKSPACE_ID;
    markActive(WORKSPACE_ID);
    remember(WORKSPACE_ID);
    setStatus("Workspace is ready.");
    resetScroll();
    return true;
  }

  function showPage(pageId) {
    const root = prepareStudentWorkspace();
    const page = $(`#${pageId}`);
    if (!root || !page) return false;
    if (page.parentElement !== root) root.appendChild(page);
    setStudyVisible(false);
    hidePages(pageId);
    document.body.classList.add("studybridge-secondary-page", "study-sidebar-hidden");
    document.body.classList.remove("studybridge-nav-hotfix-page");
    document.body.dataset.studybridgeActivePage = pageId;
    markActive(pageId);
    remember(pageId);
    resetScroll();
    return true;
  }

  function fallbackToStudy(message) { showStudyArea(); setStatus(message || "\u9875\u9762\u6ca1\u6709\u6253\u5f00\uff0c\u8bf7\u5237\u65b0\u4e00\u6b21\u3002"); }
  function scriptKey(src) { return new URL(src.split("?")[0], window.location.href).pathname; }

  function loadScript(src, openerName) {
    if (openerName && typeof window[openerName] === "function") return Promise.resolve();
    const key = scriptKey(src);
    if (loadedScripts.has(key)) return loadedScripts.get(key);
    if (Array.from(document.scripts).some((script) => script.src && scriptKey(script.src) === key)) return Promise.resolve();
    const promise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.async = false;
      script.src = src;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", resolve, { once: true });
      document.body.appendChild(script);
      setTimeout(resolve, 1800);
    });
    loadedScripts.set(key, promise);
    return promise;
  }

  async function runOpener(route) {
    if (!route.opener || typeof window[route.opener] !== "function") return false;
    try { await window[route.opener](); return true; } catch (error) { console.warn("StudyBridge route opener failed:", error); return false; }
  }

  function refreshPage(route) { (route.refreshSelectors || []).forEach((selector) => { const button = $(selector); if (button && !button.disabled) setTimeout(() => button.click(), 150); }); }

  async function openRoute(routeId) {
    const route = routes[routeId];
    if (!route || !appShellOpen()) return;
    if (route.pageId === WORKSPACE_ID) { showStudyArea(); return; }
    if (openingPage === route.pageId) return;
    openingPage = route.pageId;
    setStatus(`Opening ${route.title}...`);
    try {
      prepareStudentWorkspace();
      if (route.ensure) route.ensure();
      await Promise.all((route.scripts || []).map((src) => loadScript(src, route.opener)));
      if (route.ensure) route.ensure();
      await runOpener(route);
      for (const delay of [0, 120, 260, 520, 900]) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        if (route.ensure) route.ensure();
        await runOpener(route);
        if (showPage(route.pageId)) { if (route.refresh) route.refresh(); refreshPage(route); setStatus(`${route.title} opened.`); return; }
      }
      fallbackToStudy(`${route.title} \u6ca1\u6709\u52a0\u8f7d\u51fa\u6765\uff0c\u8bf7\u5237\u65b0\u4e00\u6b21\u3002`);
    } finally { openingPage = ""; }
  }

  function routeFromText(text) { const value = cleanText(text); if (!value || value.length > 180) return ""; return textRoutes.find((route) => route.words.some((word) => value.includes(word)))?.id || ""; }

  function routeFromEvent(event) {
    const direct = event.target.closest?.("#openStudyAreaButton, #openProfilePageButton, #editProfileButton, #profileCard, #openSchoolCommunityButton, #openClassmatesButton, #openEmailReplyButton, #openScheduleButton");
    if (direct?.id && routes[direct.id]) return direct.id;
    const tagged = event.target.closest?.("[data-studybridge-route]");
    if (tagged?.dataset?.studybridgeRoute && routes[tagged.dataset.studybridgeRoute]) return tagged.dataset.studybridgeRoute;
    if (!event.target.closest?.(".sidebar")) return "";
    let node = event.target.nodeType === Node.ELEMENT_NODE ? event.target : event.target.parentElement;
    while (node && node !== document.body) {
      if (node.matches?.("input, textarea, select, option") || node.closest?.("form")) return "";
      const routeId = routeFromText(node.textContent);
      if (routeId) return routeId;
      if (node.classList?.contains("sidebar")) break;
      node = node.parentElement;
    }
    return "";
  }

  function handleNavigation(event) { const routeId = routeFromEvent(event); if (!routeId) return; event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); openRoute(routeId); }

  function decorateSidebar() {
    const sidebar = $(".sidebar");
    if (!sidebar) return;
    sidebar.querySelectorAll("button, [role='button'], .profile-card, article, section, div").forEach((element) => {
      if (element.closest("form") || element.matches("input, textarea, select, option")) return;
      const routeId = element.id && routes[element.id] ? element.id : routeFromText(element.textContent);
      if (!routeId) return;
      element.dataset.studybridgeRoute = routeId;
      element.style.cursor = "pointer";
      element.style.pointerEvents = "auto";
      if (element.tagName === "BUTTON") element.type = "button";
    });
  }

  function ensureProfilePage() {
    const root = workspace();
    if (!root) return null;
    let page = $("#profilePage");
    if (page) return page;
    page = document.createElement("section");
    page.id = "profilePage";
    page.className = "stable-profile-page";
    page.hidden = true;
    page.innerHTML = `
      <header class="topbar stable-page-head"><div><p class="eyebrow">Profile</p><h2>\u4e2a\u4eba\u8d44\u6599</h2><span id="stableProfileStatus">\u5b66\u6821\u3001\u4e13\u4e1a\u548c SB ID \u4f1a\u8ddf\u7740\u8d26\u53f7\u4fdd\u5b58\u3002</span></div><button class="ghost-button" id="backFromStableProfileButton" type="button">\u8fd4\u56de\u5b66\u4e60\u533a</button></header>
      <div class="stable-profile-layout"><section class="stable-profile-card"><div class="stable-profile-cover" id="stableProfileCover"><div class="stable-profile-avatar" id="stableProfileAvatar">SB</div></div><h3 id="stableProfileName">StudyBridge user</h3><p id="stableProfileSummary">\u8fd8\u6ca1\u6709\u586b\u5199\u5b66\u6821\u548c\u4e13\u4e1a\u3002</p><div class="stable-profile-facts" id="stableProfileFacts"></div></section>
      <form class="stable-profile-form" id="stableProfileForm"><label><span>\u59d3\u540d</span><input id="stableProfileNameInput" autocomplete="name" /></label><label><span>\u5b66\u6821</span><input id="stableProfileSchoolInput" placeholder="University of Toronto" /></label><label><span>\u4e13\u4e1a</span><input id="stableProfileMajorInput" placeholder="Finance / Computer Science" /></label><label><span>SB ID</span><input id="stableProfileSbIdInput" autocomplete="off" spellcheck="false" placeholder="adam2026" /></label><label><span>\u5934\u50cf\u56fe\u7247\u94fe\u63a5</span><input id="stableProfileAvatarInput" placeholder="https://..." /></label><label><span>\u80cc\u666f\u56fe\u7247\u94fe\u63a5</span><input id="stableProfileBackgroundInput" placeholder="https://..." /></label><button class="primary-button" type="submit">\u4fdd\u5b58\u8d44\u6599</button><p class="form-message" id="stableProfileMessage"></p></form></div>`;
    root.appendChild(page);
    page.querySelector("#backFromStableProfileButton")?.addEventListener("click", () => openRoute("openStudyAreaButton"));
    page.querySelector("#stableProfileForm")?.addEventListener("submit", saveProfilePage);
    return page;
  }

  function applyProfile(user) {
    if (!user) return;
    const profile = user.profile || {};
    const name = user.name || "StudyBridge user";
    const school = profile.school || "";
    const major = profile.major || "";
    const sbId = profile.sbId || "";
    const avatar = $("#stableProfileAvatar");
    const cover = $("#stableProfileCover");
    if (avatar) { avatar.textContent = profile.avatarUrl ? "" : (name.trim().slice(0, 1).toUpperCase() || "S"); avatar.style.backgroundImage = profile.avatarUrl ? `url("${profile.avatarUrl}")` : ""; }
    if (cover) cover.style.backgroundImage = profile.backgroundUrl ? `url("${profile.backgroundUrl}")` : "";
    const title = $("#stableProfileName"); if (title) title.textContent = name;
    const summary = $("#stableProfileSummary"); if (summary) summary.textContent = [school, major].filter(Boolean).join(" \u00b7 ") || "\u8fd8\u6ca1\u6709\u586b\u5199\u5b66\u6821\u548c\u4e13\u4e1a\u3002";
    const facts = $("#stableProfileFacts");
    if (facts) facts.innerHTML = [school ? `<span><b>\u5b66\u6821</b>${escapeHtml(school)}</span>` : "", major ? `<span><b>\u4e13\u4e1a</b>${escapeHtml(major)}</span>` : "", sbId ? `<span><b>SB ID:</b>${escapeHtml(sbId)}</span>` : ""].filter(Boolean).join("");
    const values = { stableProfileNameInput: name, stableProfileSchoolInput: school, stableProfileMajorInput: major, stableProfileSbIdInput: sbId, stableProfileAvatarInput: profile.avatarUrl || "", stableProfileBackgroundInput: profile.backgroundUrl || "" };
    Object.entries(values).forEach(([id, value]) => { const input = $(`#${id}`); if (input && document.activeElement !== input) input.value = value; });
  }

  async function refreshProfilePage() { try { const result = await api("/api/me"); applyProfile(result.user); } catch (error) { const message = $("#stableProfileMessage"); if (message) message.textContent = error.message; } }
  async function saveProfilePage(event) { event.preventDefault(); const message = $("#stableProfileMessage"); if (message) message.textContent = "\u6b63\u5728\u4fdd\u5b58..."; try { const result = await api("/api/me/profile", { method: "PUT", body: { name: $("#stableProfileNameInput")?.value || "", school: $("#stableProfileSchoolInput")?.value || "", major: $("#stableProfileMajorInput")?.value || "", sbId: $("#stableProfileSbIdInput")?.value || "", avatarUrl: $("#stableProfileAvatarInput")?.value || "", backgroundUrl: $("#stableProfileBackgroundInput")?.value || "" } }); applyProfile(result.user); if (message) message.textContent = "\u5df2\u4fdd\u5b58\u3002"; } catch (error) { if (message) message.textContent = error.message; } }

  function installStyle() {
    if ($("#studybridge-student-core-router-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-student-core-router-style";
    style.textContent = `.sidebar [data-studybridge-route]{cursor:pointer!important;pointer-events:auto!important}body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage{display:block!important;overflow-y:auto!important;overflow-x:hidden!important;min-height:100vh!important;background:#f4f6f9!important}body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>.topbar,body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>#developerPanel,body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>#scheduleDashboard,body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>#chatArea,body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>#quickPrompts,body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage>#chatForm{display:none!important}body.studybridge-secondary-page:not(.creator-clean-mode) #profilePage:not([hidden]),body.studybridge-secondary-page:not(.creator-clean-mode) #schoolCommunityPage:not([hidden]),body.studybridge-secondary-page:not(.creator-clean-mode) #classmatesPage:not([hidden]),body.studybridge-secondary-page:not(.creator-clean-mode) #emailReplyPage:not([hidden]),body.studybridge-secondary-page:not(.creator-clean-mode) #schedulePage:not([hidden]){display:block!important;visibility:visible!important;opacity:1!important}.stable-profile-page{min-height:100%;background:#f4f6f9}.stable-profile-layout{display:grid;grid-template-columns:minmax(260px,360px) minmax(320px,1fr);gap:18px;padding:24px}.stable-profile-card,.stable-profile-form{border:1px solid var(--line);border-radius:8px;background:#fff;box-shadow:0 10px 28px rgba(25,36,58,.05)}.stable-profile-card{padding:16px}.stable-profile-cover{display:flex;align-items:end;min-height:150px;margin:-16px -16px 18px;padding:16px;border-radius:8px 8px 0 0;background:linear-gradient(135deg,#1f3a5f,#60a87f);background-position:center;background-size:cover}.stable-profile-avatar{display:grid;place-items:center;width:72px;height:72px;border:4px solid #fff;border-radius:8px;background:linear-gradient(145deg,#1f3a5f,#2f7d62);background-position:center;background-size:cover;color:#fff;font-size:28px;font-weight:900}.stable-profile-form{display:grid;gap:12px;align-content:start;padding:18px}.stable-profile-form label{display:grid;gap:6px;color:var(--navy);font-size:13px;font-weight:800}@media(max-width:860px){.stable-profile-layout{grid-template-columns:1fr;padding:16px}}`;
    document.head.appendChild(style);
  }

  function restoreLastPage() { let pageId = ""; try { pageId = localStorage.getItem(PAGE_KEY) || ""; } catch {} const routeId = Object.keys(routes).find((id) => routes[id].pageId === pageId); if (routeId && pageId !== WORKSPACE_ID) openRoute(routeId); }
  function boot() { workspace(); installStyle(); decorateSidebar(); }

  window.addEventListener("click", handleNavigation, true);
  window.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") handleNavigation(event); }, true);
  window.studybridgeOpenCorePage = openRoute;
  window.studybridgeOpenStudentPage = (pageId) => { const routeId = Object.keys(routes).find((id) => routes[id].pageId === pageId); if (routeId) openRoute(routeId); };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { boot(); setTimeout(restoreLastPage, 350); }, { once: true });
  else { boot(); setTimeout(restoreLastPage, 350); }
  new MutationObserver(() => requestAnimationFrame(decorateSidebar)).observe(document.body, { childList: true, subtree: true });
})();
