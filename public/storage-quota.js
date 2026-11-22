(function (root) {
  "use strict";
  const ui = root.StudyBridgeI18n;
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const t = key => escapeHtml(ui.text(key));
  const byteFormat = bytes => {
    const gib = 1024 ** 3, mib = 1024 ** 2;
    return bytes >= gib ? (bytes / gib).toFixed(2).replace(/\.?0+$/, "") + " GiB"
      : (bytes / mib).toFixed(1).replace(/\.0$/, "") + " MiB";
  };
  const status = quota => quota.status === "full" ? "空间已满" : quota.status === "warning" ? "接近空间上限" : "空间可用";
  const usageLine = quota => escapeHtml(byteFormat(quota.usedBytes) + " / " + byteFormat(quota.limitBytes));

  function create({ api, getUser, openBilling }) {
    let owner = "", data = null, blocked = false, request = null, dialog = null;
    let loadedAt = 0, revision = 0;
    function syncOwner() {
      const id = getUser()?.id || "";
      if (id === owner) return;
      owner = id;
      revision++;
      data = null;
      blocked = false;
      request = null;
      loadedAt = 0;
      if (dialog?.open) dialog.close();
    }
    function paint() {
      document.querySelectorAll("[data-storage-summary]").forEach(node => {
        node.textContent = data ? byteFormat(data.usedBytes) + " / " + byteFormat(data.limitBytes) : ui.text("查看");
        const button = node.closest("button");
        const warning = data && data.status !== "available" ? ui.text(status(data)) : "";
        button.classList.toggle("storage-warning", Boolean(warning));
        const label = button.querySelector("[data-storage-alert]");
        label.hidden = !warning;
        if (label.textContent !== warning) label.textContent = warning;
      });
      if (!dialog?.open) return;
      const body = dialog.querySelector(".dialog-body");
      body.innerHTML = data ? [
        '<p class="storage-usage-line"><strong>' + usageLine(data) + '</strong><span>' + t(status(data)) + '</span></p>',
        '<progress value="' + Math.min(data.usedBytes, data.limitBytes) + '" max="' + data.limitBytes + '" aria-label="' + t("已用上传空间") + '"></progress>',
        '<p class="muted">' + t("课程资料与学习聊天附件按实际保留的数据计入空间。删除资料或对话可释放额度。") + '</p>',
        blocked ? '<p class="storage-warning" role="status">' + t("本次上传超出剩余空间，已有资料已保留。") + '</p>' : "",
        data.extraBytes ? '<p class="muted">' + t("额外空间") + ' · ' + escapeHtml(byteFormat(data.extraBytes)) + '</p>' : "",
        data.requestedAt ? '<p role="status">' + t("开发者已收到加购申请。提交申请不会扣款。") + '</p>' : ""
      ].join("") : '<p class="muted" role="status">' + t("正在读取上传空间…") + '</p>';
      dialog.querySelector("[data-storage-plus]").hidden = !data || data.tier === "plus";
      const button = dialog.querySelector("[data-storage-request]");
      button.disabled = !data || Boolean(data.requestedAt || dialog.dataset.pending);
    }

    function update(quota) {
      revision++;
      data = quota;
      loadedAt = Date.now();
      paint();
    }

    async function refresh(force = false) {
      syncOwner();
      if (!owner || !force && data && Date.now() - loadedAt < 30000) return;
      if (request) return request;
      const id = owner, startedAt = revision;
      const pending = api("/api/me/storage").then(result => {
        if (getUser()?.id === id && owner === id && revision === startedAt) update(result.storage);
      }).catch(error => {
        if (getUser()?.id === id && dialog?.open && !data) dialog.querySelector(".dialog-body").textContent = error.message;
      }).finally(() => {
        if (request === pending) request = null;
      });
      request = pending;
      return pending;
    }

    function open() {
      syncOwner();
      if (!owner) return;
      if (dialog?.open) { paint(); return; }
      dialog = document.createElement("dialog");
      dialog.className = "storage-quota-dialog";
      dialog.setAttribute("aria-labelledby", "uploadStorageTitle");
      dialog.innerHTML = '<header class="dialog-heading"><h2 id="uploadStorageTitle">' + t("上传空间") + '</h2><button type="button" data-storage-close aria-label="' + t("关闭") + '">×</button></header>'
        + '<div class="dialog-body"></div><div class="dialog-footer"><button type="button" data-storage-plus hidden>' + t("查看 Plus") + '</button>'
        + '<button type="button" data-storage-request disabled>' + t("申请加购 1 GiB") + '</button></div>';
      const panel = dialog;
      panel.querySelector("[data-storage-close]").onclick = () => panel.close();
      panel.querySelector("[data-storage-plus]").onclick = () => { panel.close(); openBilling(); };
      panel.querySelector("[data-storage-request]").onclick = async () => {
        const id = owner;
        panel.dataset.pending = "true";
        paint();
        try {
          const result = await api("/api/me/storage/request", { method: "POST", body: { actorId: id } });
          if (getUser()?.id === id && owner === id) update(result.storage);
        } catch (error) {
          if (getUser()?.id === id && panel.open) {
            const alert = document.createElement("p");
            alert.setAttribute("role", "alert");
            alert.textContent = error.message;
            panel.querySelector(".dialog-body").append(alert);
          }
        } finally {
          delete panel.dataset.pending;
          if (panel.open) panel.querySelector("[data-storage-request]").disabled = !data || Boolean(data.requestedAt);
        }
      };
      panel.addEventListener("close", () => {
        panel.remove();
        if (dialog === panel) { dialog = null; blocked = false; }
      }, { once: true });
      document.body.append(panel);
      panel.showModal();
      paint();
      void refresh(true);
    }

    function reject(quota) {
      syncOwner();
      update(quota);
      blocked = true;
      open();
    }
    function sync() {
      syncOwner();
      if (!owner || !document.querySelector("[data-storage-summary]")) return;
      paint();
      void refresh();
    }

    return {
      open, sync, refresh, reject,
      button: () => '<button type="button" class="storage-summary-button" data-action="open-storage">'
        + t("上传空间") + ' <span data-storage-summary>' + t("查看") + '</span><small data-storage-alert aria-live="polite" hidden></small></button>'
    };
  }

  function adminHtml(report) {
    const list = report?.accounts || [];
    const quotaMetric = (label, value) => '<div><dt>' + t(label) + '</dt><dd>' + escapeHtml(value) + '</dd></div>';
    const contents = report ? '<dl class="admin-user-stats storage-admin-metrics">'
      + quotaMetric("已用上传空间", byteFormat(report.totalBytes))
      + quotaMetric("接近空间上限", report.warning)
      + quotaMetric("空间已满", report.full)
      + quotaMetric("近 7 天上传受阻", report.blocked)
      + quotaMetric("待处理加购申请", report.requests) + '</dl>'
      + (list.length ? '<ul class="admin-usage-list">' + list.map(row =>
        '<li class="storage-admin-account"><span><b>' + escapeHtml(row.name || row.userId) + '</b><small> · ' + t(row.tier === "plus" ? "Plus 用户" : "普通用户") + ' · ' + usageLine(row)
        + ' · ' + t(status(row)) + '</small>' + (row.lastBlockedAt ? '<small> · ' + t("最近上传受阻") + ' ' + escapeHtml(new Date(row.lastBlockedAt).toLocaleString()) + '</small>' : '')
        + '</span>' + (row.requestId ? '<button type="button" data-action="grant-storage" data-user-id="' + escapeHtml(row.userId)
          + '" data-request-id="' + escapeHtml(row.requestId) + '">' + t("开通额外 1 GiB") + '</button>' : '') + '</li>').join("") + '</ul>'
      : '<p class="muted">' + t("目前没有上传空间预警或加购申请。") + '</p>')
      : '<p class="muted">' + t("上传空间数据暂不可用。") + '</p>';
    return '<section class="admin-usage storage-admin" aria-labelledby="adminStorageTitle"><div class="admin-usage-heading"><h2 id="adminStorageTitle">'
      + t("上传空间与预警") + '</h2><button type="button" data-action="refresh-admin-storage">' + t("刷新") + '</button></div>'
      + contents + '</section>';
  }

  root.StudyBridgeStorage = { create, adminHtml };
})(window);
