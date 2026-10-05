(() => {
  const marker = "[StudyBridge personal profile]";
  const textarea = () => document.querySelector("#customInstructionInput");
  const status = () => document.querySelector("#preferenceStatus");
  const adminMessage = () => document.querySelector("#adminMessage");

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

  document.addEventListener(
    "click",
    async (event) => {
      const button = event.target.closest?.("[data-copy-invite]");
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const code = button.dataset.copyInvite;
      const copied = await copyText(code);
      const message = adminMessage();
      if (message) {
        message.textContent = copied ? `已复制：${code}` : `复制失败，请手动选中邀请码：${code}`;
      }
      button.textContent = copied ? "已复制" : "手动复制";
      setTimeout(() => {
        button.textContent = "复制";
      }, 1200);
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
