(() => {
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(path, {
      method: options.method || "GET",
      headers: options.body ? { "content-type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "刷新失败，请稍后再试。");
    return payload;
  }

  function inviteRole(invite) {
    const label = String(invite?.label || "");
    return /^\s*\[co-admin\]/i.test(label) ? "co-admin" : "user";
  }

  function cleanInviteLabel(invite) {
    return String(invite?.label || "Friend invite").replace(/^\s*\[co-admin\]\s*/i, "") || "Friend invite";
  }

  function renderInvites(invites = []) {
    const inviteList = document.querySelector("#inviteList");
    const adminMessage = document.querySelector("#adminMessage");
    if (!inviteList) return;
    if (!invites.length) {
      inviteList.innerHTML = '<p class="empty">还没有生成过邀请码。</p>';
      return;
    }

    inviteList.innerHTML = invites
      .map((invite) => {
        const role = inviteRole(invite);
        return `
          <article class="invite-item ${invite.active ? "" : "disabled"}">
            <div>
              <strong>${escapeHtml(invite.code)}</strong>
              <span class="invite-role-badge ${role === "co-admin" ? "co-admin" : ""}">${role === "co-admin" ? "co-admin" : "user"}</span>
              <span>${escapeHtml(cleanInviteLabel(invite))} | ${Number(invite.uses || 0)}/${Number(invite.maxUses || 1)} used</span>
            </div>
            <div class="button-row">
              <button class="small-button" type="button" data-refresh-copy-invite="${escapeHtml(invite.code)}">复制</button>
              <button class="small-button" type="button" data-refresh-toggle-invite="${escapeHtml(invite.id)}" data-active="${invite.active ? "true" : "false"}">
                ${invite.active ? "停用" : "启用"}
              </button>
            </div>
          </article>
        `;
      })
      .join("");

    inviteList.querySelectorAll("[data-refresh-copy-invite]").forEach((button) => {
      button.addEventListener("click", async () => {
        const code = button.dataset.refreshCopyInvite || "";
        try {
          await navigator.clipboard?.writeText(code);
          if (adminMessage) adminMessage.textContent = `已复制：${code}`;
        } catch {
          if (adminMessage) adminMessage.textContent = `复制失败，请手动复制：${code}`;
        }
      });
    });

    inviteList.querySelectorAll("[data-refresh-toggle-invite]").forEach((button) => {
      button.addEventListener("click", async () => {
        const active = button.dataset.active !== "true";
        button.disabled = true;
        try {
          await requestJson(`/api/admin/invites/${button.dataset.refreshToggleInvite}`, {
            method: "PATCH",
            body: { active }
          });
          await refreshAdminOverview(`邀请码已${active ? "启用" : "停用"}。`);
        } catch (error) {
          if (adminMessage) adminMessage.textContent = error.message;
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  function renderUsers(users = []) {
    const userList = document.querySelector("#userList");
    if (!userList) return;
    if (!users.length) {
      userList.innerHTML = '<p class="empty">还没有学生注册。</p>';
      return;
    }

    userList.innerHTML = users
      .map(
        (user) => `
          <article class="user-item">
            <div>
              <strong>${escapeHtml(user.name || "Student")}</strong>
              <span>${escapeHtml(user.email || "")} | ${escapeHtml(user.role || "student")}</span>
            </div>
            <div class="stats">
              <span>${Number(user.stats?.courses || 0)} courses</span>
              <span>${Number(user.stats?.documents || 0)} docs</span>
              <span>${Number(user.stats?.messages || 0)} chats</span>
            </div>
          </article>
        `
      )
      .join("");
  }

  function renderResetRequests(requests = []) {
    const resetList = document.querySelector("#passwordResetList");
    if (!resetList) return;
    if (!requests.length) {
      resetList.innerHTML = '<p class="empty">还没有密码重置申请。</p>';
      return;
    }
    resetList.innerHTML = requests
      .map(
        (request) => `
          <article class="user-item">
            <div>
              <strong>${escapeHtml(request.name || "Student")}</strong>
              <span>${escapeHtml(request.email || "")} | ${escapeHtml(request.status || "pending")}</span>
            </div>
          </article>
        `
      )
      .join("");
  }

  async function refreshAdminOverview(successMessage = "开发者端数据已刷新。") {
    const button = document.querySelector("#refreshAdminButton");
    const message = document.querySelector("#adminMessage");
    if (button) {
      button.disabled = true;
      button.dataset.originalText ||= button.textContent || "刷新";
      button.textContent = "刷新中...";
    }
    if (message) message.textContent = "正在刷新开发者端数据...";

    try {
      const result = await requestJson(`/api/admin/overview?t=${Date.now()}`);
      renderInvites(result.invites || []);
      renderUsers(result.users || []);
      renderResetRequests(result.resetRequests || []);
      if (message) {
        const time = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        message.textContent = `${successMessage} ${time}`;
      }
    } catch (error) {
      if (message) message.textContent = error.message;
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = button.dataset.originalText || "刷新";
      }
    }
  }

  function installRefreshButton() {
    const button = document.querySelector("#refreshAdminButton");
    if (!button || button.dataset.realRefreshReady === "true") return;
    button.dataset.realRefreshReady = "true";
    button.title = "重新读取邀请码、学生数据和密码重置申请";
    button.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        refreshAdminOverview();
      },
      true
    );
  }

  installRefreshButton();
  setInterval(installRefreshButton, 750);
  window.studybridgeRefreshAdmin = refreshAdminOverview;
})();