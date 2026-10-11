(() => {
  const VERSION = "20261007-profile-page-1";
  if (window.__studybridgeProfilePagePatch === VERSION) return;
  window.__studybridgeProfilePagePatch = VERSION;

  let page = null;
  let currentUser = null;

  const $ = (selector, root = document) => root.querySelector(selector);

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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

  function installStyle() {
    if ($("#studybridge-profile-page-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-profile-page-style";
    style.textContent = `
      .profile-page { min-height: 100dvh; background: #f4f6f9; }
      .profile-page[hidden] { display: none !important; }
      .profile-page-body { display: grid; grid-template-columns: minmax(260px, 420px) minmax(0, 1fr); gap: 18px; padding: 22px 28px 90px; }
      .profile-page-card { border: 1px solid var(--line); border-radius: 8px; background: #fff; box-shadow: 0 12px 30px rgba(25,36,58,.05); overflow: hidden; }
      .profile-page-cover { height: 148px; background: linear-gradient(145deg, #1f3a5f, #67a782); position: relative; }
      .profile-page-avatar { position: absolute; left: 18px; bottom: -30px; display: grid; place-items: center; width: 66px; height: 66px; border: 4px solid #fff; border-radius: 8px; background: linear-gradient(145deg,#1f3a5f,#2f7d62); color: #fff; font-weight: 900; background-size: cover; background-position: center; }
      .profile-page-summary { padding: 44px 18px 18px; }
      .profile-page-summary h3 { margin: 0 0 6px; color: var(--navy); }
      .profile-page-summary p { margin: 4px 0; color: var(--muted); }
      .profile-page-form { display: grid; gap: 12px; padding: 18px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
      .profile-page-actions { display: flex; gap: 10px; justify-content: flex-end; }
      .profile-page-note { color: var(--muted); font-size: 13px; line-height: 1.5; }
      @media (max-width: 900px) { .profile-page-body { grid-template-columns: 1fr; padding: 16px 16px 80px; } }
    `;
    document.head.appendChild(style);
  }

  function ensurePage() {
    const workspace = $(".workspace");
    if (!workspace) return null;
    page = $("#profilePage");
    if (page) return page;
    page = document.createElement("section");
    page.id = "profilePage";
    page.className = "profile-page";
    page.hidden = true;
    page.innerHTML = `
      <header class="topbar">
        <div>
          <p class="eyebrow">Personal Profile</p>
          <h2>个人资料</h2>
          <span>头像、学校、专业和 SB ID 会跟随账号保存。</span>
        </div>
        <button class="ghost-button" id="backFromProfilePageButton" type="button">返回学习区</button>
      </header>
      <div class="profile-page-body">
        <section class="profile-page-card">
          <div class="profile-page-cover" id="profilePageCover"><div class="profile-page-avatar" id="profilePageAvatar">SB</div></div>
          <div class="profile-page-summary">
            <h3 id="profilePageName">StudyBridge user</h3>
            <p id="profilePageSchool">学校未填写</p>
            <p id="profilePageMajor">专业未填写</p>
            <p id="profilePageSbId">SB ID 未填写</p>
          </div>
        </section>
        <form class="profile-page-form" id="profilePageForm">
          <label>名字<input id="profilePageNameInput" placeholder="你的名字" /></label>
          <label>学校<input id="profilePageSchoolInput" placeholder="例如 University of Toronto" /></label>
          <label>专业<input id="profilePageMajorInput" placeholder="例如 Finance / Computer Science" /></label>
          <label>SB ID<input id="profilePageSbIdInput" placeholder="例如 adam2026" autocomplete="off" spellcheck="false" /></label>
          <label>头像图片链接<input id="profilePageAvatarInput" placeholder="https://..." /></label>
          <label>背景图片链接<input id="profilePageBackgroundInput" placeholder="https://..." /></label>
          <p class="profile-page-note" id="profilePageMessage">SB ID 需要唯一，别人可以用它加你为同学。</p>
          <div class="profile-page-actions">
            <button class="primary-button" type="submit">保存资料</button>
          </div>
        </form>
      </div>
    `;
    workspace.appendChild(page);
    $("#backFromProfilePageButton", page)?.addEventListener("click", () => window.studybridgeShowStudy?.());
    $("#profilePageForm", page)?.addEventListener("submit", saveProfile);
    return page;
  }

  function paint(user) {
    currentUser = user || currentUser;
    const profile = currentUser?.profile || {};
    const name = currentUser?.name || "StudyBridge user";
    const initial = name.trim().slice(0, 1).toUpperCase() || "S";
    $("#profilePageName").textContent = name;
    $("#profilePageSchool").textContent = profile.school || "学校未填写";
    $("#profilePageMajor").textContent = profile.major ? `专业 ${profile.major}` : "专业未填写";
    $("#profilePageSbId").textContent = profile.sbId ? `SB ID: ${profile.sbId}` : "SB ID 未填写";
    $("#profilePageAvatar").textContent = profile.avatarUrl ? "" : initial;
    $("#profilePageAvatar").style.backgroundImage = profile.avatarUrl ? `url("${profile.avatarUrl}")` : "";
    $("#profilePageCover").style.backgroundImage = profile.backgroundUrl ? `url("${profile.backgroundUrl}")` : "";
    $("#profilePageNameInput").value = name;
    $("#profilePageSchoolInput").value = profile.school || "";
    $("#profilePageMajorInput").value = profile.major || "";
    $("#profilePageSbIdInput").value = profile.sbId || "";
    $("#profilePageAvatarInput").value = profile.avatarUrl || "";
    $("#profilePageBackgroundInput").value = profile.backgroundUrl || "";
  }

  async function refresh() {
    const result = await api("/api/me");
    paint(result.user);
  }

  async function saveProfile(event) {
    event.preventDefault();
    const message = $("#profilePageMessage");
    const button = event.submitter || event.target.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    if (message) message.textContent = "正在保存...";
    try {
      const result = await api("/api/me/profile", {
        method: "PUT",
        body: {
          name: $("#profilePageNameInput").value,
          school: $("#profilePageSchoolInput").value,
          major: $("#profilePageMajorInput").value,
          sbId: $("#profilePageSbIdInput").value,
          avatarUrl: $("#profilePageAvatarInput").value,
          backgroundUrl: $("#profilePageBackgroundInput").value
        }
      });
      paint(result.user);
      if (message) message.textContent = "已保存。";
    } catch (error) {
      if (message) message.textContent = error.message || "保存失败，请再试一次。";
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function openProfilePage() {
    installStyle();
    ensurePage();
    await refresh().catch(() => {});
    return true;
  }

  window.studybridgeOpenProfilePage = openProfilePage;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => {
    installStyle();
    ensurePage();
  }, { once: true });
  else {
    installStyle();
    ensurePage();
  }
})();
