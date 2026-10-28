(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeAppearance = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const themes = Object.freeze([
    { id: "default", name: "现有蓝绿", accent: "#2c8067", tint: "#edf4f9", detail: "默认色调" },
    { id: "smoke-purple", name: "白 · 烟紫灰", accent: "#716b7b", tint: "#f4f2f6", detail: "柔和、安静" },
    { id: "graphite", name: "白 · 石墨灰", accent: "#53565a", tint: "#f2f2f2", detail: "中性、简约" },
    { id: "mist-blue", name: "白 · 雾蓝灰", accent: "#586b7b", tint: "#f1f4f6", detail: "清爽、克制" },
    { id: "dusty-rose", name: "白 · 灰玫瑰", accent: "#806b6f", tint: "#f6f2f3", detail: "细腻、温和" },
    { id: "celadon", name: "白 · 青瓷灰", accent: "#5a7473", tint: "#f0f5f4", detail: "清透、平静" },
    { id: "silver", name: "白 · 冷银灰", accent: "#69747c", tint: "#f2f4f5", detail: "利落、轻盈" },
    { id: "monochrome", name: "黑白灰简约", accent: "#202020", tint: "#ededed", detail: "与首页一致 · 清晰边框" }
  ].map(Object.freeze));
  const isValid = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).every((key) => key === "theme" || key === "mode")
    && themes.some((theme) => theme.id === value.theme)
    && (value.mode === undefined || value.mode === "light" || value.mode === "dark"));
  // Omit light mode for compatibility with existing records and clients.
  const normalize = (value) => ({ theme: themes.some((theme) => theme.id === value?.theme) ? value.theme : "default",
    ...(value?.mode === "dark" ? { mode: "dark" } : {}) });
  const sameAppearance = (a, b) => a.theme === b.theme && a.mode === b.mode;

  // Serialize writes while retaining the latest choice; a slow earlier save cannot win.
  function createSaver({ initial, save, onChange = () => {} }) {
    let draft = normalize(initial), saved = normalize(initial), pending = null, error = null, uncertain = false, disposed = false;
    const snapshot = () => ({ draft: { ...draft }, saved: { ...saved },
      status: error ? "error" : pending ? "saving" : sameAppearance(draft, saved) ? "saved" : "unsaved" });
    const notify = () => { if (!disposed) onChange(snapshot()); };
    function flush() {
      if (disposed) return Promise.resolve();
      if (pending) return pending;
      if (sameAppearance(draft, saved) && !uncertain) { error = null; notify(); return Promise.resolve(); }
      error = null;
      pending = Promise.resolve().then(async () => {
        while (!disposed && (uncertain || !sameAppearance(draft, saved))) {
          const next = { ...draft };
          await save(next);
          if (disposed) return;
          saved = next;
          uncertain = false;
        }
      }).catch((failure) => { if (!disposed) { error = failure; uncertain = true; } throw failure; })
        .finally(() => { pending = null; notify(); });
      notify();
      return pending;
    }
    return { snapshot, flush,
      setDraft(value) { if (!disposed) { draft = normalize(value); error = null; notify(); } },
      dispose() { disposed = true; }
    };
  }

  function createController({ load, save, createSettingsView, document: doc = document, storage }) {
    if (storage === undefined) { try { storage = globalThis.localStorage; } catch { /* Storage is optional. */ } }
    let userId = "", saver = null, dialog = null, loading = false, loadError = false, edited = false, generation = 0;
    const cacheKey = (id) => `studybridge.appearance.${id}`;
    function cache(value) { try { storage?.setItem(cacheKey(userId), JSON.stringify(normalize(value))); } catch { /* Storage is optional. */ } }
    function apply(value) {
      const { theme, mode } = normalize(value);
      if (theme === "default") doc.documentElement.removeAttribute("data-sb-theme");
      else doc.documentElement.setAttribute("data-sb-theme", theme);
      if (mode === "dark") doc.documentElement.setAttribute("data-sb-mode", "dark");
      else doc.documentElement.removeAttribute("data-sb-mode");
    }
    function update() {
      if (!dialog || !saver) return;
      const current = saver.snapshot();
      dialog.querySelectorAll('input[name="sb-theme"]').forEach((input) => { input.checked = input.value === current.draft.theme; });
      dialog.querySelector('input[name="sb-dark-mode"]').checked = current.draft.mode === "dark";
      dialog.querySelector(".settings-themes").disabled = current.draft.mode === "dark";
      const failed = current.status === "error" || loadError;
      const status = dialog.querySelector(".settings-save-status");
      status.textContent = current.status === "error" ? "保存失败，当前仅预览此外观。请重试。"
        : loading ? "正在读取你的设置…" : loadError ? "暂时无法读取已保存的外观，请重试。"
        : current.status === "saving" ? "正在保存…" : current.status === "unsaved" ? "尚未保存"
        : "已保存到你的账号，下次登录会继续使用。";
      status.classList.toggle("is-error", failed);
      dialog.querySelector(".settings-retry").hidden = !failed;
    }
    function makeSaver(value, id) {
      return createSaver({ initial: value, save: async (next) => {
        await save(id, next);
        if (id === userId) cache(next);
      }, onChange: update });
    }
    async function read() {
      const id = userId, token = ++generation;
      loading = true; loadError = false; update();
      try {
        const value = normalize(await load(id));
        if (id !== userId || token !== generation || edited) return;
        saver?.dispose(); saver = makeSaver(value, id); apply(value); cache(value);
      } catch {
        if (id === userId && token === generation && !edited) loadError = true;
      } finally {
        if (id === userId && token === generation) { loading = false; update(); }
      }
    }
    function sync(user) {
      const id = String(user?.id || "");
      if (id === userId) return;
      reset();
      if (!id) return;
      userId = id;
      let initial;
      try { initial = JSON.parse(storage?.getItem(cacheKey(id)) || "null"); } catch { /* Fall back to the default. */ }
      saver = makeSaver(initial, id); apply(initial);
      void read();
    }
    function reset() {
      ++generation; userId = ""; edited = false; loading = false; loadError = false;
      saver?.dispose(); saver = null;
      if (dialog) { dialog.disposeSettings?.(); dialog.close(); dialog.remove(); dialog = null; }
      apply({ theme: "default" });
    }
    function open() {
      if (!userId || !saver) return;
      if (!dialog) {
        dialog = createSettingsView({ themes, getAppearance: () => saver.snapshot().draft, flushAppearance: () => saver.flush() });
        dialog.querySelector(".settings-close").addEventListener("click", () => dialog.close());
        dialog.querySelector(".settings-retry").addEventListener("click", () => {
          if (loadError && !edited) void read(); else void saver.flush().catch(() => {});
        });
        dialog.addEventListener("change", (event) => {
          if (!event.target.matches('input[name="sb-theme"], input[name="sb-dark-mode"]')) return;
          edited = true; loadError = false; loading = false; ++generation;
          const next = { ...saver.snapshot().draft };
          if (event.target.name === "sb-dark-mode") next.mode = event.target.checked ? "dark" : "light";
          else next.theme = event.target.value;
          saver.setDraft(next); apply(next);
          void saver.flush().catch(() => {});
        });
        doc.body.append(dialog);
      }
      dialog.refreshSettings?.();
      update();
      if (!dialog.open) dialog.showModal();
    }
    return { sync, open, reset, refreshLearning: () => dialog?.refreshLearning?.() };
  }
  return { themes, isValid, normalize, createSaver, createController };
});
