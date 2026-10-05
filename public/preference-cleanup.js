(() => {
  const marker = "[StudyBridge personal profile]";
  const textarea = () => document.querySelector("#customInstructionInput");
  const status = () => document.querySelector("#preferenceStatus");
  const adminMessage = () => document.querySelector("#adminMessage");
  const authMessage = () => document.querySelector("#authMessage");

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

  async function requestEmailCode(button) {
    const emailInput = document.querySelector("#emailInput");
    const inviteInput = document.querySelector("#inviteInput");
    const codeInput = document.querySelector("#emailCodeInput");
    const activeMode = document.querySelector("[data-auth-mode].active")?.dataset.authMode || "login";
    const email = emailInput?.value.trim() || "";
    const inviteCode = inviteInput?.value.trim() || "";

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

  document.addEventListener(
    "click",
    async (event) => {
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

  let checks = 0;
  const timer = setInterval(() => {
    const changed = cleanVisiblePreference();
    checks += 1;
    if (changed) persistCleanPreference();
    if (checks > 20) clearInterval(timer);
  }, 250);

  document.querySelector("#profileForm")?.addEventListener("submit", () => {
    setTimeout(() => {
      if (cleanVisiblePreference()) persistCleanPreference();
    }, 800);
  });
})();
