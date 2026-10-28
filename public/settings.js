(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeSettings = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  // Categories and their persistent panels form the extension point for future settings.
  const sections = Object.freeze([
    { id: "account", name: "账号与资料", hint: "个人信息与登录", icon: "◎", group: "你的账号" },
    { id: "security", name: "账号安全", hint: "设置或修改网站密码", icon: "◇", group: "你的账号" },
    { id: "learning", name: "学习与 AI", hint: "回答语言与学习方式", icon: "✦", group: "偏好设置" },
    { id: "appearance", name: "外观与显示", hint: "界面色调", icon: "◐", group: "偏好设置" },
    { id: "reminders", name: "课程与提醒", hint: "课程资料与截止日期", icon: "◷", group: "学习空间" },
    { id: "data", name: "隐私与数据", hint: "资料可见性与偏好副本", icon: "▤", group: "学习空间" },
    { id: "about", name: "帮助与关于", hint: "使用说明与版本", icon: "ⓘ", group: "学习空间" }
  ].map(Object.freeze));
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  function preferenceBackup({ appearance, learning, version, date = new Date() }) {
    return { format: "studybridge-preferences", formatVersion: 1, appVersion: String(version), exportedAt: date.toISOString(),
      appearance: { theme: appearance.theme, ...(appearance.mode === "dark" ? { mode: "dark" } : {}) }, learningStyle: { englishTerms: Boolean(learning.englishTerms), englishAnswers: Boolean(learning.englishAnswers),
        chineseExplanations: Boolean(learning.chineseExplanations), customInstruction: String(learning.customInstruction || "") } };
  }

  function createView({ document: doc = document, themes, version, getUser, getContext, getAppearance, flushAppearance,
    learning, saveProfile, loadSecurity, savePassword, requestPasswordReset, navigate, logout }) {
    const dialog = doc.createElement("dialog");
    dialog.className = "settings-dialog";
    dialog.setAttribute("aria-labelledby", "settings-title");
    let group = "";
    const navigation = sections.map((item) => {
      const label = item.group !== group ? `<div class="settings-nav-group">${item.group}</div>` : "";
      group = item.group;
      return `${label}<button type="button" data-settings-section="${item.id}" aria-controls="settings-panel-${item.id}" ${item.id === "account" ? 'aria-current="page"' : ""}><span class="settings-nav-icon" aria-hidden="true">${item.icon}</span><span>${item.name}<small>${item.hint}</small></span><span class="settings-nav-arrow" aria-hidden="true">›</span></button>`;
    }).join("");
    const heading = (id, subtitle) => `<header class="settings-panel-heading"><span class="settings-eyebrow">STUDYBRIDGE / SETTINGS</span><h3 id="settings-${id}-heading">${sections.find((item) => item.id === id).name}</h3><p>${subtitle}</p></header>`;
    dialog.innerHTML = `<header class="settings-heading"><div><h2 id="settings-title">设置 <span>Settings</span></h2></div><button type="button" class="settings-close" aria-label="关闭设置">×</button></header>
      <div class="settings-layout"><aside class="settings-sidebar"><div class="settings-account-summary"><span class="settings-account-avatar" aria-hidden="true"></span><div><strong class="settings-account-name"></strong><small class="settings-account-email"></small></div></div><nav class="settings-nav" aria-label="设置分类">${navigation}</nav><footer class="settings-footer"><span>StudyBridge <small>v${esc(version)}</small></span><button type="button" class="settings-logout">退出登录</button></footer></aside>
      <div class="settings-content"><button type="button" class="settings-back">‹ 返回设置</button>
        <section id="settings-panel-account" class="settings-panel" aria-labelledby="settings-account-heading">${heading("account", "管理你的个人信息，让学习与交流更贴近你。")}
          <form class="settings-profile-form"><div class="settings-block"><h4>基本资料</h4><div class="settings-fields"><label>显示姓名<input name="name" required maxlength="80" autocomplete="name"></label><label>SB ID<input name="sbId" placeholder="例如 adam2026" required maxlength="8" pattern="[A-Za-z0-9]{1,8}" title="1–8 位数字或字母，区分大小写"></label><label>学校<input name="school" maxlength="160" autocomplete="organization"></label><label>专业<input name="major" maxlength="160"></label></div><p class="settings-caption">学校、专业和 SB ID 会用于个人资料与同学功能。</p><div class="settings-form-actions"><span class="settings-profile-status" role="status"></span><button type="submit" class="settings-primary">保存资料</button></div></div></form>
          <div class="settings-block"><h4>登录与资料</h4><div class="settings-row"><div><strong>登录邮箱</strong><small class="settings-login-email"></small></div><span class="settings-static-value">当前账号</span></div><div class="settings-row"><div><strong>头像与封面</strong><small>在个人资料页上传或替换图片。</small></div><button type="button" data-settings-route="profile">管理图片 ↗</button></div><div class="settings-row"><div><strong>网站密码</strong><small>在「账号安全」中设置或修改密码。</small></div><button type="button" data-settings-open="security">管理密码 ›</button></div></div>
        </section>
        <section id="settings-panel-security" class="settings-panel" aria-labelledby="settings-security-heading" hidden>${heading("security", "管理网站密码；Google 与邮箱密码登录使用同一个账号。")}
          <div class="settings-block"><h4>登录方式</h4><div class="settings-row"><div><strong>登录邮箱</strong><small class="settings-security-email"></small></div><span class="settings-static-value">同一个账号</span></div><div class="settings-row"><div><strong>Google 登录</strong><small class="settings-google-status">正在读取…</small></div></div><div class="settings-row"><div><strong>网站密码</strong><small class="settings-password-state">正在读取…</small></div></div></div>
          <div class="settings-block"><h4 class="settings-password-title">网站密码</h4><p class="settings-security-status settings-caption" role="status" aria-live="polite"></p><button type="button" class="settings-security-retry" hidden>重新读取</button><a class="settings-google-reauth" href="/api/auth/google/start" hidden>重新用 Google 验证</a>
            <form class="settings-password-form"><input name="username" type="email" autocomplete="username" readonly hidden><fieldset class="settings-password-fields" disabled><label class="settings-current-password" hidden>当前密码<input name="currentPassword" type="password" autocomplete="current-password" maxlength="1024"></label><label>新密码<input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required aria-describedby="settings-password-help"></label><label>确认新密码<input name="passwordConfirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><p id="settings-password-help" class="settings-caption">使用 8–128 个字符。这是 StudyBridge 的网站密码，与 Google 密码分开管理。</p><p class="settings-caption">保存后当前设备保持登录，其他设备需重新登录。账号资料、课程和 Google 登录保持不变。</p><div class="settings-form-actions"><span class="settings-password-save-status" role="status" aria-live="polite"></span><button type="submit" class="settings-primary">设置密码</button></div></fieldset></form>
          </div><div class="settings-block"><h4>忘记网站密码？</h4><p class="settings-caption">已有密码但忘记时，可以提交重置申请，联系创作者获取临时密码。</p><button type="button" class="settings-password-reset">申请重置</button><p class="settings-password-status settings-caption" role="status"></p></div>
        </section>
        <section id="settings-panel-learning" class="settings-panel" aria-labelledby="settings-learning-heading" hidden>${heading("learning", "告诉学习搭子，你希望怎样理解和回答问题。")}
          <div class="settings-block"><h4>回答与讲解</h4><p class="settings-caption">仅用于课程学习、作业、考试和学术写作。日常问题按提问语言自然回答，必要的英文缩写照常保留。</p><label class="settings-toggle-row"><span><strong>保留 English terms</strong><small>中文讲解中保留有用的英文术语。</small></span><input type="checkbox" data-settings-pref="englishTerms" role="switch"></label><label class="settings-toggle-row"><span><strong>英文作答 / 英文草稿</strong><small>最终答案或草稿使用英文。</small></span><input type="checkbox" data-settings-pref="englishAnswers" role="switch"></label><label class="settings-toggle-row"><span><strong>中文拆解 reasoning</strong><small>用中文讲解概念、步骤与解题理由。</small></span><input type="checkbox" data-settings-pref="chineseExplanations" role="switch"></label></div>
          <div class="settings-block"><h4>自定义学习要求</h4><label class="settings-instruction-label">补充你的偏好<textarea data-settings-instruction maxlength="500" placeholder="例如：先给提示，再一步步讲；解释时多举生活中的例子。"></textarea></label><p class="settings-caption">本次提问中的明确要求优先，其次是自定义要求，再参考上面的开关。</p></div><div class="settings-save-row"><span class="settings-learning-status" role="status" aria-live="polite"></span><button type="button" class="settings-learning-retry" hidden>重试保存</button></div>
        </section>
        <section id="settings-panel-appearance" class="settings-panel" aria-labelledby="settings-appearance-heading" hidden>${heading("appearance", "保留熟悉的布局，换一种更适合你的色调。")}
          <div class="settings-block settings-display-mode"><label class="settings-toggle-row"><span><strong>黑夜模式</strong><small>暮色深灰：炭灰底色与香槟色点缀。关闭后恢复你选择的白天色调。</small></span><input type="checkbox" name="sb-dark-mode" role="switch"></label></div>
          <fieldset class="settings-themes"><legend>界面色调</legend><p>默认保留蓝绿；其他色调以白色为主，低饱和颜色做辅助。</p><div class="settings-theme-grid">${themes.map((theme) => `<label class="settings-theme-option"><input type="radio" name="sb-theme" value="${theme.id}"><span class="settings-theme-sample" style="--sample-accent:${theme.accent};--sample-tint:${theme.tint}"><i></i><i></i><i></i></span><span class="settings-theme-name">${theme.name}<small>${theme.detail}</small></span></label>`).join("")}</div></fieldset><div class="settings-save-row"><span class="settings-save-status" role="status" aria-live="polite"></span><button type="button" class="settings-retry" hidden>重试</button></div><p class="settings-caption">界面色调不会改变文档、幻灯片或表格中已经设置的内容颜色。</p>
        </section>
        <section id="settings-panel-reminders" class="settings-panel" aria-labelledby="settings-reminders-heading" hidden>${heading("reminders", "把课程、资料和重要时间放在一起管理。")}
          <div class="settings-block"><h4>课程空间</h4><div class="settings-row"><div><strong>我的课程与资料</strong><small class="settings-course-count"></small></div><button type="button" data-settings-route="study">打开学习 ↗</button></div><div class="settings-row"><div><strong>作业、考试与课程提醒</strong><small>手动添加，或从课程资料中提取时间安排。</small></div><button type="button" data-settings-route="schedule">打开日程 ↗</button></div></div><div class="settings-block"><h4>提醒方式</h4><div class="settings-row"><div><strong>站内截止日期提醒</strong><small>在「学习」页面顶部与日程中查看。</small></div><span class="settings-static-value">已提供</span></div><div class="settings-row"><div><strong>邮件与系统推送</strong><small>目前请通过站内日程查看安排。</small></div><span class="settings-static-value">尚未开放</span></div></div>
        </section>
        <section id="settings-panel-data" class="settings-panel" aria-labelledby="settings-data-heading" hidden>${heading("data", "了解个人信息的用途，保留一份自己的偏好副本。")}
          <div class="settings-block"><h4>资料与账号</h4><div class="settings-row"><div><strong>公开资料</strong><small>检查展示给同学的头像、学校、专业和 SB ID。</small></div><button type="button" data-settings-route="profile">查看资料 ↗</button></div><div class="settings-row"><div><strong>学习偏好与外观</strong><small>保存在当前账号中，重新登录后继续使用。</small></div><span class="settings-static-value">按账号保存</span></div></div><div class="settings-block"><h4>偏好副本</h4><p class="settings-caption">下载当前色调、回答语言与自定义学习要求。不包含课程资料、聊天记录或登录凭据。</p><button type="button" class="settings-export">导出当前偏好</button><p class="settings-export-status settings-caption" role="status"></p></div>
        </section>
        <section id="settings-panel-about" class="settings-panel" aria-labelledby="settings-about-heading" hidden>${heading("about", "一些常用说明，帮助你更顺手地使用 StudyBridge。")}
          <div class="settings-block"><h4>使用帮助</h4><details class="settings-help"><summary>怎样开始一门课程？</summary><p>进入「学习」，在「对话与课程」中新增课程，然后上传或粘贴课程资料，再选择学习模式并提问。</p></details><details class="settings-help"><summary>怎样让 AI 按我的方式讲解？</summary><p>在「学习与 AI」中选择答案与讲解语言，补充学习要求。你也可以在每次提问时提出更具体的要求。</p></details><details class="settings-help"><summary>换色调会影响课程和文件吗？</summary><p>切换只调整界面颜色，课程、聊天记录和文件内容会保留。已经设置的文档文字色、幻灯片背景和单元格样式也会保留。</p></details><details class="settings-help"><summary>怎样管理截止日期？</summary><p>打开日程，手动添加作业、考试或课程提醒，也可以上传课程安排进行提取，确认后再保存。</p></details></div><div class="settings-block"><h4>关于 StudyBridge</h4><div class="settings-row"><div><strong>StudyBridge Cloud</strong><small>你的课程、学习与创作空间。</small></div><span class="settings-static-value">v${esc(version)}</span></div></div>
        </section>
      </div></div>`;
    let profileDirty = false, disposed = false, learningTimer = 0;
    let security = null, securityGeneration = 0, passwordPending = false;
    const currentUserId = String(getUser().id);
    const active = () => !disposed && String(getUser()?.id || "") === currentUserId;
    const form = dialog.querySelector(".settings-profile-form");
    const setStatus = (selector, text, error = false) => { if (!active()) return; const el = dialog.querySelector(selector); el.textContent = text; el.classList.toggle("is-error", error); };
    function refreshUser() {
      const user = getUser(), p = user.profile || {};
      dialog.querySelector(".settings-account-name").textContent = user.name;
      dialog.querySelector(".settings-account-email").textContent = user.email;
      dialog.querySelector(".settings-account-avatar").textContent = String(user.name || "S").slice(0, 1);
      dialog.querySelector(".settings-login-email").textContent = user.email;
      if (!profileDirty) for (const key of ["name", "school", "major", "sbId"]) form.elements[key].value = key === "name" ? user.name : p[key] || "";
      dialog.querySelector(".settings-course-count").textContent = `当前账号有 ${getContext().courseCount} 门课程；在「学习」中管理资料和对话。`;
    }
    const passwordForm = dialog.querySelector(".settings-password-form");
    const passwordFields = dialog.querySelector(".settings-password-fields");
    function clearPasswords() { for (const key of ["currentPassword", "password", "passwordConfirm"]) passwordForm.elements[key].value = ""; }
    function renderSecurity() {
      if (!active()) return;
      passwordForm.elements.username.value = getUser().email;
      dialog.querySelector(".settings-security-email").textContent = getUser().email;
      dialog.querySelector(".settings-google-status").textContent = security ? security.googleLinked ? "已绑定，可继续使用 Google 登录。" : "尚未绑定；可以使用与注册邮箱相同的 Google 账号登录。" : "正在读取…";
      dialog.querySelector(".settings-password-state").textContent = security ? security.hasPassword ? "已设置，可使用邮箱和网站密码登录。" : "尚未设置，目前使用 Google 登录。" : "正在读取…";
      dialog.querySelector(".settings-password-title").textContent = security?.hasPassword ? "修改网站密码" : "设置网站密码";
      dialog.querySelector(".settings-current-password").hidden = !security?.hasPassword;
      passwordForm.elements.currentPassword.required = Boolean(security?.hasPassword);
      passwordForm.querySelector('button[type="submit"]').textContent = passwordPending ? "正在保存…" : security?.hasPassword ? "修改密码" : "设置密码";
      passwordFields.disabled = passwordPending || !security || security.needsGoogleReauth;
      dialog.querySelector(".settings-google-reauth").hidden = !security?.needsGoogleReauth;
    }
    async function readSecurity() {
      const generation = ++securityGeneration;
      security = null; renderSecurity();
      dialog.querySelector(".settings-security-retry").hidden = true;
      setStatus(".settings-security-status", "正在读取账号安全…");
      try {
        const value = await loadSecurity();
        if (!active() || generation !== securityGeneration) return;
        security = value; renderSecurity();
        setStatus(".settings-security-status", value.needsGoogleReauth ? "为确认是你本人，请先重新使用 Google 登录，再回来设置网站密码。" : "");
      } catch (error) {
        if (!active() || generation !== securityGeneration) return;
        setStatus(".settings-security-status", error.message || "读取失败，请重试。", true);
        dialog.querySelector(".settings-security-retry").hidden = false;
      }
    }
    dialog.querySelector(".settings-security-retry").addEventListener("click", readSecurity);
    passwordForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (passwordPending || !active() || !security || security.needsGoogleReauth) return;
      if (passwordForm.elements.password.value !== passwordForm.elements.passwordConfirm.value) {
        setStatus(".settings-password-save-status", "两次输入的新密码不一致。", true); return;
      }
      const changing = security.hasPassword;
      const values = { userId: currentUserId, currentPassword: passwordForm.elements.currentPassword.value,
        password: passwordForm.elements.password.value, passwordConfirm: passwordForm.elements.passwordConfirm.value };
      passwordPending = true; renderSecurity(); setStatus(".settings-password-save-status", "正在保存…");
      try {
        const result = await savePassword(values, security.csrfToken);
        if (!active()) return;
        security = result; clearPasswords();
        setStatus(".settings-password-save-status", changing ? "密码已修改。请在下次邮箱登录时使用新密码。" : "密码已设置，现在可以使用邮箱和网站密码登录同一个账号。");
      } catch (error) {
        if (!active()) return;
        clearPasswords(); setStatus(".settings-password-save-status", error.message || "保存失败，请重试。", true);
        // A session/Google verification may have expired while this panel was open.
        if ([401, 403, 409].includes(error.status)) await readSecurity();
      } finally {
        values.currentPassword = values.password = values.passwordConfirm = "";
        passwordPending = false; renderSecurity();
      }
    });
    dialog.addEventListener("close", clearPasswords);
    function refreshLearning() {
      if (!active()) return;
      const value = learning.snapshot();
      dialog.querySelectorAll("[data-settings-pref]").forEach((input) => { input.checked = Boolean(value.draft[input.dataset.settingsPref]); });
      const instruction = dialog.querySelector("[data-settings-instruction]");
      if (instruction.value !== value.draft.customInstruction) instruction.value = value.draft.customInstruction;
      setStatus(".settings-learning-status", { saved: "学习偏好已保存到账号。", saving: "正在保存学习偏好…", unsaved: "正在等待保存…", error: "保存失败，请重试。" }[value.status], value.status === "error");
      dialog.querySelector(".settings-learning-retry").hidden = value.status !== "error";
    }
    const saveLearning = async () => { clearTimeout(learningTimer); try { await learning.flush(); } catch { /* Shared saver exposes failure and retry state. */ } refreshLearning(); };
    dialog.querySelector(".settings-logout").addEventListener("click", async (event) => {
      event.currentTarget.disabled = true;
      // Drain queued auto-saves before ending the session, including the debounce window.
      await Promise.allSettled([saveLearning(), flushAppearance()]);
      if (active()) await logout();
    });
    function editLearning() {
      const draft = { ...learning.snapshot().draft };
      dialog.querySelectorAll("[data-settings-pref]").forEach((input) => { draft[input.dataset.settingsPref] = input.checked; });
      draft.customInstruction = dialog.querySelector("[data-settings-instruction]").value;
      learning.setDraft(draft); refreshLearning(); clearTimeout(learningTimer); learningTimer = setTimeout(saveLearning, 500);
    }
    dialog.addEventListener("change", (event) => { if (event.target.matches("[data-settings-pref]")) editLearning(); });
    dialog.querySelector("[data-settings-instruction]").addEventListener("input", editLearning);
    dialog.querySelector(".settings-learning-retry").addEventListener("click", saveLearning);
    form.addEventListener("input", () => { profileDirty = true; setStatus(".settings-profile-status", "有未保存的修改"); });
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); const button = form.querySelector('button[type="submit"]'); button.disabled = true;
      setStatus(".settings-profile-status", "正在保存…");
      try {
        await saveProfile(Object.fromEntries(new doc.defaultView.FormData(form)));
        if (!active()) return;
        profileDirty = false; refreshUser(); setStatus(".settings-profile-status", "资料已保存");
      } catch (error) { setStatus(".settings-profile-status", error.message || "保存失败，请重试。", true); }
      finally { if (active()) button.disabled = false; }
    });
    dialog.querySelector(".settings-password-reset").addEventListener("click", async (event) => {
      const button = event.currentTarget; button.disabled = true;
      setStatus(".settings-password-status", "正在提交申请…");
      try { await requestPasswordReset(); setStatus(".settings-password-status", "申请已提交，请联系创作者获取临时密码。"); }
      catch (error) { setStatus(".settings-password-status", error.message || "申请失败，请重试。", true); }
      finally { if (active()) button.disabled = false; }
    });
    dialog.querySelectorAll("[data-settings-section]").forEach((button) => button.addEventListener("click", () => {
      clearPasswords(); setStatus(".settings-password-save-status", "");
      dialog.querySelectorAll("[data-settings-section]").forEach((item) => { if (item === button) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current"); });
      dialog.querySelectorAll(".settings-panel").forEach((panel) => { panel.hidden = panel.id !== button.getAttribute("aria-controls"); });
      dialog.dataset.detail = "true"; dialog.querySelector(".settings-content").scrollTop = 0;
      refreshUser(); refreshLearning();
      if (button.dataset.settingsSection === "security" && !passwordPending) void readSecurity();
    }));
    dialog.querySelectorAll("[data-settings-open]").forEach((button) => button.addEventListener("click", () => dialog.querySelector(`[data-settings-section="${button.dataset.settingsOpen}"]`).click()));
    dialog.querySelector(".settings-back").addEventListener("click", () => { clearPasswords(); delete dialog.dataset.detail; dialog.querySelector('[aria-current="page"]').focus(); });
    dialog.querySelectorAll("[data-settings-route]").forEach((button) => button.addEventListener("click", async () => {
      await saveLearning(); if (!active()) return;
      dialog.close(); await navigate(button.dataset.settingsRoute);
    }));
    dialog.querySelector(".settings-export").addEventListener("click", () => {
      const value = preferenceBackup({ appearance: getAppearance(), learning: learning.snapshot().draft, version });
      const url = doc.defaultView.URL.createObjectURL(new doc.defaultView.Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
      const anchor = doc.createElement("a"); anchor.href = url; anchor.download = "studybridge-preferences.json"; doc.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => doc.defaultView.URL.revokeObjectURL(url), 1000);
      setStatus(".settings-export-status", "已导出当前选择的偏好副本。");
    });
    dialog.refreshSettings = () => { refreshUser(); refreshLearning(); if (dialog.querySelector('[data-settings-section="security"]').hasAttribute("aria-current") && !passwordPending) void readSecurity(); };
    dialog.refreshLearning = refreshLearning;
    dialog.disposeSettings = () => { disposed = true; ++securityGeneration; clearPasswords(); clearTimeout(learningTimer); };
    refreshUser(); refreshLearning();
    return dialog;
  }
  return { sections, preferenceBackup, createView };
});
