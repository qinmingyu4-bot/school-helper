(() => {
  let bootFrame = 0;

  function loadScriptOnce(src) {
    const cleanSrc = src.split("?")[0];
    const registry = (window.__studybridgeLoadedScripts ||= new Set());
    const key = new URL(cleanSrc, window.location.href).pathname;
    if (
      registry.has(key) ||
      Array.from(document.scripts).some((script) => {
        const scriptSrc = script.getAttribute("src");
        return scriptSrc && new URL(scriptSrc, window.location.href).pathname === key;
      })
    ) {
      registry.add(key);
      return;
    }
    registry.add(key);
    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    script.addEventListener("error", () => registry.delete(key), { once: true });
    document.body.appendChild(script);
  }

  function loadLatestPatches() {
    loadScriptOnce("/layout-fix.js?v=20261007-5");
    loadScriptOnce("/sidebar-direct-router.js?v=20261007-3");
    loadScriptOnce("/student-nav-hardening-patch.js?v=20261007-4");
    loadScriptOnce("/study-chat-bottom-fix.js?v=20261007-5");
    loadScriptOnce("/study-scroll-hardening-patch.js?v=20261007-2");
    loadScriptOnce("/study-attachment-patch.js?v=20261007-1");
    loadScriptOnce("/assistant-typing-patch.js?v=20261007-1");
    loadScriptOnce("/admin-scroll-fix.js?v=20261007-1");
    loadScriptOnce("/classmates-performance-patch.js?v=20261007-1");
    loadScriptOnce("/no-course-notice-patch.js?v=20261007-1");
    loadScriptOnce("/math-readable-patch.js?v=20261007-1");
  }

  function installCompactStyle() {
    let style = document.querySelector("#studybridge-chat-bubble-compact-live");
    if (!style) {
      style = document.createElement("style");
      style.id = "studybridge-chat-bubble-compact-live";
      document.head.appendChild(style);
    }
    if (style.dataset.ready === "true") return;
    style.textContent = `
      #classmatesPage .direct-message-list {
        align-content: end !important;
        gap: 10px !important;
      }

      #classmatesPage .direct-message {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) auto !important;
        align-items: end !important;
        gap: 16px !important;
        box-sizing: border-box !important;
        width: fit-content !important;
        min-width: min(360px, 72vw) !important;
        max-width: min(720px, 86%) !important;
        min-height: 0 !important;
        height: auto !important;
        padding: 9px 14px !important;
        line-height: 1.42 !important;
        white-space: pre-wrap !important;
      }

      #classmatesPage .direct-message > span {
        display: block !important;
        min-width: 0 !important;
      }

      #classmatesPage .direct-message.mine {
        justify-self: end !important;
      }

      #classmatesPage .direct-message time {
        display: block !important;
        align-self: end !important;
        margin: 0 !important;
        white-space: nowrap !important;
        text-align: right !important;
      }
    `;
    style.dataset.ready = "true";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function compactMessages() {
    document.querySelectorAll("#classmatesPage .direct-message").forEach((message) => {
      if (message.dataset.compactLiveReady !== "true") {
        const time = message.querySelector("time");
        const timeHtml = time ? time.outerHTML : "";
        if (time) time.remove();
        const text = message.textContent.trim();
        message.innerHTML = `<span>${escapeHtml(text)}</span>${timeHtml}`;
        message.dataset.normalizedBubble = "true";
        message.dataset.compactLiveReady = "true";
      }
      Object.assign(message.style, {
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        alignItems: "end",
        gap: "16px",
        minHeight: "0px",
        height: "auto",
        padding: "9px 14px",
        lineHeight: "1.42"
      });
      const time = message.querySelector("time");
      if (time) {
        Object.assign(time.style, {
          margin: "0",
          alignSelf: "end",
          whiteSpace: "nowrap",
          textAlign: "right"
        });
      }
    });
  }

  function boot() {
    loadLatestPatches();
    installCompactStyle();
    compactMessages();
  }

  function scheduleBoot() {
    if (bootFrame) return;
    bootFrame = requestAnimationFrame(() => {
      bootFrame = 0;
      boot();
    });
  }

  boot();
  new MutationObserver(scheduleBoot).observe(document.body, { childList: true, subtree: true });
  setInterval(scheduleBoot, 5000);
})();
