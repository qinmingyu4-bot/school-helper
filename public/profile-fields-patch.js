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
    `;
    document.head.appendChild(style);
  }

  function ensureInput(id, placeholder, afterElement) {
    let input = $(`#${id}`);
    if (input) return input;
    input = document.createElement("input");
    input.id = id;
    input.className = "profile-form-field";
    input.type = "text";
    input.placeholder = placeholder;
    if (afterElement) afterElement.insertAdjacentElement("afterend", input);
    return input;
  }

  function ensureFields() {
    const schoolInput = $("#schoolInput");
    if (!schoolInput) return;
    const majorInput = ensureInput("majorInput", "专业，例如 Business / Engineering", schoolInput);
    const sbIdInput = ensureInput("sbIdInput", "SB ID，例如 adam2026", majorInput);
    sbIdInput.autocomplete = "off";
    sbIdInput.spellcheck = false;
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

  function renderUser(user) {
    if (!user) return;
    cachedUser = user;
    const profile = user.profile || {};
    const majorInput = $("#majorInput");
    const sbIdInput = $("#sbIdInput");
    if (majorInput && document.activeElement !== majorInput) majorInput.value = profile.major || "";
    if (sbIdInput && document.activeElement !== sbIdInput) sbIdInput.value = profile.sbId || "";

    const line = ensureDisplay();
    if (!line) return;
    const rows = [];
    if (profile.major) rows.push(`<span><b>专业</b> ${escapeHtml(profile.major)}</span>`);
    if (profile.sbId) rows.push(`<span><b>SB ID</b> @${escapeHtml(profile.sbId)}</span>`);
    line.innerHTML = rows.length ? rows.join("") : `<span>设置专业和 SB ID 后，同学更容易找到你。</span>`;
  }

  async function refreshProfile() {
    try {
      const result = await api("/api/me");
      renderUser(result.user);
    } catch {
      cachedUser = null;
    }
  }

  function installSubmitSync() {
    const form = $("#profileForm");
    if (!form || form.dataset.profileFieldsPatch === "true") return;
    form.dataset.profileFieldsPatch = "true";
    form.addEventListener("submit", () => {
      setTimeout(refreshProfile, 300);
    });
  }

  function boot() {
    installStyle();
    ensureFields();
    ensureDisplay();
    installSubmitSync();
    if (cachedUser) renderUser(cachedUser);
  }

  boot();
  refreshProfile();
  setInterval(boot, 1000);
})();
