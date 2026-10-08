(() => {
  const VERSION = "20261008-safe-auth-loader-1.1.4";
  if (window.__studybridgeGoogleAuthLoaderVersion === VERSION) return;
  window.__studybridgeGoogleAuthLoaderVersion = VERSION;

  const $ = (selector, root = document) => root.querySelector(selector);

  function activeMode() {
    return $("[data-auth-mode].active")?.dataset.authMode === "register" ? "register" : "login";
  }

  function setAuthMessage(message) {
    const node = $("#authMessage");
    if (node) node.textContent = message || "";
  }

  function insertGoogleButton() {
    const authForm = $("#authForm");
    if (!authForm || $("#googleAuthButton")) return;

    const style = document.createElement("style");
    style.textContent = `
      .google-auth-divider {
        display: flex;
        align-items: center;
        gap: 10px;
        color: #64748b;
        font-size: 12px;
        font-weight: 800;
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
        margin: -6px 0 0;
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

    const note = document.createElement("p");
    note.className = "google-auth-note";
    note.id = "googleAuthNote";

    const submitButton = $("#authSubmit") || authForm.querySelector("button[type='submit']");
    authForm.insertBefore(divider, submitButton);
    authForm.insertBefore(button, submitButton);
    authForm.insertBefore(note, submitButton);

    function syncButtonText() {
      const mode = activeMode();
      button.textContent = mode === "register" ? "使用 Google 注册" : "使用 Google 登录";
      note.hidden = mode !== "register";
      note.textContent = "第一次使用 Google 注册时，也需要输入创作者给的邀请码。";
    }

    button.addEventListener("click", () => {
      const inviteInput = $("#inviteInput");
      const inviteCode = String(inviteInput?.value || "").trim();
      const mode = activeMode();
      if (mode === "register" && !inviteCode) {
        setAuthMessage("第一次使用 Google 注册也需要邀请码。");
        inviteInput?.focus();
        return;
      }
      const target = new URL("/api/auth/google/start", window.location.origin);
      target.searchParams.set("mode", mode);
      if (inviteCode) target.searchParams.set("inviteCode", inviteCode);
      window.location.href = target.toString();
    });

    document.querySelectorAll("[data-auth-mode]").forEach((tab) => {
      tab.addEventListener("click", syncButtonText);
    });

    syncButtonText();

    fetch("/api/auth/google/config", { credentials: "include" })
      .then((response) => response.json())
      .then((result) => {
        if (result?.enabled) return;
        button.disabled = true;
        button.textContent = "Google 登录待配置";
        note.hidden = false;
        note.textContent = "普通邮箱注册仍可使用。配置 Google Client ID 和 Secret 后，这里会自动启用。";
      })
      .catch(() => {
        button.disabled = true;
        button.textContent = "Google 登录暂不可用";
      });
  }

  function workspaceReady() {
    const shell = $("#appShell");
    return Boolean(shell && shell.hidden === false);
  }

  function scriptLoaded(path) {
    return Array.from(document.scripts).some((script) => script.src.includes(path));
  }

  function loadOnce(src, key) {
    const path = src.split("?")[0];
    if (scriptLoaded(path) || document.querySelector(`script[data-studybridge-loader="${key}"]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    script.dataset.studybridgeLoader = key;
    document.body.appendChild(script);
  }

  function loadWorkspaceScripts() {
    if (!workspaceReady()) return false;
    loadOnce("/stable-pages-router.js?v=20261008-1.1.4", "stable-pages-router");
    return true;
  }

  function waitForWorkspace() {
    if (loadWorkspaceScripts()) return true;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (loadWorkspaceScripts() || attempts > 60) window.clearInterval(timer);
    }, 500);
    return false;
  }

  function handleAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("authError");
    if (authError) {
      setAuthMessage(authError);
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    if (params.get("googleAuth") === "ok") {
      window.history.replaceState({}, "", window.location.pathname);
      window.location.reload();
    }
  }

  function boot() {
    insertGoogleButton();
    handleAuthCallback();
    if (waitForWorkspace()) return;
    const observer = new MutationObserver(() => {
      if (loadWorkspaceScripts()) observer.disconnect();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "class"]
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
