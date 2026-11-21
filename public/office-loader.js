(function () {
  "use strict";
  const ui = window.StudyBridgeI18n;
  const editorURL = "/vendor/office-editor.min.js?asset=3cc80a60965b43b9adda2e78";
  let preload = null, account = null, listing = null;
  function warm() {
    const connection = navigator.connection;
    if (preload || promise || connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || "")) return;
    preload = document.createElement("link");
    preload.rel = "preload";
    preload.as = "script";
    preload.href = editorURL;
    preload.fetchPriority = "low";
    preload.onerror = () => { preload?.remove(); preload = null; };
    document.head.appendChild(preload);
  }
  function projects(ctx) {
    if (account !== ctx.userId) { account = ctx.userId; listing = null; }
    if (listing && (listing.pending || Date.now() - listing.at < 30000)) return listing.promise;
    const entry = { pending: true, at: 0 };
    listing = entry;
    entry.promise = Promise.resolve().then(() => ctx.api("/api/office")).then((result) => {
      entry.pending = false;
      entry.at = Date.now();
      return result;
    }, (error) => {
      if (listing === entry) listing = null;
      throw error;
    });
    // Loading the script and the list overlap; a script failure must not leave
    // an unobserved list rejection while the user retries the editor.
    void entry.promise.catch(() => {});
    return entry.promise;
  }
  let sharedLink = null;
  try {
    const hash = new URLSearchParams(location.hash.slice(1));
    const pending = hash.has('office') ? { id: hash.get('office'), ownerId: hash.get('owner'), kind: hash.get('kind'), token: hash.get('token') } : JSON.parse(sessionStorage.getItem('office.pending-share') || 'null');
    if (pending && /^office_[\w-]{1,80}$/.test(pending.id) && /^[\w-]{1,120}$/.test(pending.ownerId) && ['docs','sheets','slides'].includes(pending.kind) && /^[a-f0-9]{64}$/.test(pending.token)) {
      sharedLink = pending;
      sessionStorage.setItem('office.pending-share', JSON.stringify(pending));
    }
  } catch { /* Private browsing can block session storage. */ }

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
        script.src = editorURL;
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
    if (account !== ctx.userId) { account = ctx.userId; listing = null; }
    const token = ++generation,
      host = document.getElementById("officeHost");
    if (!host) {
      module?.detach();
      if (ctx.userId && document.querySelector(".tools-tabs")) warm();
      return;
    }
    try {
      if (ctx.userId && !ctx.officeEntry?.share && !module?.hasWorkspace(ctx)) void projects(ctx);
      const editor = await load();
      if (token === generation && host.isConnected) await editor.attach(host, {
        ...ctx,
        officeProjects: () => projects(ctx),
        invalidateOfficeProjects: () => {
          if (account === ctx.userId) listing = null;
          window.StudyBridgeOfficeLibrary?.invalidate(ctx.userId);
        },
      });
    } catch (error) {
      if (token === generation && host.isConnected)
        host.textContent = error.message;
    }
  }
  window.StudyBridgeOffice = {
    get sharedLink() { return sharedLink; },
    takeSharedLink() {
      const link = sharedLink;
      sharedLink = null;
      try { sessionStorage.removeItem("office.pending-share"); } catch { /* Storage can be disabled. */ }
      return link;
    },
    shareFragment: ({ id, ownerId, kind, token }) => "#" + new URLSearchParams({ office: id, owner: ownerId, kind, token }),
    supports,
    html,
    mount,
    list: (ctx, force = false) => { if (force && account === ctx.userId) listing = null; return projects(ctx); },
    pendingDraft: ctx => module?.pendingDraft(ctx),
    flush: () => module?.flush(),
    capture: () => module?.capture(),
  };
})();
