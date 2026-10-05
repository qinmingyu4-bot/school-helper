(() => {
  let currentUser = null;
  let communitySection = null;
  let communityButton = null;

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
      return currentUser;
    } catch {
      currentUser = null;
      return null;
    }
  }

  function installStyle() {
    if (document.querySelector("#studybridge-school-community-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-school-community-style";
    style.textContent = `
      .community-entry {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 10px;
        width: 100%;
        min-height: 48px;
        padding: 10px 12px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: white;
        color: var(--navy);
        text-align: left;
        box-shadow: 0 8px 24px rgba(25, 36, 58, 0.04);
      }

      .community-entry:hover {
        border-color: var(--green);
      }

      .community-entry-icon {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 8px;
        background: linear-gradient(145deg, var(--navy), var(--green));
        color: white;
        font-weight: 900;
      }

      .community-entry strong {
        display: block;
        font-size: 14px;
      }

      .community-entry span {
        color: var(--muted);
        font-size: 12px;
      }

      .school-community-page {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        height: 100vh;
        min-height: 0;
        background: #f4f6f9;
      }

      .school-community-page[hidden] {
        display: none;
      }

      .community-body {
        display: grid;
        grid-template-columns: minmax(260px, 360px) minmax(0, 1fr);
        gap: 18px;
        min-height: 0;
        padding: 22px 28px;
        overflow: auto;
      }

      .community-composer,
      .community-feed-shell {
        border: 1px solid var(--line);
        border-radius: 8px;
        background: white;
        box-shadow: 0 12px 30px rgba(25, 36, 58, 0.05);
      }

      .community-composer {
        align-self: start;
        display: grid;
        gap: 12px;
        padding: 18px;
      }

      .community-composer h3,
      .community-feed-shell h3 {
        margin: 0;
        color: var(--navy);
      }

      .community-composer p {
        margin: 0;
        color: var(--muted);
        line-height: 1.45;
        font-size: 13px;
      }

      .community-composer textarea,
      .community-composer input,
      .community-composer select {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: white;
      }

      .community-composer textarea {
        min-height: 150px;
        resize: vertical;
      }

      .community-feed-shell {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        min-height: 0;
        padding: 18px;
      }

      .community-feed-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding-bottom: 14px;
        border-bottom: 1px solid var(--line);
      }

      .community-feed {
        display: grid;
        gap: 12px;
        min-height: 0;
        padding-top: 14px;
        overflow: auto;
      }

      .community-post {
        display: grid;
        gap: 10px;
        padding: 14px;
        border: 1px solid #dbe3ee;
        border-radius: 8px;
        background: #fbfdff;
      }

      .community-post-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
      }

      .community-post-head strong {
        color: var(--navy);
      }

      .community-post-meta,
      .community-tag {
        color: var(--muted);
        font-size: 12px;
      }

      .community-tag {
        display: inline-grid;
        place-items: center;
        min-height: 24px;
        padding: 0 8px;
        border-radius: 999px;
        background: #eef5ff;
        color: var(--navy);
        font-weight: 850;
      }

      .community-post-content {
        white-space: pre-wrap;
        line-height: 1.55;
        color: #24324b;
      }

      .community-post-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .community-message {
        min-height: 18px;
        margin: 0;
        color: var(--muted);
        font-size: 12px;
      }

      @media (max-width: 900px) {
        .school-community-page {
          height: auto;
          min-height: 680px;
        }

        .community-body {
          grid-template-columns: 1fr;
          padding: 16px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function schoolDisplay(user = currentUser) {
    return user?.profile?.school || "";
  }

  function ensureButton() {
    const profileEntry = document.querySelector("#openProfilePageButton");
    if (!profileEntry || document.querySelector("#openSchoolCommunityButton")) return;
    communityButton = document.createElement("button");
    communityButton.id = "openSchoolCommunityButton";
    communityButton.type = "button";
    communityButton.className = "community-entry";
    communityButton.innerHTML = `
      <span class="community-entry-icon">校</span>
      <span><strong>学校社区</strong><span id="communityEntrySchool">按 Profile 自动进入</span></span>
      <span class="small-button">进入</span>
    `;
    profileEntry.insertAdjacentElement("afterend", communityButton);
    communityButton.addEventListener("click", showCommunityPage);
    updateEntrySchool();
  }

  function ensureCommunityPage() {
    const workspace = document.querySelector(".workspace");
    if (!workspace || document.querySelector("#schoolCommunityPage")) return;
    communitySection = document.createElement("section");
    communitySection.id = "schoolCommunityPage";
    communitySection.className = "school-community-page";
    communitySection.hidden = true;
    communitySection.innerHTML = `
      <header class="topbar">
        <div>
          <p class="eyebrow">School Community</p>
          <h2 id="communityTitle">学校社区</h2>
          <span id="communitySubtitle">根据你的 Profile 学校自动进入。</span>
        </div>
        <button class="ghost-button" id="backFromCommunityButton" type="button">返回学习区</button>
      </header>
      <div class="community-body">
        <form class="community-composer" id="communityComposer">
          <h3>发一条同校动态</h3>
          <p>适合问选课、deadline、学习资源、新生问题和复习搭子。不要上传考试原题、付费教材或他人隐私。</p>
          <select id="communityTopicInput" aria-label="帖子类型">
            <option value="问问题">问问题</option>
            <option value="选课建议">选课建议</option>
            <option value="复习搭子">复习搭子</option>
            <option value="Deadline">Deadline</option>
            <option value="资料经验">资料经验</option>
            <option value="校园生活">校园生活</option>
          </select>
          <textarea id="communityContentInput" placeholder="例如：有没有同校同学上过 ECO101？midterm 复习重点应该怎么抓？"></textarea>
          <label class="check-row"><input id="communityAnonymousInput" type="checkbox" />匿名发布</label>
          <button class="primary-button" type="submit">发布到学校社区</button>
          <p class="community-message" id="communityMessage"></p>
        </form>
        <section class="community-feed-shell">
          <div class="community-feed-head">
            <h3>同校帖子</h3>
            <button class="small-button" id="refreshCommunityButton" type="button">刷新</button>
          </div>
          <div class="community-feed" id="communityFeed"></div>
        </section>
      </div>
    `;
    workspace.appendChild(communitySection);
    communitySection.querySelector("#backFromCommunityButton")?.addEventListener("click", showStudyPage);
    communitySection.querySelector("#refreshCommunityButton")?.addEventListener("click", loadCommunity);
    communitySection.querySelector("#communityComposer")?.addEventListener("submit", submitPost);
  }

  function updateEntrySchool() {
    const entry = document.querySelector("#communityEntrySchool");
    if (entry) entry.textContent = schoolDisplay() || "先在 Profile 填学校";
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
    updateEntrySchool();
    if (!schoolDisplay()) {
      const message = document.querySelector("#communityMessage");
      alert("先去 Profile 填写学校，系统才能自动进入对应学校社区。");
      document.querySelector("#openProfilePageButton")?.click();
      if (message) message.textContent = "请先填写学校。";
      return;
    }
    document.querySelector("#workspacePage")?.setAttribute("hidden", "");
    document.querySelector("#profilePage")?.setAttribute("hidden", "");
    const page = document.querySelector("#schoolCommunityPage");
    if (page) page.hidden = false;
    await loadCommunity();
  }

  function renderPosts(posts = []) {
    const feed = document.querySelector("#communityFeed");
    if (!feed) return;
    if (!posts.length) {
      feed.innerHTML = '<p class="empty">这个学校社区还没有帖子。你可以发第一条。</p>';
      return;
    }
    feed.innerHTML = posts
      .map(
        (post) => `
          <article class="community-post">
            <div class="community-post-head">
              <div>
                <strong>${escapeHtml(post.authorName || "同校同学")}</strong>
                <div class="community-post-meta">${escapeHtml(new Date(post.createdAt).toLocaleString("zh-CN"))}</div>
              </div>
              <span class="community-tag">${escapeHtml(post.topic || "问问题")}</span>
            </div>
            <div class="community-post-content">${escapeHtml(post.content || "")}</div>
            <div class="community-post-actions">
              <button class="small-button" type="button" data-like-community-post="${escapeHtml(post.id)}">${post.likedByMe ? "已赞" : "点赞"}</button>
              <span class="community-post-meta">${Number(post.likeCount || 0)} likes</span>
            </div>
          </article>
        `
      )
      .join("");

    feed.querySelectorAll("[data-like-community-post]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await api(`/api/community/school/posts/${button.dataset.likeCommunityPost}/like`, { method: "PATCH" });
          await loadCommunity();
        } catch (error) {
          setMessage(error.message, true);
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  function setMessage(text, isError = false) {
    const message = document.querySelector("#communityMessage");
    if (!message) return;
    message.textContent = text || "";
    message.style.color = isError ? "var(--red)" : "var(--muted)";
  }

  async function loadCommunity() {
    const school = schoolDisplay();
    const title = document.querySelector("#communityTitle");
    const subtitle = document.querySelector("#communitySubtitle");
    if (title) title.textContent = school ? `${school} 社区` : "学校社区";
    if (subtitle) subtitle.textContent = school ? "你会看到同一所学校学生发布的内容。" : "先在 Profile 填学校。";
    setMessage("正在加载同校帖子...");
    try {
      const result = await api(`/api/community/school?t=${Date.now()}`);
      if (title) title.textContent = `${result.school} 社区`;
      renderPosts(result.posts || []);
      setMessage(`已加载 ${result.posts?.length || 0} 条帖子。`);
    } catch (error) {
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
      await api("/api/community/school/posts", {
        method: "POST",
        body: {
          content,
          topic: topicInput?.value || "问问题",
          anonymous: Boolean(anonymousInput?.checked)
        }
      });
      if (contentInput) contentInput.value = "";
      if (anonymousInput) anonymousInput.checked = false;
      await loadCommunity();
      setMessage("已发布到你的学校社区。 ");
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  async function init() {
    installStyle();
    ensureButton();
    ensureCommunityPage();
    await refreshMe();
    updateEntrySchool();
  }

  init();
  setInterval(() => {
    ensureButton();
    ensureCommunityPage();
    updateEntrySchool();
  }, 1000);
})();