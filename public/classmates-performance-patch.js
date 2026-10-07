(() => {
  const STYLE_ID = "studybridge-classmates-performance-patch";
  const CACHE_TTLS = [
    { pattern: /\/api\/classmates\/[^/]+\/messages(?:$|\?)/, ttl: 1200 },
    { pattern: /\/api\/classmates(?:$|\?)/, ttl: 4500 }
  ];
  const responseCache = new Map();

  function installStyle() {
    let style = document.querySelector(`#${STYLE_ID}`);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    if (style.dataset.ready === "true") return;

    style.textContent = `
      #classmatesPage.classmates-page {
        height: 100vh !important;
        min-height: 0 !important;
        overflow: hidden !important;
      }

      #classmatesPage .classmates-body {
        min-height: 0 !important;
        height: 100% !important;
        padding: 22px 28px 34px !important;
        overflow: hidden !important;
      }

      #classmatesPage .classmates-side {
        min-height: 0 !important;
        overflow-y: auto !important;
        overscroll-behavior: contain !important;
        scrollbar-gutter: stable !important;
      }

      #classmatesPage .classmates-chat-shell {
        display: grid !important;
        grid-template-rows: auto auto minmax(0, 1fr) auto !important;
        height: 100% !important;
        min-height: 0 !important;
        overflow: hidden !important;
      }

      #classmatesPage .direct-message-list {
        display: flex !important;
        flex-direction: column !important;
        align-content: stretch !important;
        justify-content: flex-start !important;
        gap: 10px !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        padding: 18px 18px 38px !important;
        overscroll-behavior: contain !important;
        scrollbar-gutter: stable !important;
      }

      #classmatesPage .direct-message {
        flex: 0 0 auto !important;
      }

      #classmatesPage .direct-message.mine {
        align-self: flex-end !important;
      }

      #classmatesPage .classmate-chat-form {
        flex: 0 0 auto !important;
      }

      body.studybridge-page-switching .workspace,
      body.studybridge-page-switching .sidebar {
        scroll-behavior: auto !important;
      }
    `;
    style.dataset.ready = "true";
  }

  function installFetchThrottle() {
    if (window.__studybridgeClassmatesFetchThrottle) return;
    window.__studybridgeClassmatesFetchThrottle = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = typeof input === "string" ? input : input?.url || "";
      const method = String(init?.method || "GET").toUpperCase();
      const rule = method === "GET" ? CACHE_TTLS.find((item) => item.pattern.test(url)) : null;
      if (!rule) return originalFetch(input, init);

      const cached = responseCache.get(url);
      if (cached && Date.now() - cached.time < rule.ttl) {
        return new Response(cached.text, {
          status: cached.status,
          statusText: cached.statusText,
          headers: cached.headers
        });
      }

      const response = await originalFetch(input, init);
      const text = await response.clone().text();
      responseCache.set(url, {
        time: Date.now(),
        text,
        status: response.status,
        statusText: response.statusText,
        headers: Array.from(response.headers.entries())
      });
      return response;
    };
  }

  function installSwitchFeedback() {
    if (window.__studybridgeSwitchFeedback) return;
    window.__studybridgeSwitchFeedback = true;
    document.addEventListener(
      "click",
      (event) => {
        if (!event.target.closest?.(".community-entry, .classmates-entry, .email-helper-entry, .schedule-entry, .study-entry")) return;
        document.body.classList.add("studybridge-page-switching");
        window.setTimeout(() => document.body.classList.remove("studybridge-page-switching"), 180);
      },
      true
    );
  }

  function keepChatScrollable() {
    const page = document.querySelector("#classmatesPage:not([hidden])");
    const list = page?.querySelector("#directMessageList");
    if (!list) return;
    list.style.overflowY = "auto";
    list.style.minHeight = "0";
  }

  function boot() {
    installStyle();
    installFetchThrottle();
    installSwitchFeedback();
    keepChatScrollable();
  }

  boot();
  setInterval(boot, 2500);
})();
