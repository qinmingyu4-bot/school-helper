(() => {
  const VERSION = "login-safe-submit-1.0.71";

  const get = (selector) => document.querySelector(selector);
  const valueOf = (selector) => get(selector)?.value?.trim() || "";
  const setText = (selector, text) => {
    const node = get(selector);
    if (node) node.textContent = text;
  };

  async function request(path, body) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed.");
    return payload;
  }

  function activeAuthMode() {
    return get("[data-auth-mode].active")?.dataset.authMode || "login";
  }

  document.addEventListener(
    "submit",
    async (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.id !== "authForm") return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const submit = get("#authSubmit");
      const mode = activeAuthMode();
      const payload = {
        name: valueOf("#nameInput"),
        email: valueOf("#emailInput"),
        password: valueOf("#passwordInput"),
        inviteCode: valueOf("#inviteInput")
      };

      setText("#authMessage", "");
      if (submit) submit.disabled = true;

      try {
        await request(`/api/auth/${mode}`, payload);
        setText("#authMessage", mode === "register" ? "注册成功，正在进入 StudyBridge..." : "登录成功，正在进入 StudyBridge...");
        window.location.reload();
      } catch (error) {
        setText("#authMessage", error.message || "登录失败，请再试一次。");
      } finally {
        if (submit) submit.disabled = false;
      }
    },
    true
  );

  window.studybridgeLoginSafeSubmitVersion = VERSION;
})();
