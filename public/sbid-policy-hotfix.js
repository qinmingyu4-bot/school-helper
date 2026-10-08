(() => {
  const VERSION = "20261008-sbid-policy-1.0.89";
  if (window.__studybridgeSbIdPolicyVersion === VERSION) return;
  window.__studybridgeSbIdPolicyVersion = VERSION;

  const state = {
    me: null,
    ensuredForEmail: new Set()
  };

  function normalizeSbId(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^@+/, "")
      .replace(/[^a-z0-9._-]+/g, "")
      .slice(0, 24);
  }

  function isValidSbId(value) {
    return /^[a-z0-9][a-z0-9._-]{2,23}$/.test(normalizeSbId(value));
  }

  function baseFromUser(name, email) {
    let base = String(email || "").split("@")[0] || String(name || "student");
    base = base
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 14);
    if (!base) base = "student";
    if (!/^[a-z]/.test(base)) base = `sb${base}`;
    if (base.length < 3) base = `${base}user`.slice(0, 8);
    return base.slice(0, 16);
  }

  function randomHex(length) {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, length);
  }

  function generateInitialSbId(user = {}) {
    return normalizeSbId(`${baseFromUser(user.name, user.email)}${randomHex(4)}`);
  }

  async function ensureSbIdForUser(user) {
    if (!user || !user.email) return user;
    const current = normalizeSbId(user.profile?.sbId || "");
    if (isValidSbId(current)) return user;
    if (state.ensuredForEmail.has(user.email)) return user;
    state.ensuredForEmail.add(user.email);
    const profile = {
      ...(user.profile || {}),
      sbId: generateInitialSbId(user)
    };
    try {
      const response = await window.__studybridgeOriginalFetch("/api/me/profile", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: user.name || "Student", ...profile })
      });
      const result = await response.clone().json().catch(() => null);
      if (response.ok && result?.user) {
        state.me = result.user;
        window.dispatchEvent(new CustomEvent("studybridge:profile-updated", { detail: { user: result.user } }));
        return result.user;
      }
    } catch (error) {
      console.warn("StudyBridge could not auto-create SB ID yet.", error);
    }
    return user;
  }

  function currentProfileSbId() {
    return normalizeSbId(state.me?.profile?.sbId || "");
  }

  function sbIdCustomUsed() {
    return state.me?.profile?.sbIdCustomUsed === true || localStorage.getItem(`studybridge:sbid-custom-used:${state.me?.email || ""}`) === "true";
  }

  function findSbIdInput() {
    const named = document.querySelector('input[name="sbId"], input#sbId, input[data-profile-field="sbId"]');
    if (named) return named;
    return [...document.querySelectorAll("input")].find((input) => /sb\s*id/i.test(input.placeholder || input.previousElementSibling?.textContent || "")) || null;
  }

  function upsertHint(input, message, locked = false) {
    if (!input) return;
    let hint = input.parentElement?.querySelector(".sbid-policy-hint");
    if (!hint) {
      hint = document.createElement("div");
      hint.className = "sbid-policy-hint";
      input.insertAdjacentElement("afterend", hint);
    }
    hint.textContent = message;
    hint.style.cssText = `margin-top:6px;font-size:12px;line-height:1.45;color:${locked ? "#9f1239" : "#64748b"};font-weight:700;`;
  }

  function syncProfileUi() {
    const input = findSbIdInput();
    if (!input) return;
    const current = currentProfileSbId();
    if (current && normalizeSbId(input.value) !== current && !document.activeElement?.isSameNode(input)) {
      input.value = current;
    }
    if (sbIdCustomUsed()) {
      input.readOnly = true;
      input.dataset.sbidLocked = "true";
      upsertHint(input, "SB ID 已经自定义过一次，之后不能再修改。", true);
    } else {
      input.readOnly = false;
      input.dataset.sbidLocked = "false";
      upsertHint(input, "注册时会自动生成初始 SB ID；注册后你只有一次自定义机会。", false);
    }
  }

  if (!window.__studybridgeOriginalFetch) window.__studybridgeOriginalFetch = window.fetch.bind(window);
  const originalFetch = window.__studybridgeOriginalFetch;

  window.fetch = async function patchedStudyBridgeFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = String(init?.method || "GET").toUpperCase();
    const response = await originalFetch(input, init);

    if (url.includes("/api/me") && method === "GET" && response.ok) {
      response.clone().json().then(async (result) => {
        if (result?.user) {
          state.me = await ensureSbIdForUser(result.user);
          syncProfileUi();
        }
      }).catch(() => {});
    }

    if (url.includes("/api/auth/register") && method === "POST" && response.ok) {
      response.clone().json().then(async (result) => {
        if (result?.user) {
          state.me = await ensureSbIdForUser(result.user);
          syncProfileUi();
        }
      }).catch(() => {});
    }

    if (url.includes("/api/me/profile") && method === "PUT") {
      response.clone().json().then((result) => {
        if (result?.user) {
          const previous = currentProfileSbId();
          const next = normalizeSbId(result.user.profile?.sbId || "");
          state.me = result.user;
          if (previous && next && previous !== next) {
            localStorage.setItem(`studybridge:sbid-custom-used:${result.user.email || ""}`, "true");
          }
          syncProfileUi();
        }
      }).catch(() => {});
    }

    return response;
  };

  const style = document.createElement("style");
  style.textContent = `
    input[data-sbid-locked="true"] {
      background: #f8fafc;
      color: #64748b;
      cursor: not-allowed;
    }
  `;
  document.head.appendChild(style);

  setInterval(syncProfileUi, 1200);
  document.addEventListener("input", (event) => {
    const input = findSbIdInput();
    if (!input || event.target !== input) return;
    input.value = normalizeSbId(input.value);
  });
})();
