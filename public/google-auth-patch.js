(() => {
  const authForm = document.querySelector("#authForm");
  const authMessage = document.querySelector("#authMessage");
  const inviteInput = document.querySelector("#inviteInput");
  if (!authForm || document.querySelector("#googleAuthButton")) return;

  const style = document.createElement("style");
  style.textContent = `
    .google-auth-divider {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #64748b;
      font-size: 12px;
      font-weight: 800;
      margin: 2px 0;
    }
    .google-auth-divider::before,
    .google-auth-divider::after {
      content: "";
      height: 1px;
      flex: 1;
      background: #d8dee8;
    }
    .google-auth-button {
      min-height: 42px;
      border: 1px solid #d8dee8;
      border-radius: 8px;
      background: #fff;
      color: #0f1b33;
      font-weight: 900;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
    }
    .google-auth-button::before {
      content: "G";
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: inline-grid;
      place-items: center;
      border: 1px solid #d8dee8;
      color: #1a73e8;
      font-weight: 900;
      font-family: Arial, sans-serif;
    }
    .google-auth-button:disabled {
      cursor: not-allowed;
      opacity: 0.62;
    }
    .google-auth-note {
      margin: -4px 0 0;
      color: #64748b;
      font-size: 12px;
      line-height: 1.5;
    }
  `;
  document.head.appendChild(style);

  const divider = document.createElement("div");
  divider.className = "google-auth-divider";
  divider.textContent = "or";

  const button = document.createElement("button");
  button.id = "googleAuthButton";
  button.className = "google-auth-button";
  button.type = "button";
  button.textContent = "使用 Google 登录";

  const note = document.createElement("p");
  note.className = "google-auth-note";
  note.id = "googleAuthNote";
  note.textContent = "第一次用 Google 注册时，也需要输入创作者给的邀请码。";

  const submitButton = document.querySelector("#authSubmit");
  if (!submitButton) return;
  authForm.insertBefore(divider, submitButton);
  authForm.insertBefore(button, submitButton);
  authForm.insertBefore(note, submitButton);

  function activeMode() {
    return document.querySelector("[data-auth-mode].active")?.dataset.authMode === "register" ? "register" : "login";
  }

  function syncButtonText() {
    const mode = activeMode();
    button.textContent = mode === "register" ? "使用 Google 注册" : "使用 Google 登录";
    note.hidden = mode !== "register";
  }

  async function loadConfig() {
    try {
      const response = await fetch("/api/auth/google/config", { credentials: "include" });
      const result = await response.json();
      if (!result.enabled) {
        button.disabled = true;
        button.textContent = "Google 登录待配置";
        note.hidden = false;
        note.textContent = "配置 Google Client ID 和 Secret 后，这里会自动启用。普通邮箱注册仍可使用。";
      }
    } catch {
      button.disabled = true;
      button.textContent = "Google 登录暂不可用";
      note.hidden = false;
      note.textContent = "普通邮箱注册仍可使用。";
    }
  }

  button.addEventListener("click", () => {
    const mode = activeMode();
    const inviteCode = String(inviteInput?.value || "").trim();
    if (mode === "register" && !inviteCode) {
      if (authMessage) authMessage.textContent = "第一次使用 Google 注册也需要邀请码。";
      inviteInput?.focus();
      return;
    }
    const target = new URL("/api/auth/google/start", window.location.origin);
    target.searchParams.set("mode", mode);
    if (inviteCode) target.searchParams.set("inviteCode", inviteCode);
    window.location.href = target.toString();
  });

  document.querySelectorAll("[data-auth-mode]").forEach((tab) => {
    tab.addEventListener("click", () => setTimeout(syncButtonText, 0));
  });

  const params = new URLSearchParams(window.location.search);
  const authError = params.get("authError");
  if (authError) {
    if (authMessage) authMessage.textContent = authError;
    window.history.replaceState({}, "", window.location.pathname);
  } else if (params.get("googleAuth") === "ok") {
    window.history.replaceState({}, "", window.location.pathname);
    window.location.reload();
  }

  syncButtonText();
  loadConfig();
})();

(() => {
  const VERSION = "20261008-google-auth-loader-1.0.88";
  if (window.__studybridgeGoogleAuthLoaderVersion === VERSION) return;
  window.__studybridgeGoogleAuthLoaderVersion = VERSION;

  function loadOnce(src, flagName) {
    if (document.querySelector(`script[data-${flagName}]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    script.dataset[flagName.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = "true";
    document.body.appendChild(script);
  }

  function loadHotfixes() {
    loadOnce("/profile-school-overview-hotfix.js?v=20261008-1.0.84", "profile-school-overview");
    loadOnce("/sidebar-role-boundary-hotfix.js?v=20261008-1.0.85", "sidebar-role-boundary");
    loadOnce("/studybridge-tools-hotfix.js?v=20261008-1.0.88", "studybridge-tools");
    loadOnce("/admin-invite-user-map-hotfix.js?v=20261008-1.0.87", "admin-invite-user-map");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadHotfixes, { once:true });
  else loadHotfixes();
})();