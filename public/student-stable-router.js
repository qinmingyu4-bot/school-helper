(() => {
  const VERSION = "20261008-stable-router-1.0.70";
  if (window.__studybridgeStableRouter === VERSION) return;
  window.__studybridgeStableRouter = VERSION;

  const ROUTES = {
    profile: ["#profileCard", "#editProfileButton", "#openProfilePageButton", ".profile-card"],
    community: ["#openSchoolCommunityButton", ".community-entry", "[data-nav='community']"],
    classmates: ["#openClassmatesButton", ".classmates-entry", "[data-nav='classmates']"],
    email: ["#openEmailReplyButton", ".email-helper-entry", "[data-nav='email']"],
    schedule: ["#openScheduleButton", ".schedule-entry", "[data-nav='schedule']"],
    study: ["#openStudyAreaButton", ".study-entry", "#studentViewButton", "[data-nav='study']"],
    developer: ["#creatorViewButton", "[data-nav='developer']"]
  };

  let routeToken = 0;
  let currentRoute = "";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const text = (value) => String(value ?? "");
  const esc = (value) => text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  async function api(path, options = {}) {
    const response = await fetch(path, {
      method: options.method || "GET",
      headers: options.body ? { "content-type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || "请求失败");
    return data;
  }

  function workspace() {
    const root = $("#workspacePage") || $(".workspace");
    if (root && !root.id) root.id = "workspacePage";
    return root;
  }

  function routePage() {
    const root = workspace();
    if (!root) return null;
    let page = $("#studybridgeRoutePage");
    if (!page) {
      page = document.createElement("section");
      page.id = "studybridgeRoutePage";
      page.className = "sb-route-page";
      root.appendChild(page);
    }
    return page;
  }

  function setStatus(message) {
    const status = $("#statusLine");
    if (status) status.textContent = message || "Workspace is ready.";
  }

  function installStyles() {
    if ($("#studybridge-stable-router-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-stable-router-style";
    style.textContent = `
      .sb-route-page{display:none;min-height:100vh;padding:28px;background:#f4f7fb;color:#092552;overflow:auto}
      body.sb-route-page #workspacePage,
      body.sb-route-developer #workspacePage{
        display:block!important;
        height:100dvh!important;
        max-height:100dvh!important;
        overflow-y:auto!important;
        overflow-x:hidden!important;
        min-height:0!important;
      }
      body.sb-route-page #studybridgeRoutePage,
      body.sb-route-developer #studybridgeRoutePage{
        display:block!important;
        min-height:calc(100dvh - 56px)!important;
      }
      body.sb-route-page #workspacePage>.topbar,
      body.sb-route-page #workspacePage>#scheduleDashboard,
      body.sb-route-page #workspacePage>#chatArea,
      body.sb-route-page #workspacePage>#quickPrompts,
      body.sb-route-page #workspacePage>#chatForm,
      body.sb-route-page #workspacePage>.composer,
      body.sb-route-developer #workspacePage>.topbar,
      body.sb-route-developer #workspacePage>#scheduleDashboard,
      body.sb-route-developer #workspacePage>#chatArea,
      body.sb-route-developer #workspacePage>#quickPrompts,
      body.sb-route-developer #workspacePage>#chatForm,
      body.sb-route-developer #workspacePage>.composer{display:none!important}
      body.sb-route-study #workspacePage{
        display:grid!important;
        grid-template-rows:auto auto minmax(0,1fr) auto auto!important;
        height:100dvh!important;
        max-height:100dvh!important;
        overflow:hidden!important;
      }
      body.sb-route-study #studybridgeRoutePage{display:none!important}
      body.sb-route-study #workspacePage>.topbar,
      body.sb-route-study #workspacePage>#chatArea,
      body.sb-route-study #workspacePage>#quickPrompts,
      body.sb-route-study #workspacePage>#chatForm,
      body.sb-route-study #workspacePage>.composer{display:flex}
      body.sb-route-study #chatArea{display:block!important}
      body.sb-route-study #developerPanel{display:none!important}
      body.sb-route-developer #developerPanel{display:none!important}
      .sb-page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:22px 26px;background:#fff;border:1px solid #d5dfed;border-radius:8px;margin-bottom:18px}
      .sb-page-head h2{margin:4px 0 4px;font-size:28px;line-height:1.1}
      .sb-eyebrow{margin:0;color:#08724f;font-size:12px;text-transform:uppercase;font-weight:800}
      .sb-subtle{color:#506482;font-size:14px;margin:0}
      .sb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
      .sb-card{background:#fff;border:1px solid #d5dfed;border-radius:8px;padding:16px;box-shadow:0 8px 24px rgba(9,37,82,.04)}
      .sb-card h3{margin:0 0 12px;font-size:20px}.sb-card h4{margin:12px 0 8px}
      .sb-row{display:flex;gap:10px;align-items:center}.sb-row.wrap{flex-wrap:wrap}.sb-row.between{justify-content:space-between}
      .sb-input,.sb-textarea,.sb-select{width:100%;box-sizing:border-box;border:1px solid #cbd8e8;border-radius:8px;padding:12px 14px;font:inherit;background:#fff;color:#092552}
      .sb-textarea{min-height:130px;resize:vertical}
      .sb-button{border:1px solid #cbd8e8;border-radius:8px;background:#fff;color:#092552;font-weight:800;padding:10px 14px;cursor:pointer;white-space:nowrap}
      .sb-button.primary{background:linear-gradient(135deg,#21466d,#2a856b);color:#fff;border-color:transparent}
      .sb-button:disabled{opacity:.55;cursor:not-allowed}
      .sb-list{display:grid;gap:10px}.sb-list-item{border:1px solid #d5dfed;border-radius:8px;padding:12px;background:#fbfdff}
      .sb-muted{color:#506482;font-size:13px}.sb-error{color:#b42318}.sb-ok{color:#08724f}.sb-pill{border:1px solid #d5dfed;border-radius:999px;padding:4px 10px;background:#eef4ff;font-size:12px}
      .sb-profile-cover{height:160px;border-radius:8px;background:linear-gradient(135deg,#284c73,#61a483);margin-bottom:-42px}
      .sb-avatar{width:84px;height:84px;border-radius:10px;border:4px solid #fff;background:#1f6d63;color:#fff;display:grid;place-items:center;font-size:28px;font-weight:900;margin-left:18px;box-shadow:0 12px 28px rgba(0,0,0,.14);overflow:hidden}
      .sb-avatar img{width:100%;height:100%;object-fit:cover}
      .sb-profile-main{padding-top:52px}
      .sb-chat-box{height:430px;overflow:auto;border:1px solid #d5dfed;border-radius:8px;background:#fff;padding:14px;display:flex;flex-direction:column;gap:10px}
      .sb-bubble{max-width:72%;border:1px solid #cbd8e8;border-radius:8px;padding:10px 12px;background:#fff}.sb-bubble.me{align-self:flex-end;background:#eef4ff}
      .sb-channel{border:1px solid #d5dfed;border-radius:8px;padding:12px;background:#fff;cursor:pointer}.sb-channel.active{border-color:#2a856b;background:#f4fbf8}
      .sb-deadline{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center}
      @media(max-width:900px){.sb-route-page{padding:16px}.sb-grid{grid-template-columns:1fr}.sb-page-head{flex-direction:column}.sb-bubble{max-width:92%}}
    `;
    document.head.appendChild(style);
  }

  function updateActive(route) {
    currentRoute = route;
    $$("[data-route], .community-entry, .classmates-entry, .email-helper-entry, .schedule-entry, .study-entry, .profile-card").forEach((node) => {
      node.classList.remove("active");
      node.removeAttribute("aria-current");
    });
    const selectors = ROUTES[route] || [];
    selectors.forEach((selector) => {
      $$(selector).forEach((node) => {
        node.classList.add("active");
        node.setAttribute("aria-current", "page");
      });
    });
  }

  function hideStudyChrome() {
    const panel = $("#developerPanel");
    if (panel) panel.hidden = true;
  }

  function showStudy() {
    document.body.classList.remove("sb-route-page", "sb-route-developer", "studybridge-secondary-page", "study-sidebar-hidden");
    document.body.classList.add("sb-route-study");
    document.body.dataset.studybridgeActivePage = "workspacePage";
    const page = routePage();
    if (page) page.hidden = true;
    hideStudyChrome();
    updateActive("study");
    setStatus("Workspace is ready.");
    try { localStorage.setItem("studybridge:lastRoute", "study"); } catch {}
  }

  function showPage(route, title, eyebrow, subtitle) {
    const page = routePage();
    if (!page) return null;
    document.body.classList.remove("sb-route-study", "sb-route-developer", "creator-clean-mode", "admin-boundary-active");
    document.body.classList.add("sb-route-page", "studybridge-secondary-page");
    document.body.dataset.studybridgeActivePage = "studybridgeRoutePage";
    page.hidden = false;
    page.innerHTML = `
      <header class="sb-page-head">
        <div>
          <p class="sb-eyebrow">${esc(eyebrow)}</p>
          <h2>${esc(title)}</h2>
          <p class="sb-subtle">${esc(subtitle || "")}</p>
        </div>
        <button class="sb-button" type="button" data-route="study">返回学习区</button>
      </header>
      <div class="sb-card"><p class="sb-muted">正在打开...</p></div>
    `;
    hideStudyChrome();
    updateActive(route);
    setStatus("Page opened.");
    try { localStorage.setItem("studybridge:lastRoute", route); } catch {}
    return page;
  }

  function errorBlock(error) {
    return `<p class="sb-error">${esc(error?.message || error || "页面加载失败")}</p>`;
  }

  async function renderProfile(token) {
    const page = showPage("profile", "个人资料", "PROFILE", "头像、背景、学校、专业和 SB ID 都在这里管理。");
    if (!page) return;
    try {
      const { user } = await api("/api/me");
      if (token !== routeToken) return;
      const profile = user.profile || {};
      const school = profile.school || user.school || "";
      const major = profile.major || user.major || "";
      const sbid = profile.sbId || user.sbId || "";
      const avatar = profile.avatarUrl || user.avatarUrl || "";
      const cover = profile.backgroundUrl || user.backgroundUrl || "";
      page.innerHTML = `
        <header class="sb-page-head">
          <div><p class="sb-eyebrow">PROFILE</p><h2>个人资料</h2><p class="sb-subtle">这些信息会跟着账号保存。</p></div>
          <button class="sb-button" type="button" data-route="study">返回学习区</button>
        </header>
        <div class="sb-grid">
          <section class="sb-card">
            <div class="sb-profile-cover" style="${cover ? `background-image:url('${esc(cover)}');background-size:cover;background-position:center;` : ""}"></div>
            <div class="sb-avatar">${avatar ? `<img src="${esc(avatar)}" alt="">` : esc((user.name || "S").slice(0,1).toUpperCase())}</div>
            <div class="sb-profile-main">
              <h3>${esc(user.name || "StudyBridge user")}</h3>
              <p class="sb-subtle">${esc(school || "未填写学校")}${major ? ` · ${esc(major)}` : ""}</p>
              <p><strong>SB ID:</strong> ${esc(sbid || "未设置")}</p>
            </div>
          </section>
          <form class="sb-card" id="sbProfileForm">
            <h3>编辑资料</h3>
            <label>名字<input class="sb-input" name="name" value="${esc(user.name || "")}"></label><br>
            <label>学校<input class="sb-input" name="school" list="sbSchools" value="${esc(school)}"></label><br>
            <label>专业<input class="sb-input" name="major" list="sbMajors" value="${esc(major)}"></label><br>
            <label>SB ID<input class="sb-input" name="sbId" value="${esc(sbid)}" placeholder="例如 adam2026"></label><br>
            <label>头像图片链接<input class="sb-input" name="avatarUrl" value="${esc(avatar)}"></label><br>
            <label>背景图片链接<input class="sb-input" name="backgroundUrl" value="${esc(cover)}"></label><br>
            <button class="sb-button primary" type="submit">保存资料</button>
            <span class="sb-muted" id="sbProfileMsg"></span>
          </form>
        </div>
        <datalist id="sbSchools">${schoolOptions().map((item) => `<option value="${esc(item)}"></option>`).join("")}</datalist>
        <datalist id="sbMajors">${majorOptions().map((item) => `<option value="${esc(item)}"></option>`).join("")}</datalist>
      `;
      $("#sbProfileForm", page)?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const body = Object.fromEntries(form.entries());
        $("#sbProfileMsg", page).textContent = "保存中...";
        try {
          await api("/api/me/profile", { method: "PUT", body });
          $("#sbProfileMsg", page).textContent = "已保存";
          renderProfile(++routeToken);
        } catch (error) {
          $("#sbProfileMsg", page).textContent = error.message;
        }
      });
    } catch (error) {
      page.innerHTML += errorBlock(error);
    }
  }

  async function renderCommunity(token, channel = "all") {
    const page = showPage("community", "社区", "COMMUNITY", "所有人可见，也可以按学校或专业频道查看。");
    if (!page) return;
    try {
      const data = await api("/api/community").catch(() => ({ posts: [], channels: [] }));
      if (token !== routeToken) return;
      const channels = normalizeChannels(data.channels);
      page.innerHTML = `
        <header class="sb-page-head">
          <div><p class="sb-eyebrow">COMMUNITY</p><h2>社区</h2><p class="sb-subtle">全部社区、学校社区、专业社区都可以进入查看。</p></div>
          <button class="sb-button" type="button" data-route="study">返回学习区</button>
        </header>
        <div class="sb-grid">
          <section class="sb-card">
            <h3>频道</h3>
            <div class="sb-list" id="sbChannels">
              ${channels.map((item) => `<button class="sb-channel ${item.id === channel ? "active" : ""}" data-channel="${esc(item.id)}"><strong>${esc(item.name)}</strong><br><span class="sb-muted">${esc(item.description)}</span></button>`).join("")}
            </div>
          </section>
          <section class="sb-card">
            <h3>发一条动态</h3>
            <textarea class="sb-textarea" id="sbPostText" placeholder="写下想和同学讨论的内容"></textarea>
            <br><br><button class="sb-button primary" id="sbPostButton" type="button">发布</button>
            <p class="sb-muted" id="sbPostMsg"></p>
          </section>
        </div>
        <section class="sb-card" style="margin-top:16px">
          <h3>${esc(channels.find((item) => item.id === channel)?.name || "全部社区")}</h3>
          <div class="sb-list" id="sbPosts">${renderPosts(data.posts || [])}</div>
        </section>
      `;
      $$("#sbChannels [data-channel]", page).forEach((button) => {
        button.addEventListener("click", () => renderCommunity(++routeToken, button.dataset.channel));
      });
      $("#sbPostButton", page)?.addEventListener("click", async () => {
        const content = $("#sbPostText", page)?.value.trim();
        if (!content) return;
        $("#sbPostMsg", page).textContent = "发布中...";
        try {
          await api("/api/community/posts", { method: "POST", body: { channel, content } });
          renderCommunity(++routeToken, channel);
        } catch (error) {
          $("#sbPostMsg", page).textContent = error.message;
        }
      });
    } catch (error) {
      page.innerHTML += errorBlock(error);
    }
  }

  function renderPosts(posts) {
    if (!posts.length) return `<p class="sb-muted">这个频道暂时还没有内容。</p>`;
    return posts.map((post) => `
      <article class="sb-list-item">
        <strong>${esc(post.authorName || post.author || "StudyBridge user")}</strong>
        <p>${esc(post.content || post.text || "")}</p>
        <span class="sb-muted">${esc(post.channel || "")} ${esc(post.createdAt || "")}</span>
      </article>
    `).join("");
  }

  async function renderClassmates(token, selectedId = "") {
    const page = showPage("classmates", "同学", "CLASSMATES", "用 SB ID 发送好友申请，通过后可以聊天。");
    if (!page) return;
    try {
      const data = await api("/api/classmates").catch(() => ({ classmates: [], incoming: [], outgoing: [], schoolmates: [] }));
      if (token !== routeToken) return;
      const friends = data.classmates || data.friends || [];
      const selected = friends.find((item) => String(item.id) === String(selectedId)) || friends[0] || null;
      page.innerHTML = `
        <header class="sb-page-head">
          <div><p class="sb-eyebrow">CLASSMATES</p><h2>同学</h2><p class="sb-subtle">已添加 ${friends.length} 位同学。</p></div>
          <button class="sb-button" type="button" data-route="study">返回学习区</button>
        </header>
        <div class="sb-grid">
          <section class="sb-card">
            <h3>添加同学</h3>
            <div class="sb-row"><input class="sb-input" id="sbFriendIdInput" placeholder="输入 SB ID，例如 adam2026"><button class="sb-button" id="sbFriendRequestButton">发送申请</button></div>
            <p class="sb-muted" id="sbFriendMsg"></p>
            <button class="sb-button" id="sbRequestsToggle">申请列表 ${data.incoming?.length ? "●" : ""}</button>
            <div class="sb-list" id="sbRequests" hidden>${renderRequests(data.incoming || [])}</div>
            <h3>同学列表</h3>
            <div class="sb-list">${friends.length ? friends.map((user) => `<button class="sb-channel ${selected?.id === user.id ? "active" : ""}" data-friend="${esc(user.id)}"><strong>${esc(user.name || user.sbId || "同学")}</strong><br><span class="sb-muted">SB ID: ${esc(user.sbId || "")}</span></button>`).join("") : `<p class="sb-muted">还没有同学。</p>`}</div>
          </section>
          <section class="sb-card">
            <div class="sb-row between"><div><p class="sb-eyebrow">DIRECT CHAT</p><h3>${esc(selected?.name || "请选择一位同学")}</h3></div><button class="sb-button" id="sbChatRefresh">刷新</button></div>
            <div class="sb-chat-box" id="sbClassmateChat">${selected ? "<p class='sb-muted'>正在读取聊天...</p>" : "<p class='sb-muted'>选择同学后这里会显示聊天。</p>"}</div>
            <div class="sb-row" style="margin-top:12px"><input class="sb-input" id="sbChatInput" placeholder="写一句话给同学"><button class="sb-button primary" id="sbChatSend">发送</button></div>
          </section>
        </div>
      `;
      $("#sbFriendRequestButton", page)?.addEventListener("click", async () => {
        const sbId = $("#sbFriendIdInput", page)?.value.trim();
        if (!sbId) return;
        $("#sbFriendMsg", page).textContent = "发送中...";
        try {
          await api("/api/classmates/requests", { method: "POST", body: { sbId } });
          $("#sbFriendMsg", page).textContent = "申请已发送，等待对方同意。";
        } catch (error) {
          $("#sbFriendMsg", page).textContent = error.message;
        }
      });
      $("#sbRequestsToggle", page)?.addEventListener("click", () => {
        const box = $("#sbRequests", page);
        if (box) box.hidden = !box.hidden;
      });
      $$("#sbRequests [data-request-action]", page).forEach((button) => {
        button.addEventListener("click", async () => {
          await api(`/api/classmate-requests/${button.dataset.requestId}`, { method: "POST", body: { action: button.dataset.requestAction } });
          renderClassmates(++routeToken, selected?.id || "");
        });
      });
      $("[data-friend]", page)?.focus?.();
      $$("[data-friend]", page).forEach((button) => {
        button.addEventListener("click", () => renderClassmates(++routeToken, button.dataset.friend));
      });
      async function loadMessages() {
        if (!selected) return;
        const box = $("#sbClassmateChat", page);
        try {
          const messages = await api(`/api/classmates/${selected.id}/messages`);
          box.innerHTML = (messages.messages || []).map((msg) => `<div class="sb-bubble ${msg.mine ? "me" : ""}">${esc(msg.content || msg.text || "")}<br><span class="sb-muted">${esc(msg.createdAt || "")}</span></div>`).join("") || "<p class='sb-muted'>还没有聊天记录。</p>";
          box.scrollTop = box.scrollHeight;
        } catch (error) {
          box.innerHTML = errorBlock(error);
        }
      }
      $("#sbChatRefresh", page)?.addEventListener("click", loadMessages);
      $("#sbChatSend", page)?.addEventListener("click", async () => {
        if (!selected) return;
        const input = $("#sbChatInput", page);
        const content = input?.value.trim();
        if (!content) return;
        input.value = "";
        await api(`/api/classmates/${selected.id}/messages`, { method: "POST", body: { content } });
        loadMessages();
      });
      loadMessages();
    } catch (error) {
      page.innerHTML += errorBlock(error);
    }
  }

  function renderRequests(requests) {
    if (!requests.length) return `<p class="sb-muted">还没有好友申请。</p>`;
    return requests.map((request) => `
      <article class="sb-list-item">
        <strong>${esc(request.name || request.fromName || request.sbId || "同学")}</strong>
        <div class="sb-row">
          <button class="sb-button primary" data-request-id="${esc(request.id)}" data-request-action="accept">通过</button>
          <button class="sb-button" data-request-id="${esc(request.id)}" data-request-action="ignore">忽略</button>
        </div>
      </article>
    `).join("");
  }

  async function renderEmail(token) {
    const page = showPage("email", "邮件回复助手", "EMAIL COACH", "粘贴邮件内容，生成中文解读和英文回复。");
    if (!page) return;
    page.innerHTML = `
      <header class="sb-page-head">
        <div><p class="sb-eyebrow">EMAIL COACH</p><h2>邮件回复助手</h2><p class="sb-subtle">理解邮件并生成英文回复。</p></div>
        <button class="sb-button" type="button" data-route="study">返回学习区</button>
      </header>
      <div class="sb-grid">
        <section class="sb-card">
          <h3>收到的邮件</h3>
          <textarea class="sb-textarea" id="sbEmailText" placeholder="把老师、TA、学校办公室或同学发来的邮件粘贴在这里"></textarea>
          <h4>你想怎么回复</h4>
          <textarea class="sb-textarea" id="sbEmailIntent" placeholder="例如：解释我会晚交 / 约 meeting time / 问清楚作业要求"></textarea>
          <br><br><button class="sb-button primary" id="sbEmailGenerate">生成回复</button>
          <span class="sb-muted" id="sbEmailMsg"></span>
        </section>
        <section class="sb-card"><h3>建议回复</h3><div id="sbEmailDraft" class="sb-list-item">生成后会显示在这里。</div></section>
      </div>
    `;
    $("#sbEmailGenerate", page)?.addEventListener("click", async () => {
      const email = $("#sbEmailText", page)?.value.trim();
      const intent = $("#sbEmailIntent", page)?.value.trim();
      $("#sbEmailMsg", page).textContent = "生成中...";
      try {
        const result = await api("/api/email/reply", { method: "POST", body: { email, intent } });
        $("#sbEmailDraft", page).textContent = result.reply || result.text || "没有生成内容。";
        $("#sbEmailMsg", page).textContent = "已生成";
      } catch (error) {
        $("#sbEmailDraft", page).innerHTML = errorBlock(error);
        $("#sbEmailMsg", page).textContent = "";
      }
    });
  }

  async function renderSchedule(token) {
    const page = showPage("schedule", "时间表", "SCHEDULE", "管理课程、作业 deadline 和提醒。");
    if (!page) return;
    try {
      const courses = await api("/api/courses").catch(() => ({ courses: [] }));
      const items = collectScheduleItems(courses.courses || []);
      if (token !== routeToken) return;
      page.innerHTML = `
        <header class="sb-page-head">
          <div><p class="sb-eyebrow">SCHEDULE</p><h2>时间表</h2><p class="sb-subtle">上传 syllabus 或手动记录 deadline，完成后可以移入已完成列表。</p></div>
          <button class="sb-button" type="button" data-route="study">返回学习区</button>
        </header>
        <div class="sb-grid">
          <section class="sb-card">
            <h3>新增 deadline</h3>
            <input class="sb-input" id="sbDeadlineCourse" placeholder="课程，例如 ECO101"><br><br>
            <input class="sb-input" id="sbDeadlineTitle" placeholder="任务，例如 Essay 1"><br><br>
            <input class="sb-input" id="sbDeadlineDue" type="datetime-local"><br><br>
            <button class="sb-button primary" id="sbDeadlineSave">保存到时间表</button>
            <p class="sb-muted">如果需要从 PDF 自动解析，先在学习区上传 syllabus，再让 AI 帮你整理。</p>
          </section>
          <section class="sb-card">
            <h3>全部提醒</h3>
            <div class="sb-list">${items.length ? items.map(renderDeadline).join("") : "<p class='sb-muted'>暂时没有 upcoming deadline。</p>"}</div>
          </section>
        </div>
      `;
      $("#sbDeadlineSave", page)?.addEventListener("click", async () => {
        const name = $("#sbDeadlineCourse", page)?.value.trim() || "Schedule & Deadlines";
        const title = $("#sbDeadlineTitle", page)?.value.trim();
        const dueAt = $("#sbDeadlineDue", page)?.value;
        if (!title || !dueAt) return;
        const course = await ensureScheduleCourse(name);
        await api(`/api/courses/${course.id}/documents`, { method: "POST", body: { title: `[SCHEDULE ITEM] ${title}`, content: `Course: ${name}\nTask: ${title}\nDue: ${dueAt}\nStatus: pending`, type: "schedule" } });
        renderSchedule(++routeToken);
      });
    } catch (error) {
      page.innerHTML += errorBlock(error);
    }
  }

  async function ensureScheduleCourse(name) {
    const data = await api("/api/courses");
    const existing = (data.courses || []).find((course) => course.name === name || course.name === "Schedule & Deadlines");
    if (existing) return existing;
    const created = await api("/api/courses", { method: "POST", body: { name: "Schedule & Deadlines", term: "StudyBridge planner" } });
    return created.course || created;
  }

  function collectScheduleItems(courses) {
    const items = [];
    courses.forEach((course) => {
      (course.documents || []).forEach((doc) => {
        const content = `${doc.title || ""}\n${doc.content || ""}`;
        const due = content.match(/Due:\s*([^\n]+)/i)?.[1] || content.match(/(\d{4}-\d{2}-\d{2}(?:T|\s)\d{2}:\d{2})/)?.[1] || "";
        if (/\[SCHEDULE ITEM\]|deadline|due/i.test(content)) {
          items.push({ course: course.name, title: (doc.title || "Deadline").replace("[SCHEDULE ITEM]", "").trim(), due });
        }
      });
    });
    return items.sort((a, b) => new Date(a.due || 8640000000000000) - new Date(b.due || 8640000000000000));
  }

  function renderDeadline(item) {
    const due = item.due ? new Date(item.due) : null;
    const label = due && !Number.isNaN(due.getTime()) ? timeLeft(due) : "时间待确认";
    return `<article class="sb-list-item sb-deadline"><div><span class="sb-pill">DDL</span><h4>${esc(item.title)}</h4><p class="sb-muted">${esc(item.course)} ${esc(item.due || "")}</p></div><strong>${esc(label)}</strong></article>`;
  }

  function timeLeft(date) {
    const ms = date.getTime() - Date.now();
    if (ms <= 0) return "已到期";
    const hours = Math.floor(ms / 36e5);
    const days = Math.floor(hours / 24);
    const rest = hours % 24;
    return days ? `${days}天${rest}小时` : `${Math.max(1, hours)}小时`;
  }

  async function renderDeveloper(token) {
    const page = showPage("developer", "开发者端", "CREATOR CONSOLE", "监管、邀请码、用户、数据和系统状态。");
    if (!page) return;
    try {
      const [status, overview] = await Promise.all([
        api("/api/admin/system-status").catch((error) => ({ error: error.message })),
        api("/api/admin/overview").catch((error) => ({ error: error.message }))
      ]);
      if (token !== routeToken) return;
      page.innerHTML = `
        <header class="sb-page-head">
          <div><p class="sb-eyebrow">CREATOR CONSOLE</p><h2>开发者端</h2><p class="sb-subtle">这里只保留监管和管理功能。</p></div>
          <button class="sb-button primary" id="sbDevRefresh">检测</button>
        </header>
        <div class="sb-grid">
          <section class="sb-card"><h3>系统状态</h3>${renderStatus(status)}</section>
          <section class="sb-card">
            <h3>生成邀请码</h3>
            <div class="sb-row"><input class="sb-input" id="sbInviteLabel" placeholder="备注"><input class="sb-input" id="sbInviteUses" type="number" min="1" value="1"><select class="sb-select" id="sbInviteRole"><option value="user">普通用户</option><option value="co-admin">Co-admin</option></select><button class="sb-button primary" id="sbInviteCreate">生成</button></div>
            <p class="sb-muted" id="sbInviteMsg"></p>
          </section>
          <section class="sb-card"><h3>邀请码</h3><div class="sb-list">${renderInvites(overview.invites || [])}</div></section>
          <section class="sb-card"><h3>学生数据</h3><div class="sb-list">${renderUsers(overview.users || [])}</div></section>
        </div>
      `;
      $("#sbDevRefresh", page)?.addEventListener("click", () => renderDeveloper(++routeToken));
      $("#sbInviteCreate", page)?.addEventListener("click", async () => {
        const body = { label: $("#sbInviteLabel", page)?.value.trim(), maxUses: Number($("#sbInviteUses", page)?.value || 1), role: $("#sbInviteRole", page)?.value || "user" };
        $("#sbInviteMsg", page).textContent = "生成中...";
        try {
          await api("/api/admin/invites", { method: "POST", body });
          renderDeveloper(++routeToken);
        } catch (error) {
          $("#sbInviteMsg", page).textContent = error.message;
        }
      });
      $$("[data-copy]", page).forEach((button) => {
        button.addEventListener("click", async () => {
          await navigator.clipboard?.writeText(button.dataset.copy).catch(() => {});
          button.textContent = "已复制";
        });
      });
    } catch (error) {
      page.innerHTML += errorBlock(error);
    }
  }

  function renderStatus(status) {
    if (status.error) return errorBlock(status.error);
    const checks = status.checks || status || {};
    return Object.entries(checks).map(([key, value]) => `<article class="sb-list-item"><strong>${esc(key)}</strong><br><span class="sb-muted">${esc(typeof value === "object" ? JSON.stringify(value) : value)}</span></article>`).join("") || "<p class='sb-muted'>暂无检测结果。</p>";
  }

  function renderInvites(invites) {
    if (!invites.length) return "<p class='sb-muted'>还没有邀请码。</p>";
    return invites.map((invite) => `<article class="sb-list-item"><div class="sb-row between"><strong>${esc(invite.code)}</strong><button class="sb-button" data-copy="${esc(invite.code)}">复制</button></div><span class="sb-muted">${esc(invite.role || "user")} · ${esc(invite.label || "")} · ${esc(invite.used || 0)}/${esc(invite.maxUses || 1)} used</span></article>`).join("");
  }

  function renderUsers(users) {
    if (!users.length) return "<p class='sb-muted'>还没有用户数据。</p>";
    return users.map((user) => `<article class="sb-list-item"><strong>${esc(user.name || "StudyBridge user")}</strong><br><span class="sb-muted">${esc(user.email || "")} · ${esc(user.role || "student")}</span><br><span class="sb-muted">${esc(user.courseCount || 0)} courses · ${esc(user.documentCount || 0)} docs · ${esc(user.messageCount || 0)} chats</span></article>`).join("");
  }

  function normalizeChannels(channels) {
    const base = [
      { id: "all", name: "全部社区", description: "所有公开讨论" },
      { id: "schools", name: "学校社区", description: "选择或浏览不同学校" },
      { id: "majors", name: "专业社区", description: "选择或浏览不同专业" }
    ];
    const extra = (channels || []).map((item) => ({ id: item.id || item.name, name: item.name || item.id, description: item.description || "" }));
    return [...base, ...extra.filter((item) => !base.some((baseItem) => baseItem.id === item.id))];
  }

  function schoolOptions() {
    return ["University of Toronto", "University of British Columbia", "McGill University", "University of Waterloo", "McMaster University", "Western University", "Queen's University", "University of Alberta", "University of Calgary", "York University", "Toronto Metropolitan University", "University of Ottawa", "Centennial College", "Seneca Polytechnic", "George Brown College", "Sheridan College", "Harvard University", "Stanford University", "MIT", "University of California, Berkeley", "UCLA", "University of Michigan", "New York University", "Columbia University", "University of Washington"];
  }

  function majorOptions() {
    return ["Business", "Finance", "Accounting", "Economics", "Computer Science", "Engineering", "Mathematics", "Statistics", "Data Science", "Psychology", "Biology", "Chemistry", "Nursing", "Education", "Media Studies", "Design", "Marketing"];
  }

  async function openRoute(route) {
    if (!ROUTES[route]) route = "study";
    const token = ++routeToken;
    if (route === "study") return showStudy();
    if (route === "profile") return renderProfile(token);
    if (route === "community") return renderCommunity(token);
    if (route === "classmates") return renderClassmates(token);
    if (route === "email") return renderEmail(token);
    if (route === "schedule") return renderSchedule(token);
    if (route === "developer") return renderDeveloper(token);
  }

  function routeFromTarget(target) {
    if (!target?.closest) return "";
    const dataRoute = target.closest("[data-route]")?.dataset.route;
    if (dataRoute && ROUTES[dataRoute]) return dataRoute;
    for (const [route, selectors] of Object.entries(ROUTES)) {
      if (selectors.some((selector) => target.closest(selector))) return route;
    }
    return "";
  }

  function handleNav(event) {
    const route = routeFromTarget(event.target);
    if (!route) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    openRoute(route);
  }

  function boot() {
    installStyles();
    window.addEventListener("click", handleNav, true);
    window.addEventListener("pointerup", handleNav, true);
    window.studybridgeOpenRoute = openRoute;
    try {
      const last = localStorage.getItem("studybridge:lastRoute");
      if (last && last !== "study" && ROUTES[last]) setTimeout(() => openRoute(last), 200);
    } catch {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
