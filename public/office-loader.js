(function () {
  "use strict";
  const ui = window.StudyBridgeI18n;

  let promise = null,
    module = null,
    generation = 0;
  const supports = (kind) => ["docs", "slides", "sheets"].includes(kind);
  const html = (kind) =>
    ui.html`<section class="office-shell" id="officeHost" data-kind="${kind}"><p class="office-loading" role="status">正在加载编辑器…</p></section>`;
  function load() {
    if (!promise)
      promise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "/vendor/office-editor.min.js?v=1.2.4-i18n";
        script.onload = () => {
          module = window.StudyBridgeOfficeEditor;
          resolve(module);
        };
        script.onerror = () => {
          script.remove();
          promise = null;
          reject(new Error(ui.text("编辑器加载失败，请刷新重试。")));
        };
        document.head.appendChild(script);
      });
    return promise;
  }
  async function mount(ctx) {
    const token = ++generation,
      host = document.getElementById("officeHost");
    if (!host) {
      module?.detach();
      return;
    }
    try {
      const editor = await load();
      if (token === generation && host.isConnected) editor.attach(host, ctx);
    } catch (error) {
      if (token === generation && host.isConnected)
        host.textContent = error.message;
    }
  }
  window.StudyBridgeOffice = {
    supports,
    html,
    mount,
    capture: () => module?.capture(),
  };
})();
