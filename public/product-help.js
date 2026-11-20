(function () {
  "use strict";
  let owner = null, language = "", dialog, history = [], controller, busy = false;
  const words = {
    title: ["StudyBridge 使用帮助", "StudyBridge Help"],
    intro: ["平台承担费用 · 不消耗个人额度", "Funded by StudyBridge · No personal allowance used"],
    welcome: ["想找哪个功能？可以问我如何上传资料、使用课程笔记或找到成绩规划。学习问题请在学习区提问。", "Looking for a feature? Ask how to upload materials, use course notes or find the grade planner. Ask learning questions in Study."],
    close: ["关闭", "Close"], send: ["发送", "Send"], placeholder: ["询问 StudyBridge 如何使用…", "Ask how to use StudyBridge…"],
    back: ["回到学习区提问", "Back to Study"], waiting: ["正在查找使用帮助…", "Finding product help…"],
    error: ["暂时无法回答，请稍后重试。", "Unable to answer right now. Please retry."],
    limited: ["请求较多，请稍后再试。", "Too many requests. Please try again later."],
    materials: ["如何上传课程资料？", "How do I upload course materials?"], notes: ["课程笔记在哪里？", "Where are Course notes?"]
  };
  const t = (key) => words[key][language === "en" ? 1 : 0];
  function add(role, content) {
    const p = document.createElement("p");
    p.className = `help-message help-${role}`;
    p.textContent = content;
    dialog.querySelector(".help-log").append(p);
    p.scrollIntoView({ block: "nearest" });
  }
  function close() { dialog.close(); document.querySelector(".product-help-launch")?.focus(); }
  function build() {
    dialog = document.createElement("dialog");
    dialog.id = "product-help-panel";
    dialog.className = "product-help-panel";
    dialog.setAttribute("aria-labelledby", "product-help-title");
    dialog.innerHTML = `<header><div><h2 id="product-help-title"></h2><small></small></div><button type="button" class="help-close">×</button></header><div class="help-log" role="log" aria-live="polite" aria-relevant="additions"></div><div class="help-prompts"><button type="button" data-help-prompt="materials"></button><button type="button" data-help-prompt="notes"></button></div><p class="help-status" role="status"></p><form><textarea rows="2" maxlength="1500" required></textarea><button type="submit"></button></form><button type="button" class="help-back"></button>`;
    dialog.querySelector("h2").textContent = t("title");
    dialog.querySelector("small").textContent = t("intro");
    const closer = dialog.querySelector(".help-close");
    closer.setAttribute("aria-label", t("close")); closer.onclick = close;
    const input = dialog.querySelector("textarea");
    input.placeholder = t("placeholder"); input.setAttribute("aria-label", t("placeholder"));
    dialog.querySelector('[type="submit"]').textContent = t("send");
    dialog.querySelector(".help-back").textContent = t("back");
    dialog.querySelector(".help-back").onclick = () => { close(); document.getElementById("chatInput")?.focus(); };
    dialog.addEventListener("close", () => document.querySelector(".product-help-launch")?.setAttribute("aria-expanded", "false"));
    for (const button of dialog.querySelectorAll("[data-help-prompt]")) {
      button.textContent = t(button.dataset.helpPrompt);
      button.onclick = () => { input.value = button.textContent; input.focus(); };
    }
    input.onkeydown = (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); dialog.querySelector("form").requestSubmit(); }
    };
    dialog.querySelector("form").onsubmit = async (event) => {
      event.preventDefault();
      const message = input.value.trim();
      if (!message || busy) return;
      const requestOwner = owner, activeDialog = dialog;
      controller = new AbortController(); busy = true;
      const submit = dialog.querySelector('[type="submit"]'), status = dialog.querySelector(".help-status");
      submit.disabled = true; status.textContent = t("waiting");
      const context = history.slice(-10);
      add("user", message); input.value = "";
      try {
        const response = await fetch("/api/product-help", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, history: context, language }), signal: controller.signal });
        const result = await response.json();
        if (owner !== requestOwner || dialog !== activeDialog) return;
        if (!response.ok) throw new Error(response.status === 429 ? t("limited") : t("error"));
        history.push({ role: "user", content: message }, { role: "assistant", content: result.reply });
        history = history.slice(-12);
        add("assistant", result.reply); status.textContent = "";
      } catch (error) {
        if (owner !== requestOwner || dialog !== activeDialog) return;
        status.textContent = error.name === "AbortError" ? t("error") : error.message;
        if (!input.value) input.value = message;
      } finally {
        if (owner === requestOwner && dialog === activeDialog) { busy = false; submit.disabled = false; if (dialog.open) input.focus(); }
      }
    };
    document.body.append(dialog);
    add("assistant", t("welcome"));
    for (const message of history) add(message.role, message.content);
  }
  function sync({ userId, active, lang }) {
    if (owner !== userId || language !== lang) {
      controller?.abort(); busy = false;
      if (owner !== userId) history = [];
      dialog?.remove(); dialog = null; owner = userId; language = lang;
    }
    if (!userId || !active) { if (dialog?.open) dialog.close(); return; }
    const toolbar = document.querySelector(".study-workspace .study-toolbar");
    if (!toolbar || toolbar.querySelector(".product-help-launch")) return;
    const button = document.createElement("button");
    button.type = "button"; button.className = "product-help-launch"; button.textContent = "AI";
    button.title = t("title"); button.setAttribute("aria-label", t("title"));
    button.setAttribute("aria-haspopup", "dialog"); button.setAttribute("aria-controls", "product-help-panel");
    button.setAttribute("aria-expanded", String(Boolean(dialog?.open)));
    button.onclick = () => { if (!dialog) build(); dialog.showModal(); button.setAttribute("aria-expanded", "true"); dialog.querySelector("textarea").focus(); };
    toolbar.append(button);
  }
  window.StudyBridgeProductHelp = { sync };
})();
