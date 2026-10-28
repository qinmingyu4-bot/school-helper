(function (scope) {
  "use strict";
  const management = scope.StudyBridgeScheduleManagement;
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  function create() {
    let active = null;
    function closeIfStale() { if (active && !active.isCurrent()) active.dialog.close(); }
    function open({ items, item, group, operation, api, onBatch, onDone, isCurrent }) {
      if (active) return;
      const courseItems = group?.items || management.groups(items).find((entry) => entry.items.some((row) => row.docId === item?.docId && row.courseId === item?.courseId))?.items || [];
      const name = group?.name || item?.title || "安排";
      const dialog = document.createElement("dialog");
      dialog.className = "schedule-manage-dialog";
      dialog.setAttribute("aria-labelledby", "scheduleManageTitle");
      dialog.setAttribute("aria-describedby", "scheduleManageHint");
      const editing = operation === "edit";
      const selectionNow = Date.now();
      const field = (key, label, type = "text", value = "", single = false, max = "") => `<div class="schedule-manage-field" ${single ? 'data-single-field hidden' : ""}><label><input type="checkbox" data-edit-check="${key}">${label}</label>${type === "textarea" ? `<textarea aria-label="${label}" data-edit-value="${key}" maxlength="10000">${escape(value)}</textarea>` : `<input aria-label="${label}" type="${type}" data-edit-value="${key}" value="${escape(value)}" ${max ? `maxlength="${max}"` : ""} ${type === "date" ? 'min="2000-01-01" max="2200-12-31"' : ""}>`}</div>`;
      let start = null, end = null;
      try {
        if (item) start = management.localParts(item.startsAt, item.timeZone || "UTC");
        if (item?.endsAt) end = management.localParts(item.endsAt, item.timeZone || "UTC");
      } catch { /* A malformed historical item can still be deleted. */ }
      dialog.innerHTML = `<h2 id="scheduleManageTitle">${editing ? "编辑日程安排" : "删除日程安排"}</h2><p class="schedule-manage-name">${escape(name)}</p>
        <p id="scheduleManageHint">按课程一次处理多天的安排。课程资料和聊天记录会保留。</p>
        <form><fieldset class="schedule-manage-controls"><div class="schedule-manage-grid">
          <label>处理范围<select name="scope">${item ? '<option value="single">仅此安排</option>' : ""}${courseItems.length ? '<option value="future">此课程尚未开始的安排</option><option value="all">此课程全部安排（含历史）</option>' : ""}</select></label>
          <label data-kind-field>安排类型<select name="kind"><option value="all">所有类型（含作业、考试）</option><option value="LEC">仅 Lecture</option><option value="TUT">仅 Tutorial</option><option value="DDL">仅作业 / 截止 / 考试</option><option value="EVENT">仅个人安排</option></select></label>
        </div>${editing ? `<p>勾选要修改的字段。每条安排保留原日期，时间按该安排的时区修改；旧安排未存时区时使用 UTC。</p><div class="schedule-manage-grid">${field("title", "标题", "text", item?.title || "", true, "160")}${field("date", "日期", "date", start?.date || "", true)}${field("startTime", "开始 / 截止时间", "time", start?.time || "")}${field("endTime", "结束时间（留空可清除）", "time", end?.time || "")}${field("location", "地点 / 链接（留空可清除）", "text", item?.location || "", false, "2000")}${field("notes", "备注（留空可清除）", "textarea", item?.notes || "")}</div>` : ""}</fieldset>
          <section class="schedule-manage-preview" aria-label="受影响的安排"><p data-manage-count aria-live="polite"></p><ul data-manage-preview></ul></section>
          ${editing ? "" : '<p class="schedule-manage-warning">删除后无法恢复，确认前请核对范围和条数。</p>'}
          <p data-manage-status role="status" aria-live="polite"></p><div class="schedule-manage-actions"><button type="button" data-manage-close>取消</button><button type="submit" class="${editing ? "primary" : "schedule-manage-delete"}" data-manage-submit></button></div>
        </form>`;
      const form = dialog.querySelector("form"), controls = dialog.querySelector("fieldset");
      const submit = dialog.querySelector("[data-manage-submit]"), close = dialog.querySelector("[data-manage-close]");
      const status = dialog.querySelector("[data-manage-status]");
      let busy = false, remaining = null, patch = null, processed = 0;
      const targets = () => form.elements.scope.value === "single" ? [item] : management.select(courseItems, { scope: form.elements.scope.value, kind: form.elements.kind.value, now: selectionNow });
      function preview() {
        const single = form.elements.scope.value === "single";
        dialog.querySelector("[data-kind-field]").hidden = single;
        dialog.querySelectorAll("[data-single-field]").forEach((element) => { element.hidden = !single; });
        const selected = targets();
        dialog.querySelector("[data-manage-count]").textContent = `将${editing ? "修改" : "删除"} ${selected.length} 条安排${single ? "" : "（不受月历月份和列表筛选限制）"}`;
        dialog.querySelector("[data-manage-preview]").innerHTML = selected.slice(0, 5).map((entry) => {
          let date = "时间待核对";
          try { const parts = management.localParts(entry.startsAt, entry.timeZone || "UTC"); date = `${parts.date} ${parts.time}`; } catch {}
          return `<li>${escape(date)} · ${escape(entry.title)}</li>`;
        }).join("") + (selected.length > 5 ? `<li>另有 ${selected.length - 5} 条安排</li>` : "");
        submit.textContent = `${editing ? "保存修改" : "删除"}（${selected.length} 条）`;
        submit.disabled = !selected.length;
      }
      form.addEventListener("change", preview);
      form.addEventListener("input", (event) => {
        const key = event.target.dataset.editValue;
        if (key) dialog.querySelector(`[data-edit-check="${key}"]`).checked = true;
      });
      close.addEventListener("click", () => dialog.close());
      dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
      dialog.addEventListener("close", () => { dialog.remove(); active = null; }, { once: true });
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (busy || !isCurrent()) { closeIfStale(); return; }
        try {
          if (!remaining) {
            const selected = targets();
            if (!selected.length) return;
            if (editing) {
              patch = {};
              dialog.querySelectorAll("[data-edit-check]:checked").forEach((check) => {
                if (check.closest("[data-single-field]")?.hidden) return;
                patch[check.dataset.editCheck] = dialog.querySelector(`[data-edit-value="${check.dataset.editCheck}"]`).value;
              });
              selected.forEach((entry) => management.applyPatch(entry, patch));
            }
            remaining = selected.map(({ docId, courseId }) => ({ docId, courseId }));
          }
          busy = true; controls.disabled = true; close.disabled = true; submit.disabled = true;
          while (remaining.length) {
            if (!isCurrent()) { closeIfStale(); return; }
            const batch = remaining.slice(0, 80);
            status.textContent = `正在${editing ? "保存" : "删除"}… 已处理 ${processed} 条，还有 ${remaining.length} 条。`;
            const result = await api("/api/schedule/manage", { method: "POST", body: { operation, items: batch, ...(editing ? { patch } : {}) } });
            if (!isCurrent()) { closeIfStale(); return; }
            remaining.splice(0, batch.length); processed += batch.length;
            onBatch({ operation, batch, items: result.items || [] });
          }
          dialog.close();
          onDone(`已${editing ? "修改" : "删除"} ${processed} 条日程安排。`);
        } catch (error) {
          if (!isCurrent()) { closeIfStale(); return; }
          status.textContent = `${processed ? `已处理 ${processed} 条。` : ""}${error.message}${remaining?.length ? ` 还有 ${remaining.length} 条待处理，可重试。` : ""}`;
          if (remaining) { submit.textContent = `重试剩余 ${remaining.length} 条`; close.textContent = "关闭"; }
        } finally {
          busy = false; close.disabled = false; submit.disabled = false;
          controls.disabled = Boolean(remaining);
        }
      });
      active = { dialog, isCurrent };
      document.body.append(dialog); preview(); dialog.showModal();
      form.elements.scope.focus();
    }
    return { open, closeIfStale };
  }
  scope.StudyBridgeScheduleManagementUi = { create };
})(window);
