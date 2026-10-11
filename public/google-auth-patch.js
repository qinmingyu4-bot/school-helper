(() => {
  const VERSION = "20261008-safe-auth-loader-1.1.7";
  if (window.__studybridgeGoogleAuthLoaderVersion === VERSION) return;
  window.__studybridgeGoogleAuthLoaderVersion = VERSION;

  const $ = (selector, root = document) => root.querySelector(selector);

  function authMode() {
    return $("[data-auth-mode].active")?.dataset.authMode === "register" ? "register" : "login";
  }

  function setAuthMessage(message) {
    const node = $("#authMessage");
    if (node) node.textContent = message || "";
  }

  async function googleConfig() {
    try {
      const response = await fetch("/api/auth/google/config", { credentials: "include", cache: "no-store" });
      if (!response.ok) return { enabled: false };
      return await response.json();
    } catch {
      return { enabled: false };
    }
  }

  function ensureGoogleButton() {
    const form = $("#authForm");
    if (!form || $("#googleAuthButton")) return;

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
        width: 100%;
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
        font-family: Arial, sans-serif;
        font-weight: 900;
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
    note.id = "googleAuthNote";
    note.className = "google-auth-note";

    const submit = $("#authSubmit") || form.querySelector("button[type='submit']");
    form.insertBefore(divider, submit);
    form.insertBefore(button, submit);
    form.insertBefore(note, submit);

    function syncText() {
      const mode = authMode();
      button.textContent = mode === "register" ? "使用 Google 注册" : "使用 Google 登录";
      note.hidden = mode !== "register";
      note.textContent = "第一次使用 Google 注册时，也需要输入创作者给的邀请码。";
    }

    button.addEventListener("click", async () => {
      const config = await googleConfig();
      if (!config.enabled) {
        setAuthMessage("Google 登录还没有配置好，先使用邮箱和邀请码注册。");
        return;
      }

      const mode = authMode();
      const inviteInput = $("#inviteInput");
      const inviteCode = String(inviteInput?.value || "").trim();
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

    document.querySelectorAll("[data-auth-mode]").forEach((tab) => tab.addEventListener("click", syncText));
    syncText();
  }

  function loadOnce(path, src, key) {
    const exists = Array.from(document.scripts).some((script) => script.src.includes(path));
    if (exists || document.querySelector(`script[data-studybridge-loader="${key}"]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    script.dataset.studybridgeLoader = key;
    document.body.appendChild(script);
  }

  function bootRouterWhenSignedIn() {
    const shell = $("#appShell");
    if (shell && !shell.hidden) {
      loadOnce("/stable-pages-router.js", "/stable-pages-router.js?v=20261008-1.1.7", "stable-pages-router");
      return;
    }
    window.setTimeout(bootRouterWhenSignedIn, 250);
  }

  function boot() {
    ensureGoogleButton();
    bootRouterWhenSignedIn();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
