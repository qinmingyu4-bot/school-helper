(() => {
  let currentUser = null;
  let communitySection = null;
  let activeChannel = "all";

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

  async function refreshMe() {
    try {
      const result = await api("/api/me");
      currentUser = result.user;
    } catch {
      currentUser = null;
    }
    return currentUser;
  }

  function school() { return currentUser?.profile?.school || ""; }
  function major() { return currentUser?.profile?.major || ""; }

  function installStyle() {
    if (document.querySelector("#studybridge-open-community-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-open-community-style";
    style.textContent = `
      .school-community-page { display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100vh; min-height: 0; background: #f4f6f9; }
      .school-community-page[hidden] { display: none; }
      .community-body { display: grid; grid-template-columns: minmax(260px, 360px) minmax(0, 1fr); gap: 18px; min-height: 0; padding: 22px 28px; overflow: auto; }
      .community-composer, .community-feed-shell { border: 1px solid var(--line); border-radius: 8px; background: white; box-shadow: 0 12px 30px rgba(25, 36, 58, 0.05); }
      .community-composer { align-self: start; display: grid; gap: 12px; padding: 18px; }
      .community-composer h3, .community-feed-shell h3 { margin: 0; color: var(--navy); }
      .community-composer p { margin: 0; color: var(--muted); line-height: 1.45; font-size: 13px; }
      .community-composer textarea, .community-composer select { width: 100%; border: 1px solid var(--line); border-radius: 8px; background: white; }
      .community-composer textarea { min-height: 150px; resize: vertical; }
      .community-channel-tabs { display: grid; gap: 8px; }
      .community-channel-tab { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid #dfe7f1; border-radius: 8px; background: #fbfdff; color: var(--navy); text-align: left; cursor: pointer; }
      .community-channel-tab.active { border-color: rgba(47, 125, 98, 0.75); box-shadow: inset 3px 0 0 var(--green); }
      .community-channel-tab strong { display: block; font-size: 13px; }
      .community-channel-tab span { display: block; color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .community-feed-shell { display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; padding: 18px; }
      .community-feed-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
      .community-feed { display: grid; gap: 12px; min-height: 0; padding-top: 14px; overflow: auto; }
      .community-post { display: grid; gap: 10px; padding: 14px; border: 1px solid #dbe3ee; border-radius: 8px; background: #fbfdff; }
      .community-post-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
      .community-post-head strong { color: var(--navy); }
      .community-post-meta, .community-tag { color: var(--muted); font-size: 12px; }
      .community-tag-row { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
      .community-tag { display: inline-grid; place-items: center; min-height: 24px; padding: 0 8px; border-radius: 999px; background: #eef5ff; color: var(--navy); font-weight: 850; }
      .community-tag.channel { background: #e9f6ef; color: #1f6f55; }
      .community-post-content { white-space: pre-wrap; line-height: 1.55; color: #24324b; }
      .community-post-actions { display: flex; align-items: center; gap: 8px; }
      .community-message { min-height: 18px; margin: 0; color: var(--muted); font-size: 12px; }
      @media (max-width: 900px) { .school-community-page { height: auto; min-height: 680px; } .community-body { grid-template-columns: 1fr; padding: 16px; } }
    `;
    document.head.appendChild(style);
  }

  function ensureButton() {
    const profileEntry = document.querySelector("#openProfilePageButton");
    if (!profileEntry || document.querySelector("#openSchoolCommunityButton")) return;
    const button = document.createElement("button");
    button.id = "openSchoolCommunityButton";
    button.type = "button";
    button.className = "community-entry";
    button.innerHTML = `<span class="community-entry-icon">社</span><span><strong>社区</strong><span id="communityEntrySchool">全部、学校和专业频道</span></span>`;
    profileEntry.insertAdjacentElement("afterend", button);
    button.addEventListener("click", showCommunityPage);
  }

  function ensureCommunityPage() {
    const workspace = document.querySelector(".workspace");
    if (!workspace) return;
    communitySection = document.querySelector("#schoolCommunityPage");
    if (communitySection) return;
    communitySection = document.createElement("section");
    communitySection.id = "schoolCommunityPage";
    communitySection.className = "school-community-page";
    communitySection.hidden = true;
    communitySection.innerHTML = `
      <header class="topbar"><div><p class="eyebrow">Community</p><h2 id="communityTitle">社区</h2><span id="communitySubtitle">所有人都能浏览，也可以按学校或专业筛选。</span></div><button class="ghost-button" id="backFromCommunityButton" type="button">返回学习区</button></header>
      <div class="community-body">
        <form class="community-composer" id="communityComposer"><h3>发一条动态</h3><p>可以发到全部社区、你的学校频道或专业频道。学校和专业频道只是分类，其他同学也可以进入查看。</p><div class="community-channel-tabs" id="communityChannelTabs"></div><select id="communityTopicInput"><option value="问问题">问问题</option><option value="选课建议">选课建议</option><option value="复习搭子">复习搭子</option><option value="Deadline">Deadline</option><option value="资料经验">资料经验</option><option value="校园生活">校园生活</option></select><textarea id="communityContentInput" placeholder="例如：有没有同学上过 ECO101？midterm 复习重点应该怎么抓？"></textarea><label class="check-row"><input id="communityAnonymousInput" type="checkbox" />匿名发布</label><button class="primary-button" type="submit">发布</button><p class="community-message" id="communityMessage"></p></form>
        <section class="community-feed-shell"><div class="community-feed-head"><div><h3 id="communityFeedTitle">全部动态</h3><span class="community-message" id="communityFeedSubtitle">StudyBridge 全部公开帖子。</span></div><button class="small-button" id="refreshCommunityButton" type="button">刷新</button></div><div class="community-feed" id="communityFeed"></div></section>
      </div>`;
    workspace.appendChild(communitySection);
    communitySection.querySelector("#backFromCommunityButton")?.addEventListener("click", showStudyPage);
    communitySection.querySelector("#refreshCommunityButton")?.addEventListener("click", loadCommunity);
    communitySection.querySelector("#communityComposer")?.addEventListener("submit", submitPost);
  }

  function channelOptions() {
    return [
      { key: "all", title: "全部社区", subtitle: "所有公开讨论" },
      { key: "school", title: "学校社区", subtitle: school() || "先在 Profile 填学校" },
      { key: "major", title: "专业社区", subtitle: major() || "先在 Profile 填专业" }
    ];
  }

  function renderChannelTabs() {
    const tabs = document.querySelector("#communityChannelTabs");
    if (!tabs) return;
    tabs.innerHTML = channelOptions().map((channel) => `<button class="community-channel-tab ${activeChannel === channel.key ? "active" : ""}" type="button" data-community-channel="${channel.key}"><span><strong>${escapeHtml(channel.title)}</strong><span>${escapeHtml(channel.subtitle)}</span></span><span>${activeChannel === channel.key ? "当前" : "切换"}</span></button>`).join("");
    tabs.querySelectorAll("[data-community-channel]").forEach((button) => button.addEventListener("click", async () => { activeChannel = button.dataset.communityChannel || "all"; renderChannelTabs(); await loadCommunity(); }));
  }

  function showStudyPage() {
    document.querySelector("#profilePage")?.setAttribute("hidden", "");
    document.querySelector("#schoolCommunityPage")?.setAttribute("hidden", "");
    const workspacePage = document.querySelector("#workspacePage");
    if (workspacePage) workspacePage.hidden = false;
  }

  async function showCommunityPage() {
    await refreshMe();
    ensureCommunityPage();
    renderChannelTabs();
    ["#workspacePage", "#profilePage", "#classmatesPage", "#emailReplyPage", "#schedulePage"].forEach((selector) => document.querySelector(selector)?.setAttribute("hidden", ""));
    const page = document.querySelector("#schoolCommunityPage");
    if (page) page.hidden = false;
    await loadCommunity();
  }

  function channelLabel(post) {
    if (post.channelType === "school") return post.channelLabel || post.school || "学校频道";
    if (post.channelType === "major") return post.channelLabel || post.major || "专业频道";
    return "全部社区";
  }

  function renderPosts(posts = []) {
    const feed = document.querySelector("#communityFeed");
    if (!feed) return;
    if (!posts.length) { feed.innerHTML = '<p class="empty">这个频道还没有帖子。你可以发第一条。</p>'; return; }
    feed.innerHTML = posts.map((post) => `<article class="community-post"><div class="community-post-head"><div><strong>${escapeHtml(post.authorName || "StudyBridge 同学")}</strong><div class="community-post-meta">${escapeHtml(new Date(post.createdAt).toLocaleString("zh-CN"))}</div></div><div class="community-tag-row"><span class="community-tag channel">${escapeHtml(channelLabel(post))}</span><span class="community-tag">${escapeHtml(post.topic || "问问题")}</span></div></div><div class="community-post-content">${escapeHtml(post.content || "")}</div><div class="community-post-actions"><button class="small-button" type="button" data-like-community-post="${escapeHtml(post.id)}">${post.likedByMe ? "已赞" : "点赞"}</button><span class="community-post-meta">${Number(post.likeCount || 0)} likes</span></div></article>`).join("");
    feed.querySelectorAll("[data-like-community-post]").forEach((button) => button.addEventListener("click", async () => { button.disabled = true; try { await api(`/api/community/posts/${button.dataset.likeCommunityPost}/like?channel=${encodeURIComponent(activeChannel)}`, { method: "PATCH" }); await loadCommunity(); } catch (error) { setMessage(error.message, true); } finally { button.disabled = false; } }));
  }

  function setMessage(text, isError = false) {
    const message = document.querySelector("#communityMessage");
    if (!message) return;
    message.textContent = text || "";
    message.style.color = isError ? "var(--red)" : "var(--muted)";
  }

  function syncTitle(result = {}) {
    const title = document.querySelector("#communityFeedTitle");
    const subtitle = document.querySelector("#communityFeedSubtitle");
    const channel = result.channel || channelOptions().find((item) => item.key === activeChannel);
    if (title) title.textContent = activeChannel === "all" ? "全部动态" : `${channel?.label || channel?.title || "频道"} 动态`;
    if (subtitle) subtitle.textContent = activeChannel === "all" ? "StudyBridge 全部公开帖子。" : "这是公开频道，不在这个学校或专业的人也可以浏览。";
  }

  async function loadCommunity() {
    renderChannelTabs();
    setMessage("正在加载社区...");
    try {
      const result = await api(`/api/community?channel=${encodeURIComponent(activeChannel)}&t=${Date.now()}`);
      syncTitle(result);
      renderPosts(result.posts || []);
      setMessage(`已加载 ${result.posts?.length || 0} 条帖子。`);
    } catch (error) {
      syncTitle();
      renderPosts([]);
      setMessage(error.message, true);
    }
  }

  async function submitPost(event) {
    event.preventDefault();
    const contentInput = document.querySelector("#communityContentInput");
    const topicInput = document.querySelector("#communityTopicInput");
    const anonymousInput = document.querySelector("#communityAnonymousInput");
    const content = contentInput?.value.trim() || "";
    if (!content) return setMessage("先写一点内容再发布。", true);
    setMessage("正在发布...");
    try {
      await api("/api/community/posts", { method: "POST", body: { channel: activeChannel, content, topic: topicInput?.value || "问问题", anonymous: Boolean(anonymousInput?.checked) } });
      if (contentInput) contentInput.value = "";
      if (anonymousInput) anonymousInput.checked = false;
      await loadCommunity();
      setMessage("已发布。");
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  async function init() { installStyle(); ensureButton(); ensureCommunityPage(); await refreshMe(); renderChannelTabs(); }
  init();
  setInterval(() => { ensureButton(); ensureCommunityPage(); renderChannelTabs(); }, 1200);
})();
