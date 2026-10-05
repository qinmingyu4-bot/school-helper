(() => {
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

  function setMessage(text) {
    const message = document.querySelector("#profileOnboardingMessage");
    if (message) message.textContent = text || "";
  }

  function paintProfile(user) {
    const profile = user?.profile || {};
    const display = profile.school && profile.major ? `${profile.school} · ${profile.major}` : profile.school || profile.major || "";
    const profileSchool = document.querySelector("#profileSchool");
    const profilePreviewSchool = document.querySelector("#profilePreviewSchool");
    const majorInput = document.querySelector("#majorInput");
    const schoolInput = document.querySelector("#schoolInput");
    if (profileSchool && display) profileSchool.textContent = display;
    if (profilePreviewSchool && display) profilePreviewSchool.textContent = display;
    if (schoolInput) schoolInput.value = profile.school || "";
    if (majorInput) majorInput.value = profile.major || "";
  }

  async function saveOnboarding(event) {
    const form = event.target?.closest?.("#profileOnboardingForm");
    if (!form) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const school = form.querySelector("#onboardingSchoolInput")?.value.trim() || "";
    const major = form.querySelector("#onboardingMajorInput")?.value.trim() || "";
    if (!school || !major) {
      setMessage("学校和专业都需要填写。");
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    if (button) {
      button.disabled = true;
      button.textContent = "正在保存...";
    }

    try {
      const me = await api("/api/me");
      const user = me.user;
      const profile = user.profile || {};
      const result = await api("/api/me/profile", {
        method: "PUT",
        body: {
          name: user.name || "StudyBridge user",
          school,
          major,
          sbId: profile.sbId || "",
          avatarUrl: profile.avatarUrl || "",
          backgroundUrl: profile.backgroundUrl || ""
        }
      });
      localStorage.setItem("studybridgeProfileOnboardingDone", "true");
      paintProfile(result.user);
      document.querySelector("#profileOnboardingOverlay")?.remove();
    } catch (error) {
      setMessage(error.message || "保存失败，请再试一次。");
      if (button) {
        button.disabled = false;
        button.textContent = "保存并进入";
      }
    }
  }

  document.addEventListener("submit", saveOnboarding, true);
})();