(() => {
  const marker = "[StudyBridge personal profile]";
  let currentUser = null;
  let initialized = false;

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function parseMajor(user = currentUser) {
    const profileMajor = user?.profile?.major || "";
    if (profileMajor) return profileMajor;
    const preferences = user?.preferences?.customInstruction || "";
    const match = preferences.match(/Student major:\s*([^\n.]+(?:\s+[^\n.]+)*)\.?/i);
    return match ? match[1].trim() : "";
  }

  function cleanBaseInstruction(value) {
    return String(value || "").split(marker)[0].trim();
  }

  function buildProfileInstruction({ name, school, major, base }) {
    const lines = [];
    if (name) lines.push(`Student preferred name: ${name}.`);
    if (school) {
      lines.push(
        `Student school: ${school}. When useful, tailor examples, terminology, academic expectations, campus context, and course-planning advice to this school.`
      );
    }
    if (major) {
      lines.push(
        `Student major: ${major}. When useful, tailor explanations, examples, study plans, project ideas, and vocabulary to this major.`
      );
    }
    return lines.length ? `${base}${base ? "\n\n" : ""}${marker}\n${lines.join("\n")}` : base;
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
      return null;
    }
  }

  function installStyle() {
    if (document.querySelector("#studybridge-profile-onboarding-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-profile-onboarding-style";
    style.textContent = `
      .profile-detail-line {
        display: grid;
        gap: 3px;
      }

      .profile-major-muted {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
      }

      .profile-onboarding-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: grid;
        place-items: center;
        padding: 20px;
        background: rgba(23, 32, 51, 0.38);
        backdrop-filter: blur(5px);
      }

      .profile-onboarding-card {
        display: grid;
        gap: 14px;
        width: min(480px, 100%);
        padding: 22px;
        border: 1px solid rgba(216, 222, 232, 0.92);
        border-radius: 8px;
        background: white;
        box-shadow: 0 24px 70px rgba(25, 36, 58, 0.22);
      }

      .profile-onboarding-card h3 {
        margin: 0;
        color: var(--navy);
        font-size: 22px;
      }

      .profile-onboarding-card p {
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
      }

      .profile-onboarding-actions {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        align-items: center;
      }

      .profile-onboarding-message {
        min-height: 18px;
        margin: 0;
        color: var(--red);
        font-size: 12px;
      }

      .profile-onboarding-actions-inner {
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
      }

      .profile-onboarding-secondary {
        border: 1px solid var(--line);
        border-radius: 8px;
        background: white;
        color: var(--muted);
        min-height: 40px;
        padding: 0 14px;
        font-weight: 800;
        cursor: pointer;
      }

      .profile-onboarding-secondary:hover {
        color: var(--navy);
        border-color: var(--green);
      }
    `;
    document.head.appendChild(style);
  }

  function ensureMajorField() {
    const schoolInput = document.querySelector("#schoolInput");
    if (!schoolInput || document.querySelector("#majorInput")) return;
    const schoolLabel = schoolInput.closest("label");
    if (!schoolLabel) return;
    const label = document.createElement("label");
    label.innerHTML = `
      <span>专业</span>
      <input id="majorInput" placeholder="例如 Computer Science / Business / Nursing" />
    `;
    schoolLabel.insertAdjacentElement("afterend", label);
    const majorInput = label.querySelector("#majorInput");
    majorInput.value = parseMajor();
    majorInput.addEventListener("input", renderProfileMajor);
  }

  function profileDisplayText(profile = currentUser?.profile || {}, major = parseMajor()) {
    const school = profile.school || "";
    if (school && major) return `${school} · ${major}`;
    if (school) return school;
    if (major) return `专业：${major}`;
    return "添加学校和专业后，AI 会更懂你的学习环境。";
  }

  function renderProfileMajor() {
    const user = currentUser;
    if (!user) return;
    const profile = user.profile || {};
    const draftMajor = document.querySelector("#majorInput")?.value.trim();
    const major = draftMajor || parseMajor(user);
    const text = profileDisplayText(profile, major);
    const profileSchool = document.querySelector("#profileSchool");
    const profilePreviewSchool = document.querySelector("#profilePreviewSchool");
    if (profileSchool) profileSchool.textContent = text;
    if (profilePreviewSchool) profilePreviewSchool.textContent = text === "添加学校和专业后，AI 会更懂你的学习环境。" ? "还没有填写学校和专业。" : text;
  }

  async function saveProfile({ school, major, source = "profile" }) {
    const user = currentUser || (await refreshMe());
    if (!user) throw new Error("请先登录。 ");
    const nameInput = document.querySelector("#profileNameInput");
    const avatarUrlInput = document.querySelector("#avatarUrlInput");
    const backgroundUrlInput = document.querySelector("#backgroundUrlInput");
    const name = nameInput?.value.trim() || user.name || "StudyBridge user";
    const profile = user.profile || {};

    const profileResult = await api("/api/me/profile", {
      method: "PUT",
      body: {
        name,
        school,
        avatarUrl: avatarUrlInput?.value || profile.avatarUrl || "",
        backgroundUrl: backgroundUrlInput?.value || profile.backgroundUrl || ""
      }
    });

    const currentPreferences = profileResult.user.preferences || user.preferences || {};
    const customInstruction = buildProfileInstruction({
      name,
      school,
      major,
      base: cleanBaseInstruction(currentPreferences.customInstruction)
    });
    const preferencesResult = await api("/api/me/preferences", {
      method: "PUT",
      body: {
        englishTerms: currentPreferences.englishTerms !== false,
        englishAnswers: currentPreferences.englishAnswers !== false,
        chineseExplanations: currentPreferences.chineseExplanations !== false,
        customInstruction
      }
    });

    currentUser = preferencesResult.user;
    currentUser.profile = { ...(currentUser.profile || {}), school, major };
    renderProfileMajor();
    localStorage.setItem("studybridgeProfileOnboardingDone", "true");
    if (source === "modal") window.location.reload();
    return currentUser;
  }

  function interceptProfileSubmit() {
    const form = document.querySelector("#profileForm");
    if (!form || form.dataset.majorSubmitReady === "true") return;
    form.dataset.majorSubmitReady = "true";
    form.addEventListener(
      "submit",
      async (event) => {
        const majorInput = document.querySelector("#majorInput");
        const schoolInput = document.querySelector("#schoolInput");
        if (!majorInput || !schoolInput) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const message = document.querySelector("#profileMessage");
        if (message) message.textContent = "";
        try {
          await saveProfile({ school: schoolInput.value.trim(), major: majorInput.value.trim(), source: "profile" });
          if (message) message.textContent = "已保存。AI 会用你的学校和专业来辅助回答。";
          setTimeout(() => window.location.reload(), 450);
        } catch (error) {
          if (message) message.textContent = error.message;
        }
      },
      true
    );
  }

  function createOnboardingModal(user) {
    if (document.querySelector("#profileOnboardingOverlay")) return;
    const profile = user.profile || {};
    const overlay = document.createElement("section");
    overlay.id = "profileOnboardingOverlay";
    overlay.className = "profile-onboarding-overlay";
    overlay.innerHTML = `
      <form class="profile-onboarding-card" id="profileOnboardingForm">
        <div>
          <p class="eyebrow">Personal setup</p>
          <h3>先设置你的学校和专业</h3>
        </div>
        <p>这两项会帮助 StudyBridge 之后按照你的学校环境和专业方向来解释课程、规划复习和举例。</p>
        <label>
          <span>学校</span>
          <input id="onboardingSchoolInput" autocomplete="off" placeholder="例如 Centennial College / University of Toronto" value="${escapeHtml(profile.school || "")}" required />
        </label>
        <label>
          <span>专业</span>
          <input id="onboardingMajorInput" placeholder="例如 Computer Science / Business / Nursing" value="${escapeHtml(parseMajor(user))}" required />
        </label>
        <div class="profile-onboarding-actions">
          <p class="profile-onboarding-message" id="profileOnboardingMessage"></p>
          <div class="profile-onboarding-actions-inner">
            <button class="profile-onboarding-secondary" id="skipProfileOnboardingButton" type="button">暂时不填，以后再填</button>
            <button class="primary-button" type="submit">保存并进入</button>
          </div>
        </div>
      </form>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector("#skipProfileOnboardingButton")?.addEventListener("click", () => {
      localStorage.setItem("studybridgeProfileOnboardingDone", "true");
      overlay.remove();
    });

    overlay.querySelector("#profileOnboardingForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = overlay.querySelector("#profileOnboardingMessage");
      const school = overlay.querySelector("#onboardingSchoolInput")?.value.trim() || "";
      const major = overlay.querySelector("#onboardingMajorInput")?.value.trim() || "";
      if (!school || !major) {
        if (message) message.textContent = "学校和专业都需要填写。";
        return;
      }
      try {
        await saveProfile({ school, major, source: "modal" });
      } catch (error) {
        if (message) message.textContent = error.message;
      }
    });
  }

  async function maybeShowOnboarding() {
    if (localStorage.getItem("studybridgeProfileOnboardingDone") === "true") return;
    const user = currentUser || (await refreshMe());
    if (!user || user.role === "admin") return;
    const profile = user.profile || {};
    const major = parseMajor(user);
    if (profile.school && major) return;
    createOnboardingModal(user);
  }

  async function init() {
    if (initialized) return;
    installStyle();
    await refreshMe();
    ensureMajorField();
    interceptProfileSubmit();
    renderProfileMajor();
    maybeShowOnboarding();
    initialized = true;
  }

  document.addEventListener("click", () => {
    setTimeout(() => {
      ensureMajorField();
      interceptProfileSubmit();
      renderProfileMajor();
    }, 80);
  }, true);

  let checks = 0;
  const timer = setInterval(() => {
    init();
    ensureMajorField();
    renderProfileMajor();
    checks += 1;
    if (checks > 30) clearInterval(timer);
  }, 300);
})();
