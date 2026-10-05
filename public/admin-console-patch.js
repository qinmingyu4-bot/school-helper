(() => {
  function installStyle() {
    if (document.querySelector("#studybridge-admin-console-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-admin-console-style";
    style.textContent = `
      body.creator-admin-mode .sidebar .profile-entry,
      body.creator-admin-mode .sidebar > .panel {
        display: none !important;
      }

      body.creator-admin-mode .app-shell {
        grid-template-columns: 280px minmax(0, 1fr);
      }

      body.creator-admin-mode #workspacePage {
        grid-template-rows: auto minmax(0, 1fr) !important;
        grid-template-areas:
          "developer"
          "developer" !important;
      }

      body.creator-admin-mode #workspacePage > .topbar,
      body.creator-admin-mode #chatArea,
      body.creator-admin-mode #quickPrompts,
      body.creator-admin-mode #chatForm {
        display: none !important;
      }

      body.creator-admin-mode #developerPanel:not([hidden]) {
        grid-area: developer;
        display: grid;
        grid-template-rows: auto auto auto minmax(0, 1fr);
        gap: 14px;
        width: 100%;
        height: 100vh;
        max-height: none !important;
        overflow: auto;
        padding: 24px 28px;
        border: 0;
        border-radius: 0;
        box-shadow: none;
        background: rgba(248, 250, 252, 0.96);
      }

      body.creator-admin-mode #developerPanel .panel-title {
        margin-bottom: 0;
        padding-bottom: 14px;
        border-bottom: 1px solid var(--line);
      }

      body.creator-admin-mode #developerPanel .invite-form {
        display: grid;
        grid-template-columns: minmax(220px, 1fr) 150px 110px auto;
        gap: 10px;
        align-items: center;
      }

      .invite-role-select {
        min-height: 42px;
      }

      .invite-role-badge {
        display: inline-grid;
        place-items: center;
        min-height: 22px;
        margin-left: 6px;
        padding: 0 7px;
        border-radius: 999px;
        background: #eaf3ff;
        color: var(--navy);
        font-size: 11px;
        font-weight: 900;
      }

      .invite-role-badge.co-admin {
        background: #e9f7ef;
        color: var(--green);
      }

      body.creator-admin-mode #developerPanel .admin-grid {
        display: grid;
        grid-template-columns: minmax(260px, 0.95fr) minmax(360px, 1.25fr);
        gap: 18px;
        min-height: 0;
      }

      body.creator-admin-mode #developerPanel .invite-list,
      body.creator-admin-mode #developerPanel .user-list,
      body.creator-admin-mode #passwordResetList {
        max-height: none !important;
      }

      @media (max-width: 900px) {
        body.creator-admin-mode .app-shell {
          grid-template-columns: 1fr;
          height: auto;
          overflow: auto;
        }

        body.creator-admin-mode #developerPanel:not([hidden]) {
          height: auto;
          min-height: 80vh;
        }

        body.creator-admin-mode #developerPanel .invite-form,
        body.creator-admin-mode #developerPanel .admin-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function isCreatorMode() {
    const panel = document.querySelector("#developerPanel");
    return Boolean(panel && !panel.hidden);
  }

  function syncModeClass() {
    document.body.classList.toggle("creator-admin-mode", isCreatorMode());
  }

  function ensureInviteRoleSelect() {
    const form = document.querySelector("#inviteForm");
    const maxUses = document.querySelector("#inviteMaxUsesInput");
    if (!form || !maxUses || document.querySelector("#inviteRoleSelect")) return;
    const select = document.createElement("select");
    select.id = "inviteRoleSelect";
    select.className = "invite-role-select";
    select.setAttribute("aria-label", "邀请码权限");
    select.innerHTML = `
      <option value="user">普通用户</option>
      <option value="co-admin">Co-admin</option>
    `;
    maxUses.insertAdjacentElement("afterend", select);
  }

  function roleFromInviteLabel(label = "") {
    return /^\s*\[co-admin\]/i.test(String(label)) ? "co-admin" : "user";
  }

  function decorateInviteRoles() {
    document.querySelectorAll("#inviteList .invite-item").forEach((item) => {
      const strong = item.querySelector("strong");
      const span = item.querySelector("span");
      if (!strong || !span || item.querySelector(".invite-role-badge")) return;
      const role = roleFromInviteLabel(span.textContent || "");
      const badge = document.createElement("span");
      badge.className = `invite-role-badge ${role === "co-admin" ? "co-admin" : ""}`;
      badge.textContent = role === "co-admin" ? "co-admin" : "user";
      strong.insertAdjacentElement("afterend", badge);
    });
  }

  async function createInvite(event) {
    const form = event.target.closest?.("#inviteForm");
    if (!form) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const labelInput = document.querySelector("#inviteLabelInput");
    const maxUsesInput = document.querySelector("#inviteMaxUsesInput");
    const roleSelect = document.querySelector("#inviteRoleSelect");
    const message = document.querySelector("#adminMessage");
    const role = roleSelect?.value === "co-admin" ? "co-admin" : "user";
    const cleanLabel = (labelInput?.value || "").trim() || (role === "co-admin" ? "Co-admin invite" : "Friend invite");
    const label = role === "co-admin" ? `[co-admin] ${cleanLabel.replace(/^\[co-admin\]\s*/i, "")}` : cleanLabel;
    const submit = form.querySelector('button[type="submit"]');

    if (message) message.textContent = "";
    if (submit) submit.disabled = true;
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, maxUses: maxUsesInput?.value || 1, role })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "邀请码生成失败。");
      if (labelInput) labelInput.value = "";
      if (maxUsesInput) maxUsesInput.value = "1";
      if (roleSelect) roleSelect.value = "user";
      if (message) message.textContent = `已生成${role === "co-admin" ? " co-admin" : "普通用户"}邀请码：${payload.invite?.code || ""}`;
      document.querySelector("#refreshAdminButton")?.click();
      setTimeout(decorateInviteRoles, 400);
    } catch (error) {
      if (message) message.textContent = error.message;
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  function init() {
    installStyle();
    ensureInviteRoleSelect();
    syncModeClass();
    decorateInviteRoles();
  }

  document.addEventListener("submit", createInvite, true);
  document.addEventListener("click", () => setTimeout(init, 80), true);
  const observer = new MutationObserver(() => init());
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class"] });
  init();
  setInterval(init, 750);
})();
