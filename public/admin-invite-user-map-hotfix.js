(() => {
  const VERSION = "20261008-admin-invite-user-map-1.0.87";
  if (window.__studybridgeAdminInviteUserMapVersion === VERSION) return;
  window.__studybridgeAdminInviteUserMapVersion = VERSION;

  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[char]));

  function injectStyle() {
    if (document.querySelector("#studybridge-admin-invite-user-map-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-admin-invite-user-map-style";
    style.textContent = `
      .sb-user-invite-line,
      .sb-invite-note-line {
        margin-top: 8px;
        padding: 8px 10px;
        border: 1px solid #d8e2ef;
        border-radius: 8px;
        background: #f8fbff;
        color: #284465;
        font-size: 12px;
        line-height: 1.45;
      }
      .sb-user-invite-line strong,
      .sb-invite-note-line strong {
        color: #061f44;
      }
      .sb-user-invite-line .muted,
      .sb-invite-note-line .muted {
        color: #6b7f9b;
      }
      .sb-user-invite-code {
        font-weight: 900;
        letter-spacing: .02em;
      }
    `;
    document.head.appendChild(style);
  }

  async function api(path) {
    const response = await fetch(path, { credentials: "include", cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "读取开发者数据失败");
    return payload;
  }

  function inviteForUser(user, invites) {
    const directCode = String(user.inviteCode || "").trim().toUpperCase();
    const byCode = directCode ? invites.find((invite) => String(invite.code || "").toUpperCase() === directCode) : null;
    if (byCode) return byCode;
    return invites.find((invite) => (invite.usedBy || []).some((entry) => String(entry.userId || entry.id || "") === String(user.id || ""))) || null;
  }

  function userInviteLine(user, invite) {
    if (!invite && !user.inviteCode) {
      return `<div class="sb-user-invite-line"><strong>邀请码：</strong><span class="muted">未记录，可能是创作者账号或旧账号。</span></div>`;
    }
    const code = invite?.code || user.inviteCode || "未记录";
    const note = invite?.label || "没有备注";
    const usage = `${invite?.uses ?? invite?.usedCount ?? "?"}/${invite?.maxUses ?? "?"} used`;
    return `<div class="sb-user-invite-line"><strong>邀请码：</strong><span class="sb-user-invite-code">${esc(code)}</span><br><strong>备注：</strong>${esc(note)} <span class="muted">· ${esc(usage)}</span></div>`;
  }

  function findUserLists() {
    const byId = ["#sbUserList", "#userList"].map((selector) => document.querySelector(selector)).filter(Boolean);
    const byHeading = [...document.querySelectorAll(".sb-card, .panel-card, .admin-card")]
      .filter((card) => /用户|学生数据|User|Student/i.test(card.querySelector("h3,h4")?.textContent || ""))
      .map((card) => card.querySelector(".sb-list, .user-list, [id$='UserList']"))
      .filter(Boolean);
    return [...new Set([...byId, ...byHeading])];
  }

  function findInviteLists() {
    const byId = ["#sbInviteList", "#inviteList"].map((selector) => document.querySelector(selector)).filter(Boolean);
    const byHeading = [...document.querySelectorAll(".sb-card, .panel-card, .admin-card")]
      .filter((card) => /邀请码|Invite/i.test(card.querySelector("h3,h4")?.textContent || ""))
      .map((card) => card.querySelector(".sb-list, .invite-list, [id$='InviteList']"))
      .filter(Boolean);
    return [...new Set([...byId, ...byHeading])];
  }

  function patchUserCards(users, invites) {
    for (const list of findUserLists()) {
      const cards = [...list.children].filter((node) => node.nodeType === 1);
      users.forEach((user, index) => {
        const card = cards[index];
        if (!card || card.dataset.sbInviteMapped === "true") return;
        const invite = inviteForUser(user, invites);
        card.insertAdjacentHTML("beforeend", userInviteLine(user, invite));
        card.dataset.sbInviteMapped = "true";
      });
    }
  }

  function patchInviteCards(invites) {
    for (const list of findInviteLists()) {
      const cards = [...list.children].filter((node) => node.nodeType === 1);
      invites.forEach((invite, index) => {
        const card = cards[index];
        if (!card || card.dataset.sbInviteNoteMapped === "true") return;
        const note = invite.label || "没有备注";
        card.insertAdjacentHTML("beforeend", `<div class="sb-invite-note-line"><strong>备注：</strong>${esc(note)}</div>`);
        card.dataset.sbInviteNoteMapped = "true";
      });
    }
  }

  async function enhanceDeveloperPage() {
    if (!document.querySelector("#sbInviteForm, #inviteForm, #sbDevRefresh, #refreshAdminButton")) return;
    injectStyle();
    try {
      const overview = await api("/api/admin/overview");
      const users = overview.users || [];
      const invites = overview.invites || [];
      patchInviteCards(invites);
      patchUserCards(users, invites);
    } catch (error) {
      const target = document.querySelector("#adminMessage, #sbAdminMsg");
      if (target) target.textContent = error.message;
    }
  }

  let timer = 0;
  function scheduleEnhance() {
    clearTimeout(timer);
    timer = setTimeout(enhanceDeveloperPage, 120);
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("#creatorViewButton, #sbDevRefresh, #refreshAdminButton, #sbInviteForm button, #inviteForm button")) {
      setTimeout(scheduleEnhance, 250);
      setTimeout(scheduleEnhance, 900);
    }
  }, true);

  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.body, { childList: true, subtree: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scheduleEnhance, { once: true });
  else scheduleEnhance();
})();
