(() => {
  const TEXT = {
    title: "\u7cfb\u7edf\u72b6\u6001",
    waiting: "\u7b49\u5f85\u68c0\u6d4b",
    check: "\u68c0\u6d4b",
    checkingButton: "\u68c0\u6d4b\u4e2d...",
    completeButton: "\u68c0\u6d4b\u5b8c\u6210",
    checkingTitle: "\u68c0\u6d4b\u4e2d",
    checkingValue: "\u6b63\u5728\u8bfb\u53d6\u7cfb\u7edf\u72b6\u6001",
    checkingNote: "\u8bf7\u7a0d\u7b49\u51e0\u79d2\u3002",
    currentVersion: "\u5f53\u524d\u7248\u672c",
    deployTime: "\u6700\u540e\u90e8\u7f72\u65f6\u95f4",
    dbMode: "\u6570\u636e\u5e93\u6a21\u5f0f",
    aiStatus: "AI \u662f\u5426\u6b63\u5e38",
    googleLogin: "Google \u767b\u5f55",
    emailCode: "\u90ae\u7bb1\u9a8c\u8bc1\u7801",
    autoSync: "\u670d\u52a1\u5668\u81ea\u52a8\u540c\u6b65",
    adminApi: "\u7ba1\u7406\u63a5\u53e3",
    ok: "\u6b63\u5e38",
    configured: "\u5df2\u914d\u7f6e",
    notConfigured: "\u672a\u914d\u7f6e",
    unknown: "\u672a\u77e5",
    updated: "\u4e0a\u6b21\u68c0\u6d4b",
    completed: "\u68c0\u6d4b\u5b8c\u6210"
  };

  const STATUS_ID = "systemStatusPanel";

  function api(path) {
    return fetch(path, { credentials: "same-origin" }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Request failed.");
      return payload;
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function installStyle() {
    if (document.querySelector("#studybridge-system-status-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-system-status-style";
    style.textContent = `
      .system-status-panel { margin-top: 14px; margin-bottom: 0; max-width: 1120px; border: 1px solid var(--line); border-radius: 8px; background: white; box-shadow: 0 12px 30px rgba(25, 36, 58, 0.05); }
      .system-status-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
      .system-status-head h4 { margin: 0; color: var(--navy); font-size: 16px; }
      .system-status-head span { color: var(--muted); font-size: 12px; }
      .system-status-panel.checking { border-color: #d48b1f; box-shadow: 0 0 0 3px rgba(212, 139, 31, 0.1), 0 12px 30px rgba(25, 36, 58, 0.05); }
      .system-status-panel.checked { border-color: #2f7d62; box-shadow: 0 0 0 3px rgba(47, 125, 98, 0.11), 0 12px 30px rgba(25, 36, 58, 0.05); }
      #refreshSystemStatusButton[disabled] { opacity: 0.72; cursor: wait; }
      .system-status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; padding: 12px 16px 12px; }
      .system-status-card { display: grid; gap: 6px; min-height: 86px; padding: 12px; border: 1px solid #dfe7f1; border-radius: 8px; background: #fbfdff; }
      .system-status-title { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; font-weight: 850; }
      .system-status-dot { width: 9px; height: 9px; border-radius: 999px; background: #9aa8bb; }
      .system-status-dot.ok { background: #2f7d62; }
      .system-status-dot.warn { background: #d48b1f; }
      .system-status-dot.bad { background: #c13b3b; }
      .system-status-value { color: var(--navy); font-size: 14px; font-weight: 850; line-height: 1.35; }
      .system-status-note { color: var(--muted); font-size: 12px; line-height: 1.35; }
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    const developerPanel = document.querySelector("#developerPanel");
    if (!developerPanel) return null;
    let panel = document.querySelector(`#${STATUS_ID}`);
    if (panel) return panel;
    panel = document.createElement("section");
    panel.id = STATUS_ID;
    panel.className = "system-status-panel";
    panel.innerHTML = `
      <div class="system-status-head">
        <div><h4>${TEXT.title}</h4><span id="systemStatusUpdated">${TEXT.waiting}</span></div>
        <button class="small-button" id="refreshSystemStatusButton" type="button">${TEXT.check}</button>
      </div>
      <div class="system-status-grid" id="systemStatusGrid"></div>
    `;
    developerPanel.appendChild(panel);
    panel.querySelector("#refreshSystemStatusButton")?.addEventListener("click", loadStatus);
    return panel;
  }

  function formatDate(value) {
    if (!value) return "\u6682\u672a\u68c0\u6d4b\u5230";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("zh-CN");
  }

  function card(title, level, value, note) {
    return `
      <article class="system-status-card">
        <div class="system-status-title"><span class="system-status-dot ${level}"></span>${escapeHtml(title)}</div>
        <div class="system-status-value">${escapeHtml(value)}</div>
        <div class="system-status-note">${escapeHtml(note || "")}</div>
      </article>
    `;
  }

  function captureScrollState() {
    const workspace = document.querySelector(".workspace");
    const appShell = document.querySelector("#appShell");
    return {
      windowX: window.scrollX,
      windowY: window.scrollY,
      workspaceTop: workspace?.scrollTop || 0,
      appShellTop: appShell?.scrollTop || 0,
      activeElement: document.activeElement
    };
  }

  function restoreScrollState(state) {
    const workspace = document.querySelector(".workspace");
    const appShell = document.querySelector("#appShell");
    if (workspace) workspace.scrollTop = state.workspaceTop;
    if (appShell) appShell.scrollTop = state.appShellTop;
    window.scrollTo(state.windowX, state.windowY);
    if (state.activeElement && typeof state.activeElement.focus === "function") {
      state.activeElement.focus({ preventScroll: true });
    }
  }

  async function loadStatus(event) {
    event?.preventDefault?.();
    const scrollState = captureScrollState();
    const panel = ensurePanel();
    if (!panel) return;
    const grid = panel.querySelector("#systemStatusGrid");
    const updated = panel.querySelector("#systemStatusUpdated");
    const button = panel.querySelector("#refreshSystemStatusButton");
    panel.classList.remove("checked");
    panel.classList.add("checking");
    if (button) {
      button.disabled = true;
      button.textContent = TEXT.checkingButton;
    }
    if (updated) updated.textContent = `${TEXT.checkingTitle}\uff1a${new Date().toLocaleString("zh-CN")}`;
    if (grid) grid.innerHTML = card(TEXT.checkingTitle, "warn", TEXT.checkingValue, TEXT.checkingNote);
    restoreScrollState(scrollState);

    const checks = await Promise.allSettled([
      api("/api/health"),
      api("/api/auth/google/config"),
      api("/api/admin/overview"),
      api("/api/admin/system-status")
    ]);

    const health = checks[0].status === "fulfilled" ? checks[0].value : null;
    const google = checks[1].status === "fulfilled" ? checks[1].value : null;
    const overviewOk = checks[2].status === "fulfilled";
    const system = checks[3].status === "fulfilled" ? checks[3].value : null;
    const systemReady = Boolean(system);
    const dbMode = system?.database?.mode || health?.db || TEXT.unknown;
    const dbReady = Boolean(system?.database?.ready ?? health?.ok);
    const googleEnabled = Boolean(system?.google?.enabled ?? google?.enabled);
    const emailConfigured = Boolean(system?.email?.sendingConfigured);
    const emailRequired = Boolean(system?.email?.verificationRequired);
    const aiConfigured = systemReady ? Boolean(system?.ai?.configured) : true;
    const aiOk = Boolean(system?.ai?.ok);
    const aiModel = system?.ai?.simpleModel || "";
    const autoSyncConfigured = Boolean(system?.autoSync?.configured);
    const version = system?.version?.app || "StudyBridge";
    const deployedAt = system?.deploy?.lastCodeUpdateAt || system?.deploy?.serverStartedAt || "";

    if (grid) {
      grid.innerHTML = [
        card(TEXT.currentVersion, systemReady ? "ok" : "warn", version, systemReady ? `Node ${system?.version?.node || ""}` : "\u540e\u7aef\u6df1\u5ea6\u8bca\u65ad\u63a5\u53e3\u5f85\u90e8\u7f72\u3002"),
        card(TEXT.deployTime, deployedAt ? "ok" : "warn", formatDate(deployedAt), deployedAt ? "\u6309\u670d\u52a1\u5668\u6587\u4ef6\u65f6\u95f4\u663e\u793a\u3002" : "\u53ef\u786e\u8ba4\u670d\u52a1\u5728\u7ebf\u3002"),
        card(TEXT.dbMode, dbReady ? "ok" : "bad", dbMode, system?.database?.note || (dbReady ? "Database is readable and writable." : "Database check failed.")),
        card(TEXT.aiStatus, aiOk ? "ok" : "bad", aiOk ? TEXT.ok : aiConfigured ? "\u68c0\u6d4b\u5931\u8d25" : TEXT.notConfigured, system?.ai?.detail || (aiModel ? `\u5f53\u524d\u6a21\u578b ${aiModel} \u8fd8\u6ca1\u6709\u68c0\u6d4b\u901a\u8fc7\u3002` : "\u540e\u7aef\u4f1a\u505a\u4e00\u6b21\u771f\u5b9e AI \u56de\u590d\u68c0\u6d4b\uff0cAI key \u4e0d\u4f1a\u5728\u524d\u7aef\u663e\u793a\u3002")),
        card(TEXT.googleLogin, googleEnabled ? "ok" : "warn", googleEnabled ? TEXT.configured : TEXT.notConfigured, googleEnabled ? "\u7528\u6237\u53ef\u4ee5\u4f7f\u7528 Google \u767b\u5f55\u3002" : "\u666e\u901a\u90ae\u7bb1\u6ce8\u518c\u4ecd\u53ef\u7528\u3002"),
        card(TEXT.emailCode, emailConfigured || !emailRequired ? "ok" : "bad", emailConfigured ? "\u53d1\u4fe1\u5df2\u914d\u7f6e" : emailRequired ? "\u8981\u6c42\u9a8c\u8bc1\u4f46\u672a\u914d\u7f6e\u53d1\u4fe1" : "\u975e\u5fc5\u9700", emailConfigured ? "\u90ae\u7bb1\u9a8c\u8bc1\u7801\u53ef\u4ee5\u771f\u5b9e\u53d1\u9001\u3002" : emailRequired ? "\u6ce8\u518c\u4f1a\u4f9d\u8d56\u90ae\u7bb1\u9a8c\u8bc1\u7801\u3002" : "\u5f53\u524d\u4f7f\u7528\u9080\u8bf7\u7801\u63a7\u5236\u6ce8\u518c\uff0c\u6682\u4e0d\u5f3a\u5236\u90ae\u7bb1\u53d1\u4fe1\u3002"),
        card(TEXT.autoSync, autoSyncConfigured ? "ok" : "warn", autoSyncConfigured ? "\u5df2\u68c0\u6d4b\u5230" : "\u672a\u786e\u8ba4", system?.autoSync?.note || "\u5982\u679c\u9875\u9762\u6700\u8fd1\u5df2\u81ea\u52a8\u66f4\u65b0\uff0c\u8bf4\u660e\u540c\u6b65\u673a\u5236\u6b63\u5728\u5de5\u4f5c\u3002"),
        card(TEXT.adminApi, overviewOk ? "ok" : "bad", overviewOk ? TEXT.ok : "\u5f02\u5e38", overviewOk ? "\u53ef\u4ee5\u8bfb\u53d6\u7528\u6237\u3001\u9080\u8bf7\u7801\u548c\u91cd\u7f6e\u7533\u8bf7\u3002" : checks[2].reason?.message || "\u65e0\u6cd5\u8bfb\u53d6\u5f00\u53d1\u8005\u6570\u636e\u3002")
      ].join("");
    }
    panel.classList.remove("checking");
    panel.classList.add("checked");
    if (updated) updated.textContent = `${TEXT.completed}\uff1a${new Date().toLocaleString("zh-CN")}`;
    if (button) {
      button.disabled = false;
      button.textContent = TEXT.completeButton;
      setTimeout(() => {
        button.textContent = TEXT.check;
        panel.classList.remove("checked");
      }, 1400);
    }
    restoreScrollState(scrollState);
  }

  function boot() {
    installStyle();
    ensurePanel();
    document.querySelector("#refreshAdminButton")?.addEventListener("click", () => setTimeout(loadStatus, 250));
    setInterval(() => {
      if (document.querySelector("#developerPanel:not([hidden])")) ensurePanel();
    }, 1200);
    setTimeout(loadStatus, 1800);
  }

  boot();
})();
