(() => {
  let bootFrame = 0;

  installStudentFinalRouter();

  function installStudentFinalRouter() {
    const VERSION = "20261007-inline-1";
    if (window.__studybridgeStudentFinalRouterInline === VERSION) return;
    window.__studybridgeStudentFinalRouterInline = VERSION;

    const pageKey = "studybridgeLastOpenPage";
    const pages = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
    const studyChrome = [".topbar", "#developerPanel", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"];
    const targets = {
      openStudyAreaButton: { pageId: "workspacePage" },
      openProfilePageButton: { pageId: "profilePage" },
      editProfileButton: { pageId: "profilePage" },
      profileCard: { pageId: "profilePage" },
      openSchoolCommunityButton: {
        pageId: "schoolCommunityPage",
        opener: "studybridgeOpenCommunityPage",
        scripts: ["/school-community-patch.js?v=20261007-inline"]
      },
      openClassmatesButton: {
        pageId: "classmatesPage",
        opener: "studybridgeOpenClassmatesPage",
        scripts: [
          "/classmates-patch.js?v=20261007-inline",
          "/classmates-request-patch.js?v=20261007-inline",
          "/classmate-chat-bubble-fix.js?v=20261007-inline",
          "/classmates-performance-patch.js?v=20261007-inline"
        ]
      },
      openEmailReplyButton: {
        pageId: "emailReplyPage",
        opener: "studybridgeOpenEmailReplyPage",
        scripts: ["/email-reply-patch.js?v=20261007-inline"]
      },
      openScheduleButton: {
        pageId: "schedulePage",
        opener: "studybridgeOpenSchedulePage",
        scripts: [
          "/schedule-patch.js?v=20261007-inline",
          "/schedule-dashboard-patch.js?v=20261007-inline",
          "/schedule-notification-patch.js?v=20261007-inline"
        ]
      }
    };
    const selector = Object.keys(targets).map((id) => `#${id}`).join(",");
    const scriptPromises = new Map();
    let token = 0;

    function $(query) {
      return document.querySelector(query);
    }

    function workspace() {
      const root = $("#workspacePage") || $(".workspace");
      if (root && !root.id) root.id = "workspacePage";
      return root;
    }

    function appOpen() {
      const shell = $("#appShell");
      return Boolean(shell && !shell.hidden);
    }

    function setStatus(text) {
      const status = $("#statusLine");
      if (status) status.textContent = text;
    }

    function remember(pageId) {
      try {
        localStorage.setItem(pageKey, pageId);
      } catch {
        // Ignore storage failures.
      }
    }

    function forceStudent() {
      try {
        localStorage.setItem("studybridgeWorkspaceMode", "student");
      } catch {
        // Ignore storage failures.
      }
      document.body.classList.remove("creator-clean-mode", "admin-boundary-active", "studybridge-page-switching", "studybridge-direct-routing");
      const developer = $("#developerPanel");
      if (developer) developer.hidden = true;
      $("#studentViewButton")?.classList.add("active");
      $("#creatorViewButton")?.classList.remove("active");
    }

    function setActive(pageId) {
      Object.entries(targets).forEach(([id, target]) => {
        if (id === "profileCard" || id === "editProfileButton") return;
        const button = $(`#${id}`);
        if (!button) return;
        const active = target.pageId === pageId;
        button.classList.toggle("active", active);
        button.setAttribute("aria-current", active ? "page" : "false");
      });
    }

    function hideStudyChrome(hidden) {
      const root = workspace();
      if (!root) return;
      studyChrome.forEach((query) => {
        const element = root.querySelector(`:scope > ${query}`);
        if (element) element.hidden = hidden;
      });
    }

    function moveIntoWorkspace(page) {
      const root = workspace();
      if (root && page && page.parentElement !== root) root.appendChild(page);
    }

    function showStudy() {
      const root = workspace();
      if (!root) return false;
      forceStudent();
      root.hidden = false;
      root.removeAttribute("hidden");
      root.style.display = "";
      root.style.visibility = "visible";
      pages.forEach((id) => {
        const page = $(`#${id}`);
        if (page) page.hidden = true;
      });
      hideStudyChrome(false);
      document.body.classList.remove("studybridge-secondary-page", "study-sidebar-hidden", "studybridge-final-secondary");
      document.body.dataset.studybridgeActivePage = "workspacePage";
      setActive("workspacePage");
      remember("workspacePage");
      setStatus("Workspace is ready.");
      return true;
    }

    function showPage(pageId) {
      if (pageId === "workspacePage") return showStudy();
      const root = workspace();
      const page = $(`#${pageId}`);
      if (!root || !page) return false;
      forceStudent();
      moveIntoWorkspace(page);
      root.hidden = false;
      root.removeAttribute("hidden");
      root.style.display = "";
      root.style.visibility = "visible";
      hideStudyChrome(true);
      pages.forEach((id) => {
        const item = $(`#${id}`);
        if (!item) return;
        item.hidden = id !== pageId;
        if (id === pageId) {
          item.removeAttribute("hidden");
          item.style.display = "";
          item.style.visibility = "visible";
          item.style.opacity = "1";
        }
      });
      document.body.classList.add("studybridge-secondary-page", "study-sidebar-hidden", "studybridge-final-secondary");
      document.body.dataset.studybridgeActivePage = pageId;
      setActive(pageId);
      remember(pageId);
      setStatus("Page opened.");
      return true;
    }

    function scriptPath(src) {
      return new URL(src.split("?")[0], location.href).pathname;
    }

    function hasScript(src) {
      const path = scriptPath(src);
      return Array.from(document.scripts).some((script) => {
        const current = script.getAttribute("src");
        return current && new URL(current, location.href).pathname === path;
      });
    }

    function loadScript(src, openerName) {
      if (openerName && typeof window[openerName] === "function") return Promise.resolve();
      const path = scriptPath(src);
      if (scriptPromises.has(path)) return scriptPromises.get(path);
      if (hasScript(src)) return Promise.resolve();
      const promise = new Promise((resolve) => {
        const script = document.createElement("script");
        script.async = false;
        script.src = src;
        script.addEventListener("load", resolve, { once: true });
        script.addEventListener("error", resolve, { once: true });
        document.body.appendChild(script);
        setTimeout(resolve, 1600);
      });
      scriptPromises.set(path, promise);
      return promise;
    }

    async function callOpener(target) {
      if (!target.opener || typeof window[target.opener] !== "function") return;
      try {
        await window[target.opener]();
      } catch (error) {
        console.warn("StudyBridge page opener failed:", error);
      }
    }

    function makeFallback(target) {
      if (target.pageId === "workspacePage") return workspace();
      const root = workspace();
      if (!root || $(`#${target.pageId}`)) return $(`#${target.pageId}`);
      const page = document.createElement("section");
      page.id = target.pageId;
      page.className = "studybridge-final-page";
      page.hidden = true;
      page.innerHTML = '<header class="topbar"><div><p class="eyebrow">StudyBridge</p><h2>Loading</h2><span>This page is loading.</span></div><button class="ghost-button studybridge-final-back" type="button">Back to Study Area</button></header><div class="studybridge-final-empty">Loading...</div>';
      root.appendChild(page);
      return page;
    }

    async function openById(id) {
      const target = targets[id];
      if (!target || !appOpen()) return;
      const current = ++token;
      forceStudent();
      setStatus("Opening page...");
      if (target.pageId === "workspacePage") {
        showStudy();
        return;
      }
      await Promise.all((target.scripts || []).map((src) => loadScript(src, target.opener)));
      await callOpener(target);
      if (!$(`#${target.pageId}`)) makeFallback(target);
      for (const delay of [0, 60, 160, 360, 760, 1400, 2400]) {
        if (current !== token) return;
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        showPage(target.pageId);
      }
      const refresh = {
        schoolCommunityPage: "#refreshCommunityButton",
        classmatesPage: "#refreshClassmatesButton, #refreshClassmateRequestsButton",
        schedulePage: "#refreshScheduleButton"
      }[target.pageId];
      if (refresh) setTimeout(() => $(refresh)?.click(), 180);
    }

    function findTarget(event) {
      const direct = event.target.closest?.(selector);
      if (direct) return direct.id;
      const profile = event.target.closest?.("#profileCard");
      if (profile && !event.target.closest("input, textarea, select, form")) return "profileCard";
      return "";
    }

    function intercept(event) {
      const id = findTarget(event);
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openById(id);
    }

    function interceptKey(event) {
      if (event.key === "Enter" || event.key === " ") intercept(event);
    }

    function installStyle() {
      if ($("#studybridge-final-inline-router-style")) return;
      const style = document.createElement("style");
      style.id = "studybridge-final-inline-router-style";
      style.textContent = `
        #openProfilePageButton,#editProfileButton,#openStudyAreaButton,#openSchoolCommunityButton,#openClassmatesButton,#openEmailReplyButton,#openScheduleButton,#profileCard{pointer-events:auto!important;cursor:pointer!important}
        #openProfilePageButton *,#editProfileButton *,#openStudyAreaButton *,#openSchoolCommunityButton *,#openClassmatesButton *,#openEmailReplyButton *,#openScheduleButton *{pointer-events:none!important}
        body.studybridge-final-secondary:not(.creator-clean-mode) #workspacePage{display:block!important;visibility:visible!important;min-height:100vh!important;height:100vh!important;overflow-y:auto!important;overflow-x:hidden!important;background:#f4f6f9!important}
        body.studybridge-final-secondary:not(.creator-clean-mode) #workspacePage>.topbar,
        body.studybridge-final-secondary:not(.creator-clean-mode) #workspacePage>#developerPanel,
        body.studybridge-final-secondary:not(.creator-clean-mode) #workspacePage>#scheduleDashboard,
        body.studybridge-final-secondary:not(.creator-clean-mode) #workspacePage>#chatArea,
        body.studybridge-final-secondary:not(.creator-clean-mode) #workspacePage>#quickPrompts,
        body.studybridge-final-secondary:not(.creator-clean-mode) #workspacePage>#chatForm{display:none!important}
        body.studybridge-final-secondary:not(.creator-clean-mode) #profilePage:not([hidden]),
        body.studybridge-final-secondary:not(.creator-clean-mode) #schoolCommunityPage:not([hidden]),
        body.studybridge-final-secondary:not(.creator-clean-mode) #classmatesPage:not([hidden]),
        body.studybridge-final-secondary:not(.creator-clean-mode) #emailReplyPage:not([hidden]),
        body.studybridge-final-secondary:not(.creator-clean-mode) #schedulePage:not([hidden]){display:block!important;visibility:visible!important;opacity:1!important}
        .studybridge-final-page{min-height:100vh;background:#f4f6f9}.studybridge-final-empty{padding:28px;color:var(--muted)}
      `;
      document.head.appendChild(style);
    }

    function prepare() {
      workspace();
      installStyle();
      Object.keys(targets).forEach((id) => {
        const element = $(`#${id}`);
        if (element?.tagName === "BUTTON") element.type = "button";
      });
    }

    window.addEventListener("pointerdown", intercept, true);
    window.addEventListener("click", intercept, true);
    window.addEventListener("keydown", interceptKey, true);
    document.addEventListener("click", (event) => {
      if (!event.target.closest?.(".studybridge-final-back")) return;
      event.preventDefault();
      openById("openStudyAreaButton");
    });
    window.studybridgeFinalOpenPage = openById;
    window.studybridgeOpenStudentPage = (pageId) => {
      const entry = Object.entries(targets).find(([, target]) => target.pageId === pageId);
      if (entry) openById(entry[0]);
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", prepare, { once: true });
    else prepare();
    new MutationObserver(prepare).observe(document.documentElement, { childList: true, subtree: true });
  }

  function loadScriptOnce(src) {
    const cleanSrc = src.split("?")[0];
    const registry = (window.__studybridgeLoadedScripts ||= new Set());
    const key = new URL(cleanSrc, window.location.href).pathname;
    if (
      registry.has(key) ||
      Array.from(document.scripts).some((script) => {
        const scriptSrc = script.getAttribute("src");
        return scriptSrc && new URL(scriptSrc, window.location.href).pathname === key;
      })
    ) {
      registry.add(key);
      return;
    }
    registry.add(key);
    const script = document.createElement("script");
    script.async = false;
    script.src = src;
    script.defer = true;
    script.addEventListener("error", () => registry.delete(key), { once: true });
    document.body.appendChild(script);
  }

  function loadLatestPatches() {
    loadScriptOnce("/student-final-router.js?v=20261007-1");
    loadScriptOnce("/layout-fix.js?v=20261007-6");
    loadScriptOnce("/developer-access-fix.js?v=20261007-1");
    loadScriptOnce("/study-chat-bottom-fix.js?v=20261007-6");
    loadScriptOnce("/study-scroll-hardening-patch.js?v=20261007-2");
    loadScriptOnce("/study-attachment-patch.js?v=20261007-1");
    loadScriptOnce("/assistant-typing-patch.js?v=20261007-1");
    loadScriptOnce("/admin-scroll-fix.js?v=20261007-1");
    loadScriptOnce("/classmates-performance-patch.js?v=20261007-1");
    loadScriptOnce("/no-course-notice-patch.js?v=20261007-1");
    loadScriptOnce("/math-readable-patch.js?v=20261007-1");
  }

  function installCompactStyle() {
    let style = document.querySelector("#studybridge-chat-bubble-compact-live");
    if (!style) {
      style = document.createElement("style");
      style.id = "studybridge-chat-bubble-compact-live";
      document.head.appendChild(style);
    }
    if (style.dataset.ready === "true") return;
    style.textContent = `
      #classmatesPage .direct-message-list {
        align-content: end !important;
        gap: 10px !important;
      }

      #classmatesPage .direct-message {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) auto !important;
        align-items: end !important;
        gap: 16px !important;
        box-sizing: border-box !important;
        width: fit-content !important;
        min-width: min(360px, 72vw) !important;
        max-width: min(720px, 86%) !important;
        min-height: 0 !important;
        height: auto !important;
        padding: 9px 14px !important;
        line-height: 1.42 !important;
        white-space: pre-wrap !important;
      }

      #classmatesPage .direct-message > span {
        display: block !important;
        min-width: 0 !important;
      }

      #classmatesPage .direct-message.mine {
        justify-self: end !important;
      }

      #classmatesPage .direct-message time {
        display: block !important;
        align-self: end !important;
        margin: 0 !important;
        white-space: nowrap !important;
        text-align: right !important;
      }
    `;
    style.dataset.ready = "true";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function compactMessages() {
    document.querySelectorAll("#classmatesPage .direct-message").forEach((message) => {
      if (message.dataset.compactLiveReady !== "true") {
        const time = message.querySelector("time");
        const timeHtml = time ? time.outerHTML : "";
        if (time) time.remove();
        const text = message.textContent.trim();
        message.innerHTML = `<span>${escapeHtml(text)}</span>${timeHtml}`;
        message.dataset.normalizedBubble = "true";
        message.dataset.compactLiveReady = "true";
      }
      Object.assign(message.style, {
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        alignItems: "end",
        gap: "16px",
        minHeight: "0px",
        height: "auto",
        padding: "9px 14px",
        lineHeight: "1.42"
      });
      const time = message.querySelector("time");
      if (time) {
        Object.assign(time.style, {
          margin: "0",
          alignSelf: "end",
          whiteSpace: "nowrap",
          textAlign: "right"
        });
      }
    });
  }

  function boot() {
    loadLatestPatches();
    installCompactStyle();
    compactMessages();
  }

  function scheduleBoot() {
    if (bootFrame) return;
    bootFrame = requestAnimationFrame(() => {
      bootFrame = 0;
      boot();
    });
  }

  boot();
  new MutationObserver(scheduleBoot).observe(document.body, { childList: true, subtree: true });
  setInterval(scheduleBoot, 5000);
})();
