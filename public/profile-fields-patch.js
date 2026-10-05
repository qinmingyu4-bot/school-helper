(() => {
  let cachedUser = null;

  function $(selector) {
    return document.querySelector(selector);
  }

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
    if ($("#studybridge-profile-fields-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-profile-fields-style";
    style.textContent = `
      .profile-extra-line {
        display: grid;
        gap: 3px;
        margin-top: 4px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.25;
      }
      .profile-extra-line b {
        color: var(--navy);
        font-weight: 800;
      }
      .profile-form-field {
        width: 100%;
      }
      .profile-edit-reopen {
        margin-top: 14px;
      }
      .profile-form[hidden] + .profile-edit-reopen {
        display: inline-grid;
      }
      .profile-form:not([hidden]) + .profile-edit-reopen {
        display: none;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureLabeledInput(id, labelText, placeholder, afterLabel) {
    let input = $(`#${id}`);
    if (input && input.closest("label")) return input;

    const label = document.createElement("label");
    const span = document.createElement("span");
    span.textContent = labelText;

    if (!input) {
      input = document.createElement("input");
      input.id = id;
      input.type = "text";
    } else {
      input.remove();
    }
    input.className = "profile-form-field";
    input.placeholder = placeholder;

    label.append(span, input);
    if (afterLabel) afterLabel.insertAdjacentElement("afterend", label);
    return input;
  }

  function ensureFields() {
    const schoolInput = $("#schoolInput");
    if (!schoolInput) return;
    const schoolLabel = schoolInput.closest("label");
    const majorInput = ensureLabeledInput("majorInput", "专业", "例如 Business / Engineering", schoolLabel);
    const majorLabel = majorInput.closest("label");
    const sbIdInput = ensureLabeledInput("sbIdInput", "SB ID", "例如 adam2026", majorLabel);
    sbIdInput.autocomplete = "off";
    sbIdInput.spellcheck = false;
  }

  function ensureEditButton() {
    const form = $("#profileForm");
    const panel = form?.closest(".profile-editor-panel");
    if (!form || !panel) return;
    let button = $("#profileEditReopenButton");
    if (!button) {
      button = document.createElement("button");
      button.id = "profileEditReopenButton";
      button.type = "button";
      button.className = "ghost-button profile-edit-reopen";
      button.textContent = "编辑资料";
      form.insertAdjacentElement("afterend", button);
    }
    button.onclick = () => revealProfileForm(true);
  }

  function ensureDisplay() {
    const profileSchool = $("#profileSchool");
    if (!profileSchool) return null;
    let line = $("#profileExtraLine");
    if (!line) {
      line = document.createElement("div");
      line.id = "profileExtraLine";
      line.className = "profile-extra-line";
      profileSchool.insertAdjacentElement("afterend", line);
    }
    return line;
  }

  function fillForm(user) {
    const profile = user?.profile || {};
    if ($("#profileNameInput")) $("#profileNameInput").value = user?.name || "";
    if ($("#schoolInput")) $("#schoolInput").value = profile.school || "";
    if ($("#majorInput")) $("#majorInput").value = profile.major || "";
    if ($("#sbIdInput")) $("#sbIdInput").value = profile.sbId || "";
    if ($("#avatarUrlInput")) $("#avatarUrlInput").value = profile.avatarUrl || "";
    if ($("#backgroundUrlInput")) $("#backgroundUrlInput").value = profile.backgroundUrl || "";
  }

  function renderUser(user) {
    if (!user) return;
    cachedUser = user;
    const profile = user.profile || {};
    fillForm(user);

    const line = ensureDisplay();
    if (line) {
      const rows = [];
      if (profile.major) rows.push(`<span><b>专业</b> ${escapeHtml(profile.major)}</span>`);
      if (profile.sbId) rows.push(`<span><b>SB ID</b> @${escapeHtml(profile.sbId)}</span>`);
      line.innerHTML = rows.length ? rows.join("") : `<span>设置专业和 SB ID 后，同学更容易找到你。</span>`;
    }
    if ($("#profilePreviewSchool")) {
      const bits = [profile.school, profile.major ? `专业：${profile.major}` : "", profile.sbId ? `SB ID：@${profile.sbId}` : ""].filter(Boolean);
      $("#profilePreviewSchool").textContent = bits.length ? bits.join(" | ") : "还没有填写学校。";
    }
  }

  function revealProfileForm(clearMessage = false) {
    const form = $("#profileForm");
    if (!form) return;
    ensureFields();
    fillForm(cachedUser);
    form.hidden = false;
    if (clearMessage && $("#profileMessage")) $("#profileMessage").textContent = "";
  }

  async function refreshProfile() {
    try {
      const result = await api("/api/me");
      renderUser(result.user);
    } catch {
      cachedUser = null;
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const form = $("#profileForm");
    const message = $("#profileMessage");
    if (message) message.textContent = "正在保存...";
    try {
      const result = await api("/api/me/profile", {
        method: "PUT",
        body: {
          name: $("#profileNameInput")?.value || "",
          school: $("#schoolInput")?.value || "",
          major: $("#majorInput")?.value || "",
          sbId: $("#sbIdInput")?.value || "",
          avatarUrl: $("#avatarUrlInput")?.value || "",
          backgroundUrl: $("#backgroundUrlInput")?.value || ""
        }
      });
      cachedUser = result.user;
      renderUser(result.user);
      if ($("#profileName")) $("#profileName").textContent = result.user.name || "StudyBridge user";
      if ($("#profileSchool")) $("#profileSchool").textContent = result.user.profile?.school || "添加学校后，AI 会更懂你的学习环境。";
      if ($("#userLine")) $("#userLine").textContent = `${result.user.name} | ${result.user.email}`;
      if (message) message.textContent = "已保存。需要修改时点下方“编辑资料”。";
      if (form) form.hidden = true;
    } catch (error) {
      if (message) message.textContent = error.message;
    }
  }

  function installSubmitSync() {
    const form = $("#profileForm");
    if (!form || form.dataset.profileFieldsPatch === "true") return;
    form.dataset.profileFieldsPatch = "true";
    form.addEventListener("submit", saveProfile, true);
  }

  function installOpenHandlers() {
    const openButton = $("#openProfilePageButton");
    if (openButton && openButton.dataset.profileOpenPatch !== "true") {
      openButton.dataset.profileOpenPatch = "true";
      openButton.addEventListener("click", () => setTimeout(() => revealProfileForm(true), 0));
    }
  }

  function boot() {
    installStyle();
    ensureFields();
    ensureEditButton();
    ensureDisplay();
    installSubmitSync();
    installOpenHandlers();
    if (cachedUser) renderUser(cachedUser);
  }

  boot();
  refreshProfile();
  setInterval(boot, 1000);
})();
