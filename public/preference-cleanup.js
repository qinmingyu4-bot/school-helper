(() => {
  const marker = "[StudyBridge personal profile]";
  let manualResetMode = false;
  const textarea = () => document.querySelector("#customInstructionInput");
  const status = () => document.querySelector("#preferenceStatus");
  const adminMessage = () => document.querySelector("#adminMessage");
  const authMessage = () => document.querySelector("#authMessage");

  function installLayoutPatch() {
    if (document.querySelector("#studybridge-layout-patch")) return;
    const style = document.createElement("style");
    style.id = "studybridge-layout-patch";
    style.textContent = `
      #workspacePage {
        grid-template-rows: auto auto minmax(0, 1fr) auto auto !important;
        grid-template-areas:
          "topbar"
          "developer"
          "chat"
          "quick"
          "composer";
      }

      #workspacePage > .topbar {
        grid-area: topbar;
      }

      #developerPanel {
        grid-area: developer;
      }

      #chatArea {
        grid-area: chat;
        min-height: 0;
      }

      #quickPrompts {
        grid-area: quick;
        align-self: end;
        padding-top: 8px;
        padding-bottom: 0;
      }

      #chatForm {
        grid-area: composer;
      }
    `;
    document.head.appendChild(style);
  }

  function cleanText(value) {
    return String(value || "").split(marker)[0].trim();
  }

  function cleanVisiblePreference() {
    const input = textarea();
    if (!input || !input.value.includes(marker)) return false;
    input.value = cleanText(input.value);
    return true;
  }

  async function persistCleanPreference() {
    const input = textarea();
    if (!input) return;
    const cleaned = cleanText(input.value);
    if (input.value !== cleaned) input.value = cleaned;

    const englishTerms = document.querySelector("#englishTermsToggle")?.checked ?? true;
    const englishAnswers = document.querySelector("#englishAnswersToggle")?.checked ?? true;
    const chineseExplanations = document.querySelector("#chineseExplanationsToggle")?.checked ?? true;

    try {
      const res = await fetch("/api/me/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          englishTerms,
          englishAnswers,
          chineseExplanations,
          customInstruction: cleaned
        })
      });
      if (res.ok && status()) status().textContent = "Saved";
    } catch {
      if (status()) status().textContent = "Saved";
    }
  }

  async function copyText(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}

    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.left = "-9999px";
    helper.style.top = "0";
    document.body.appendChild(helper);
    helper.focus();
    helper.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    helper.remove();
    return copied;
  }

  function setAuthMessage(text, isError = false) {
    const message = authMessage();
    if (!message) return;
    message.textContent = text;
    message.style.color = isError ? "var(--red)" : "var(--green)";
  }

  function passwordLabel() {
    return document.querySelector("#passwordInput")?.closest("label");
  }

  function setManualResetMode(active) {
    manualResetMode = active;
    const passwordInput = document.querySelector("#passwordInput");
    const authSubmit = document.querySelector("#authSubmit");
    const forgotButton = document.querySelector("#forgotPasswordButton");
    const nameField = document.querySelector("#nameField");
    const inviteField = document.querySelector("#inviteField");
    const confirmPasswordField = document.querySelector("#confirmPasswordField");
    const emailCodeField = document.querySelector("#emailCodeField");

    if (active) {
      if (typeof window.setAuthMode === "function") window.setAuthMode("reset");
      document.querySelectorAll("[data-auth-mode]").forEach((button) => button.classList.remove("active"));
      passwordLabel()?.setAttribute("hidden", "");
      if (passwordInput) {
        passwordInput.required = false;
        passwordInput.value = "";
      }
      if (nameField) nameField.hidden = true;
      if (inviteField) inviteField.hidden = true;
      if (confirmPasswordField) confirmPasswordField.hidden = true;
      if (emailCodeField) emailCodeField.hidden = true;
      if (authSubmit) authSubmit.textContent = "发送重置申请";
      if (forgotButton) {
        forgotButton.hidden = false;
        forgotButton.textContent = "返回登录";
      }
      setAuthMessage("输入账号邮箱，创作者会在开发者端看到申请，然后给你临时密码。", false);
      document.querySelector("#emailInput")?.focus();
      return;
    }

    if (typeof window.setAuthMode === "function") window.setAuthMode("login");
    passwordLabel()?.removeAttribute("hidden");
    if (passwordInput) passwordInput.required = true;
    if (forgotButton) forgotButton.textContent = "忘记密码？";
  }

  async function submitManualReset() {
    const emailInput = document.querySelector("#emailInput");
    const authSubmit = document.querySelector("#authSubmit");
    const email = emailInput?.value.trim() || "";
    if (!email || !email.includes("@")) {
      setAuthMessage("请先输入注册邮箱。", true);
      emailInput?.focus();
      return;
    }

    authSubmit.disabled = true;
    try {
      const res = await fetch("/api/auth/request-manual-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "重置申请提交失败，请稍后再试。");
      setAuthMessage(payload.message || "重置申请已提交，请联系创作者领取临时密码。", false);
    } catch (error) {
      setAuthMessage(error.message, true);
    } finally {
      authSubmit.disabled = false;
    }
  }

  async function requestEmailCode(button) {
    const emailInput = document.querySelector("#emailInput");
    const inviteInput = document.querySelector("#inviteInput");
    const codeInput = document.querySelector("#emailCodeInput");
    const activeMode = manualResetMode
      ? "manual-reset"
      : document.querySelector("[data-auth-mode].active")?.dataset.authMode || "login";
    const email = emailInput?.value.trim() || "";
    const inviteCode = inviteInput?.value.trim() || "";

    if (activeMode === "manual-reset") {
      await submitManualReset();
      return;
    }
    if (!email) {
      setAuthMessage("请先输入邮箱。", true);
      emailInput?.focus();
      return;
    }
    if (activeMode === "register" && !inviteCode) {
      setAuthMessage("请先输入邀请码，再发送验证码。", true);
      inviteInput?.focus();
      return;
    }

    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "发送中";
    const path = activeMode === "reset" ? "/api/auth/request-password-reset" : "/api/auth/send-verification";

    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, inviteCode })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "验证码发送失败。请稍后再试。");

      if (payload.emailCode && codeInput) {
        codeInput.value = payload.emailCode;
        setAuthMessage(`服务器邮箱还没配置，临时验证码已自动填入：${payload.emailCode}`);
      } else {
        setAuthMessage("验证码已发送，请查看邮箱。QQ 邮箱也可能在垃圾箱里。", false);
      }
    } catch (error) {
      setAuthMessage(error.message, true);
    } finally {
      setTimeout(() => {
        button.disabled = false;
        button.textContent = originalText || "发送验证码";
      }, 1200);
    }
  }

  function ensureResetPanel() {
    const developerPanel = document.querySelector("#developerPanel");
    const adminGrid = developerPanel?.querySelector(".admin-grid");
    if (!adminGrid) return null;
    let panel = document.querySelector("#passwordResetPanel");
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "passwordResetPanel";
    panel.innerHTML = `
      <h4>密码重置申请</h4>
      <div class="invite-list" id="passwordResetList"></div>
    `;
    adminGrid.appendChild(panel);
    return panel;
  }

  function resetStatusText(status) {
    return status === "completed" ? "已处理" : "等待处理";
  }

  function renderResetRequests(requests = []) {
    ensureResetPanel();
    const list = document.querySelector("#passwordResetList");
    if (!list) return;
    const sorted = [...requests].sort((a, b) => {
      const pendingSort = (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1);
      return pendingSort || String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
    if (!sorted.length) {
      list.innerHTML = `<p class="empty-state">还没有密码重置申请。</p>`;
      return;
    }
    list.innerHTML = sorted
      .map(
        (request) => `
          <div class="invite-item">
            <div>
              <strong>${escapeHtml(request.name || "Student")}</strong>
              <span>${escapeHtml(request.email || "")}</span>
              <span>${resetStatusText(request.status)}</span>
            </div>
            <button class="small-button" data-complete-reset="${escapeHtml(request.id)}" type="button" ${
              request.status === "pending" ? "" : "disabled"
            }>生成临时密码</button>
          </div>
        `
      )
      .join("");
  }

  async function loadResetRequests() {
    const developerPanel = document.querySelector("#developerPanel");
    if (!developerPanel || developerPanel.hidden) return;
    try {
      const res = await fetch("/api/admin/overview");
      if (!res.ok) return;
      const payload = await res.json();
      renderResetRequests(payload.resetRequests || []);
    } catch {}
  }

  async function completeReset(requestId, button) {
    if (!requestId) return;
    button.disabled = true;
    try {
      const res = await fetch(`/api/admin/password-resets/${encodeURIComponent(requestId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" }
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "生成临时密码失败。" );
      const password = payload.temporaryPassword || "";
      const copied = await copyText(password);
      const message = adminMessage();
      if (message) {
        message.textContent = copied
          ? `已生成并复制临时密码：${password}`
          : `已生成临时密码：${password}。请手动复制给学生。`;
      }
      await loadResetRequests();
    } catch (error) {
      const message = adminMessage();
      if (message) message.textContent = error.message;
      button.disabled = false;
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  installLayoutPatch();

  document.addEventListener(
    "click",
    async (event) => {
      const forgotButton = event.target.closest?.("#forgotPasswordButton");
      if (forgotButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setManualResetMode(!manualResetMode);
        return;
      }

      const authModeButton = event.target.closest?.("[data-auth-mode]");
      if (authModeButton) {
        manualResetMode = false;
        passwordLabel()?.removeAttribute("hidden");
        const passwordInput = document.querySelector("#passwordInput");
        if (passwordInput) passwordInput.required = true;
        const forgot = document.querySelector("#forgotPasswordButton");
        if (forgot) forgot.textContent = "忘记密码？";
        return;
      }

      const resetButton = event.target.closest?.("[data-complete-reset]");
      if (resetButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        await completeReset(resetButton.dataset.completeReset, resetButton);
        return;
      }

      const copyButton = event.target.closest?.("[data-copy-invite]");
      if (copyButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const code = copyButton.dataset.copyInvite;
        const copied = await copyText(code);
        const message = adminMessage();
        if (message) {
          message.textContent = copied ? `已复制：${code}` : `复制失败，请手动选中邀请码：${code}`;
        }
        copyButton.textContent = copied ? "已复制" : "手动复制";
        setTimeout(() => {
          copyButton.textContent = "复制";
        }, 1200);
        return;
      }

      const emailButton = event.target.closest?.("#sendEmailCodeButton");
      if (emailButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        await requestEmailCode(emailButton);
      }
    },
    true
  );

  document.querySelector("#authForm")?.addEventListener(
    "submit",
    async (event) => {
      if (!manualResetMode) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      await submitManualReset();
    },
    true
  );

  document.querySelector("#refreshAdminButton")?.addEventListener("click", () => setTimeout(loadResetRequests, 400));

  let checks = 0;
  const timer = setInterval(() => {
    const changed = cleanVisiblePreference();
    installLayoutPatch();
    ensureResetPanel();
    loadResetRequests();
    checks += 1;
    if (changed) persistCleanPreference();
    if (checks > 20) clearInterval(timer);
  }, 250);

  setInterval(loadResetRequests, 8000);

  document.querySelector("#profileForm")?.addEventListener("submit", () => {
    setTimeout(() => {
      if (cleanVisiblePreference()) persistCleanPreference();
    }, 800);
  });
})();
