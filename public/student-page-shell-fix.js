(() => {
  const VERSION = "20261007-1";
  if (window.__studybridgeStudentPageShellFix === VERSION) return;
  window.__studybridgeStudentPageShellFix = VERSION;

  const PAGE_KEY = "studybridgeLastOpenPage";
  const SECONDARY_PAGES = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
  const ALL_PAGES = ["workspacePage", ...SECONDARY_PAGES];
  const TARGETS = {
    openStudyAreaButton: { pageId: "workspacePage" },
    openProfilePageButton: { pageId: "profilePage", ensure: ensureProfilePage, refresh: refreshProfilePage },
    editProfileButton: { pageId: "profilePage", ensure: ensureProfilePage, refresh: refreshProfilePage },
    profileCard: { pageId: "profilePage", ensure: ensureProfilePage, refresh: refreshProfilePage },
    openSchoolCommunityButton: {
      pageId: "schoolCommunityPage",
      opener: "studybridgeOpenCommunityPage",
      scripts: ["/school-community-patch.js?v=20261007-shell"]
    },
    openClassmatesButton: {
      pageId: "classmatesPage",
      opener: "studybridgeOpenClassmatesPage",
      scripts: [
        "/classmates-patch.js?v=20261007-shell",
        "/classmates-request-patch.js?v=20261007-shell",
        "/classmate-chat-bubble-fix.js?v=20261007-shell",
        "/classmates-performance-patch.js?v=20261007-shell"
      ]
    },
    openEmailReplyButton: {
      pageId: "emailReplyPage",
      opener: "studybridgeOpenEmailReplyPage",
      scripts: ["/email-reply-patch.js?v=20261007-shell"]
    },
    openScheduleButton: {
      pageId: "schedulePage",
      opener: "studybridgeOpenSchedulePage",
      scripts: [
        "/schedule-patch.js?v=20261007-shell",
        "/schedule-dashboard-patch.js?v=20261007-shell",
        "/schedule-notification-patch.js?v=20261007-shell"
      ]
    }
  };

  const TARGET_SELECTOR = Object.keys(TARGETS)
    .map((id) => `#${id}`)
    .join(", ");

  const scriptPromises = new Map();
  let pointerOpenedAt = 0;
  let pointerButtonId = "";
  let visibleLockTimer = 0;
  let visibleLockUntil = 0;
  let visibleLockPage = "";
  let profileUser = null;

  function $(selector) {
    return document.querySelector(selector);
  }

  function workspace() {
    const element = $("#workspacePage") || $(".workspace");
    if (element && !element.id) element.id = "workspacePage";
    return element;
  }

  function appIsOpen() {
    const shell = $("#appShell");
    return Boolean(shell && !shell.hidden);
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function readProfileImageFile(input, existingValue = "") {
    const file = input?.files?.[0];
    if (!file) return Promise.resolve(existingValue || "");
    if (!String(file.type || "").startsWith("image/")) {
      return Promise.reject(new Error("请上传图片文件。"));
    }
    if (file.size > 2 * 1024 * 1024) {
      return Promise.reject(new Error("图片太大，请选择 2MB 以下图片。"));
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("图片读取失败，请重新选择。"));
      reader.readAsDataURL(file);
    });
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      method: options.method || "GET",
      headers: options.body ? { "content-type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed.");
    return payload;
  }

  function setStatus(text) {
    const status = $("#statusLine");
    if (status) status.textContent = text;
  }

  function remember(pageId) {
    try {
      localStorage.setItem(PAGE_KEY, pageId);
    } catch {
      // localStorage can be unavailable in private browsing.
    }
  }

  function forceStudentMode() {
    try {
      localStorage.setItem("studybridgeWorkspaceMode", "student");
    } catch {
      // Ignore storage failures.
    }
    document.body.classList.remove("creator-clean-mode", "admin-boundary-active");
    const developerPanel = $("#developerPanel");
    if (developerPanel) developerPanel.hidden = true;
    $("#studentViewButton")?.classList.add("active");
    $("#creatorViewButton")?.classList.remove("active");
  }

  function setActiveNav(pageId) {
    Object.entries(TARGETS).forEach(([buttonId, target]) => {
      const button = $(`#${buttonId}`);
      if (!button || buttonId === "profileCard") return;
      const active = target.pageId === pageId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
  }

  function setStudyChromeHidden(hidden) {
    const root = workspace();
    if (!root) return;
    [".topbar", "#developerPanel", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"].forEach((selector) => {
      const element = root.querySelector(`:scope > ${selector}`);
      if (element) element.hidden = hidden;
    });
  }

  function ensureSecondaryPagesHiddenExcept(pageId) {
    SECONDARY_PAGES.forEach((id) => {
      const page = $(`#${id}`);
      if (page) page.hidden = id !== pageId;
    });
  }

  function showPage(pageId, options = {}) {
    const root = workspace();
    if (!root) return false;
    const target = pageId === "workspacePage" ? root : $(`#${pageId}`);
    if (!target) return false;

    forceStudentMode();
    root.hidden = false;
    root.style.visibility = "visible";

    if (pageId === "workspacePage") {
      ensureSecondaryPagesHiddenExcept("");
      setStudyChromeHidden(false);
      document.body.classList.remove("study-sidebar-hidden", "studybridge-secondary-page");
      document.body.dataset.studybridgeActivePage = "workspacePage";
    } else {
      ensureSecondaryPagesHiddenExcept(pageId);
      target.hidden = false;
      target.removeAttribute("hidden");
      target.style.display = "";
      target.style.visibility = "visible";
      setStudyChromeHidden(true);
      document.body.classList.add("study-sidebar-hidden", "studybridge-secondary-page");
      document.body.dataset.studybridgeActivePage = pageId;
    }

    setActiveNav(pageId);
    remember(pageId);
    if (!options.silent) setStatus(pageId === "workspacePage" ? "Workspace is ready." : "Page opened.");
    return true;
  }

  function lockVisible(pageId, duration = 5000) {
    visibleLockPage = pageId;
    visibleLockUntil = Date.now() + duration;
    if (visibleLockTimer) return;
    visibleLockTimer = setInterval(() => {
      if (!visibleLockPage || Date.now() > visibleLockUntil || !appIsOpen()) {
        clearInterval(visibleLockTimer);
        visibleLockTimer = 0;
        visibleLockPage = "";
        return;
      }
      showPage(visibleLockPage, { silent: true });
    }, 90);
  }

  function scriptPath(src) {
    return new URL(src.split("?")[0], window.location.href).pathname;
  }

  function existingScript(src) {
    const path = scriptPath(src);
    return Array.from(document.scripts).find((script) => {
      const current = script.getAttribute("src");
      return current && new URL(current, window.location.href).pathname === path;
    });
  }

  function loadScript(src, openerName) {
    if (openerName && typeof window[openerName] === "function") return Promise.resolve();
    const path = scriptPath(src);
    if (scriptPromises.has(path)) return scriptPromises.get(path);

    const existing = existingScript(src);
    if (existing) {
      const promise = new Promise((resolve) => {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", resolve, { once: true });
        setTimeout(resolve, 900);
      });
      scriptPromises.set(path, promise);
      return promise;
    }

    const promise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.async = false;
      script.defer = true;
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
    const opener = target.opener ? window[target.opener] : null;
    if (typeof opener !== "function") return false;
    try {
      await opener();
      return true;
    } catch (error) {
      console.warn("StudyBridge page opener failed:", error);
      return false;
    }
  }

  async function openTarget(target, buttonId) {
    if (!target || !appIsOpen()) return;
    forceStudentMode();
    setStatus("Opening page...");

    if (target.ensure) target.ensure();
    await Promise.all((target.scripts || []).map((src) => loadScript(src, target.opener)));

    for (const delay of [0, 80, 180, 360, 720, 1200]) {
      if (delay) await wait(delay);
      if (target.ensure) target.ensure();
      await callOpener(target);
      if (showPage(target.pageId)) {
        lockVisible(target.pageId, target.pageId === "workspacePage" ? 1100 : 5200);
        if (target.refresh) target.refresh();
        refreshVisiblePage(target.pageId);
        return;
      }
    }

    setStatus(`Could not open ${buttonId || target.pageId}. Please refresh once.`);
  }

  function refreshVisiblePage(pageId) {
    const selectors = {
      schoolCommunityPage: "#refreshCommunityButton",
      classmatesPage: "#refreshClassmatesButton, #refreshClassmateRequestsButton",
      schedulePage: "#refreshScheduleButton"
    };
    const selector = selectors[pageId];
    if (!selector) return;
    setTimeout(() => {
      const button = $(selector);
      if (button && !button.disabled) button.click();
    }, 120);
  }

  function targetFromEvent(event) {
    const direct = event.target.closest?.(TARGET_SELECTOR);
    if (direct) return direct;
    const profileCard = event.target.closest?.("#profileCard");
    if (profileCard && !event.target.closest("form, input, textarea, select")) return profileCard;
    return null;
  }

  function handlePointer(event) {
    const trigger = targetFromEvent(event);
    if (!trigger) return;
    pointerOpenedAt = Date.now();
    pointerButtonId = trigger.id;
    openTarget(TARGETS[trigger.id], trigger.id);
  }

  function handleClick(event) {
    const trigger = targetFromEvent(event);
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (Date.now() - pointerOpenedAt > 600 || pointerButtonId !== trigger.id) {
      openTarget(TARGETS[trigger.id], trigger.id);
    }
  }

  function handleKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const trigger = targetFromEvent(event);
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openTarget(TARGETS[trigger.id], trigger.id);
  }

  function prepareTriggers() {
    if (!$("#openProfilePageButton") && $("#editProfileButton")) {
      const button = $("#editProfileButton");
      button.id = "openProfilePageButton";
      button.textContent = "打开";
    }
    Object.keys(TARGETS).forEach((id) => {
      const element = $(`#${id}`);
      if (!element || id === "profileCard") return;
      if (element.tagName === "BUTTON") element.type = "button";
      element.style.pointerEvents = "auto";
      element.onclick = handleClick;
      element.onpointerdown = handlePointer;
      if (element.dataset.studentShellReady === "true") return;
      element.dataset.studentShellReady = "true";
      element.addEventListener("pointerdown", handlePointer, true);
      element.addEventListener("click", handleClick, true);
      element.addEventListener("keydown", handleKeydown, true);
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
      <header class="topbar stable-page-head">
        <div>
          <p class="eyebrow">Profile</p>
          <h2>个人资料</h2>
          <span id="stableProfileStatus">学校、专业和 SB ID 会跟着账号保存。</span>
        </div>
        <button class="ghost-button" id="backFromProfileButton" type="button">返回学习区</button>
      </header>
      <div class="stable-profile-layout">
        <section class="stable-profile-card">
          <div class="stable-profile-cover" id="stableProfileCover">
            <div class="stable-profile-avatar" id="stableProfileAvatar">SB</div>
          </div>
          <h3 id="stableProfileName">StudyBridge user</h3>
          <p id="stableProfileSummary">还没有填写学校和专业。</p>
          <div class="stable-profile-facts" id="stableProfileFacts"></div>
        </section>
        <form class="stable-profile-form" id="stableProfileForm">
          <label><span>姓名</span><input id="stableProfileNameInput" autocomplete="name" /></label>
          <label><span>学校</span><input id="stableProfileSchoolInput" placeholder="例如 University of Toronto" /></label>
          <label><span>专业</span><input id="stableProfileMajorInput" placeholder="例如 Finance / Computer Science" /></label>
          <label><span>SB ID</span><input id="stableProfileSbIdInput" autocomplete="off" spellcheck="false" placeholder="例如 adam2026" /></label>
          <label><span>头像图片上传</span><input id="stableProfileAvatarFile" type="file" accept="image/*" /></label>
          <input id="stableProfileAvatarInput" type="hidden" />
          <label><span>背景图片上传</span><input id="stableProfileBackgroundFile" type="file" accept="image/*" /></label>
          <input id="stableProfileBackgroundInput" type="hidden" />
          <p class="stable-profile-help">选择图片后点击保存；不选择会保留当前图片。</p>
          <button class="primary-button" type="submit">保存资料</button>
          <p class="form-message" id="stableProfileMessage"></p>
        </form>
      </div>
    `;
    root.appendChild(page);
    page.querySelector("#backFromProfileButton")?.addEventListener("click", () => openTarget(TARGETS.openStudyAreaButton, "openStudyAreaButton"));
    page.querySelector("#stableProfileForm")?.addEventListener("submit", saveProfilePage);
    return page;
  }

  function applyUserToProfilePage(user) {
    if (!user) return;
    profileUser = user;
    const profile = user.profile || {};
    const name = user.name || "StudyBridge user";
    const school = profile.school || "";
    const major = profile.major || "";
    const sbId = profile.sbId || "";

    const avatar = $("#stableProfileAvatar");
    const cover = $("#stableProfileCover");
    if (avatar) {
      avatar.textContent = profile.avatarUrl ? "" : (name.trim().slice(0, 1).toUpperCase() || "S");
      avatar.style.backgroundImage = profile.avatarUrl ? `url("${profile.avatarUrl}")` : "";
    }
    if (cover) cover.style.backgroundImage = profile.backgroundUrl ? `url("${profile.backgroundUrl}")` : "";
    const title = $("#stableProfileName");
    if (title) title.textContent = name;
    const summary = $("#stableProfileSummary");
    if (summary) summary.textContent = [school, major].filter(Boolean).join(" · ") || "还没有填写学校和专业。";
    const facts = $("#stableProfileFacts");
    if (facts) {
      facts.innerHTML = [
        school ? `<span><b>学校</b>${escapeHtml(school)}</span>` : "",
        major ? `<span><b>专业</b>${escapeHtml(major)}</span>` : "",
        sbId ? `<span><b>SB ID:</b>${escapeHtml(sbId)}</span>` : ""
      ]
        .filter(Boolean)
        .join("");
    }

    const fieldValues = {
      stableProfileNameInput: name,
      stableProfileSchoolInput: school,
      stableProfileMajorInput: major,
      stableProfileSbIdInput: sbId,
      stableProfileAvatarInput: profile.avatarUrl || "",
      stableProfileBackgroundInput: profile.backgroundUrl || ""
    };
    Object.entries(fieldValues).forEach(([id, value]) => {
      const input = $(`#${id}`);
      if (input && document.activeElement !== input) input.value = value;
    });

    const sidebarName = $("#profileName");
    const sidebarSchool = $("#profileSchool");
    if (sidebarName) sidebarName.textContent = name;
    if (sidebarSchool) sidebarSchool.textContent = [school, major].filter(Boolean).join(" · ") || sidebarSchool.textContent;
  }

  async function refreshProfilePage() {
    ensureProfilePage();
    try {
      const result = await api("/api/me");
      applyUserToProfilePage(result.user);
    } catch (error) {
      const message = $("#stableProfileMessage");
      if (message) message.textContent = error.message;
    }
  }

  async function saveProfilePage(event) {
    event.preventDefault();
    const message = $("#stableProfileMessage");
    if (message) message.textContent = "正在保存...";
    const body = {
      name: $("#stableProfileNameInput")?.value || profileUser?.name || "",
      school: $("#stableProfileSchoolInput")?.value || "",
      major: $("#stableProfileMajorInput")?.value || "",
      sbId: $("#stableProfileSbIdInput")?.value || "",
      avatarUrl: await readProfileImageFile($("#stableProfileAvatarFile"), $("#stableProfileAvatarInput")?.value || ""),
      backgroundUrl: await readProfileImageFile($("#stableProfileBackgroundFile"), $("#stableProfileBackgroundInput")?.value || "")
    };
    try {
      const result = await api("/api/me/profile", { method: "PUT", body });
      applyUserToProfilePage(result.user);
      if (message) message.textContent = "已保存。";
    } catch (error) {
      if (message) message.textContent = error.message;
    }
  }

  function installStyle() {
    if ($("#studybridge-student-page-shell-fix-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-student-page-shell-fix-style";
    style.textContent = `
      #openProfilePageButton,
      #openStudyAreaButton,
      #openSchoolCommunityButton,
      #openClassmatesButton,
      #openEmailReplyButton,
      #openScheduleButton,
      #profileCard {
        pointer-events: auto !important;
        cursor: pointer !important;
      }

      #openProfilePageButton *,
      #openStudyAreaButton *,
      #openSchoolCommunityButton *,
      #openClassmatesButton *,
      #openEmailReplyButton *,
      #openScheduleButton * {
        pointer-events: none !important;
      }

      body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage {
        display: block !important;
        visibility: visible !important;
        height: 100dvh !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        background: #f4f6f9 !important;
      }

      body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage > .topbar,
      body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage > #developerPanel,
      body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage > #scheduleDashboard,
      body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage > #chatArea,
      body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage > #quickPrompts,
      body.studybridge-secondary-page:not(.creator-clean-mode) #workspacePage > #chatForm {
        display: none !important;
      }

      body.studybridge-secondary-page:not(.creator-clean-mode) #profilePage:not([hidden]),
      body.studybridge-secondary-page:not(.creator-clean-mode) #schoolCommunityPage:not([hidden]),
      body.studybridge-secondary-page:not(.creator-clean-mode) #classmatesPage:not([hidden]),
      body.studybridge-secondary-page:not(.creator-clean-mode) #emailReplyPage:not([hidden]),
      body.studybridge-secondary-page:not(.creator-clean-mode) #schedulePage:not([hidden]) {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
      }

      .stable-profile-page {
        min-height: 100%;
        background: #f4f6f9;
      }

      .stable-page-head {
        border-bottom: 1px solid var(--line);
      }

      .stable-profile-layout {
        display: grid;
        grid-template-columns: minmax(260px, 360px) minmax(320px, 1fr);
        gap: 18px;
        padding: 24px;
      }

      .stable-profile-card,
      .stable-profile-form {
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #fff;
        box-shadow: 0 10px 28px rgba(25, 36, 58, 0.05);
      }

      .stable-profile-card {
        padding: 16px;
      }

      .stable-profile-cover {
        display: flex;
        align-items: end;
        min-height: 150px;
        margin: -16px -16px 18px;
        padding: 16px;
        border-radius: 8px 8px 0 0;
        background: linear-gradient(135deg, #1f3a5f, #60a87f);
        background-position: center;
        background-size: cover;
      }

      .stable-profile-avatar {
        display: grid;
        place-items: center;
        width: 72px;
        height: 72px;
        border: 4px solid #fff;
        border-radius: 8px;
        background: linear-gradient(145deg, #1f3a5f, #2f7d62);
        background-position: center;
        background-size: cover;
        color: #fff;
        font-size: 28px;
        font-weight: 900;
      }

      .stable-profile-card h3 {
        margin: 0 0 6px;
        color: var(--navy);
      }

      .stable-profile-card p {
        margin: 0 0 14px;
        color: var(--muted);
      }

      .stable-profile-facts {
        display: grid;
        gap: 8px;
      }

      .stable-profile-facts span {
        display: grid;
        gap: 2px;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 10px;
        color: var(--navy);
      }

      .stable-profile-facts b {
        color: var(--muted);
        font-size: 12px;
      }

      .stable-profile-form {
        display: grid;
        gap: 12px;
        align-content: start;
        padding: 18px;
      }

      .stable-profile-form label {
        display: grid;
        gap: 6px;
        color: var(--navy);
        font-size: 13px;
        font-weight: 800;
      }

      @media (max-width: 860px) {
        .stable-profile-layout {
          grid-template-columns: 1fr;
          padding: 16px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function restoreLastPage() {
    if (!appIsOpen()) return;
    let pageId = "";
    try {
      pageId = localStorage.getItem(PAGE_KEY) || "";
    } catch {
      pageId = "";
    }
    if (!SECONDARY_PAGES.includes(pageId)) return;
    const target = Object.values(TARGETS).find((item) => item.pageId === pageId);
    if (target) openTarget(target, pageId);
  }

  function boot() {
    workspace();
    installStyle();
    prepareTriggers();
    if ($("#profilePage:not([hidden])")) refreshProfilePage();
  }

  window.studybridgeDirectOpenPage = (buttonId) => openTarget(TARGETS[buttonId], buttonId);
  window.studybridgeStableOpenPage = (buttonId) => openTarget(TARGETS[buttonId], buttonId);
  window.studybridgeOpenStudentPage = (pageId) => {
    const target = Object.values(TARGETS).find((item) => item.pageId === pageId);
    if (target) openTarget(target, pageId);
  };

  window.addEventListener("pointerdown", handlePointer, true);
  window.addEventListener("click", handleClick, true);
  window.addEventListener("keydown", handleKeydown, true);
  document.addEventListener("DOMContentLoaded", boot, { once: true });

  new MutationObserver(() => {
    boot();
    if (visibleLockPage && Date.now() < visibleLockUntil) showPage(visibleLockPage, { silent: true });
  }).observe(document.documentElement, { childList: true, subtree: true });

  boot();
  [300, 900, 1800, 3200].forEach((delay) => setTimeout(restoreLastPage, delay));
})();
