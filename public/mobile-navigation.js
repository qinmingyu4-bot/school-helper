(function (global) {
  "use strict";
  function create({ window: win = global, navigate, resizeComposer = () => {} }) {
    const media = win.matchMedia("(max-width: 700px)");
    const initialHasPage = new URL(win.location.href).searchParams.has("page");
    const initialHistory = win.history.state?.sbMobile;
    let root, userId, page, student = false, view = "menu", panel = false, initialized = false;
    let menuScroll = 0, returnPage = "study", hasMenuEntry = false, entering = "";
    const marker = () => ({ ...(win.history.state || {}), sbMobile: { userId, view, page, hasMenuEntry } });
    const active = () => media.matches && student && Boolean(userId);
    function apply(focus = false) {
      const shell = root?.querySelector(".app-shell");
      if (!shell) return;
      shell.dataset.mobileView = view;
      shell.dataset.mobilePanel = panel ? "open" : "closed";
      const sidebar = shell.querySelector(".sidebar"), workspace = shell.querySelector(".workspace");
      const enabled = active();
      if (sidebar) {
        sidebar.inert = enabled && view === "page" && !panel;
        if (enabled && panel) sidebar.setAttribute("aria-label", "课程与资料");
        else sidebar.removeAttribute("aria-label");
      }
      if (workspace) workspace.inert = enabled && (view === "menu" || panel);
      shell.querySelector('[data-mobile-action="study-panel"]')?.setAttribute("aria-expanded", String(panel));
      resizeComposer();
      if (enabled && focus) {
        const target = panel ? sidebar?.querySelector('[data-mobile-action="close-panel"]')
          : view === "menu" ? sidebar?.querySelector(`[data-page="${returnPage}"]`)
          : workspace?.querySelector('[data-mobile-action="menu"]');
        target?.focus({ preventScroll: true });
      }
    }
    function sync(element, context) {
      root = element;
      student = context.mode !== "admin";
      if (userId !== context.userId) {
        userId = context.userId;
        initialized = false; panel = false; hasMenuEntry = false; menuScroll = 0;
      }
      if (!initialized && userId) {
        const saved = initialHistory;
        view = saved?.userId === userId ? saved.view : initialHasPage ? "page" : "menu";
        hasMenuEntry = saved?.userId === userId && Boolean(saved.hasMenuEntry);
        initialized = true;
      } else if (page && page !== context.page) {
        view = "page"; panel = false;
      }
      page = context.page;
      if (page !== "study") panel = false;
      if (active()) win.history.replaceState(marker(), "", view === "menu" ? "/app" : win.location.href);
      apply();
      if (active() && entering === page) {
        entering = "";
        if (!win.matchMedia("(prefers-reduced-motion: reduce)").matches) root.querySelector(".workspace")?.animate?.(
          [{ transform: "translateX(100%)" }, { transform: "translateX(0)" }], { duration: 240, easing: "ease-out" });
        root.querySelector('[data-mobile-action="menu"]')?.focus({ preventScroll: true });
      }
    }
    function enter(destination) {
      if (!active()) return false;
      const same = page === destination;
      if (!same) entering = destination;
      if (view === "menu") {
        menuScroll = root.querySelector(".sidebar")?.scrollTop || 0;
        view = "page"; hasMenuEntry = true; returnPage = destination; panel = false;
        const next = marker(); next.sbMobile.page = destination;
        win.history.pushState(next, "", `/app?page=${encodeURIComponent(destination)}`);
      } else { view = "page"; panel = false; }
      if (same) apply(true);
      return same;
    }
    function menu() {
      if (!active()) return;
      returnPage = page; panel = false;
      // Change only presentation: keep the mounted page, requests, files and drafts.
      view = "menu";
      win.history.replaceState(marker(), "", "/app");
      apply(true);
      const sidebar = root.querySelector(".sidebar");
      if (sidebar) sidebar.scrollTop = menuScroll;
    }
    function closePanel() { panel = false; apply(); root?.querySelector('[data-mobile-action="study-panel"]')?.focus({ preventScroll: true }); }
    function click(event) {
      const action = event.target.closest?.("[data-mobile-action]")?.dataset.mobileAction;
      if (!action || !active()) return;
      event.preventDefault();
      if (action === "menu") {
        if (hasMenuEntry && win.history.state?.sbMobile?.view === "page") win.history.back();
        else menu();
      }
      if (action === "study-panel") { panel = true; apply(true); }
      if (action === "close-panel") closePanel();
    }
    function popstate(event) {
      if (!active() || event.state?.sbMobile?.userId !== userId) return;
      const saved = event.state.sbMobile;
      panel = false; hasMenuEntry = Boolean(saved.hasMenuEntry);
      if (saved.view === "menu") menu();
      else {
        view = "page"; apply(true);
        if (saved.page !== page) void navigate(saved.page);
      }
    }
    function keydown(event) {
      if (!active() || !panel || root.querySelector("dialog[open]")) return;
      if (event.key === "Escape") { event.preventDefault(); closePanel(); }
      if (event.key === "Tab") {
        const items = [...root.querySelectorAll('.sidebar button, .sidebar input, .sidebar textarea, .sidebar select, .sidebar a[href]')]
          .filter((el) => !el.disabled && el.getClientRects().length);
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && win.document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && win.document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    win.addEventListener("popstate", popstate);
    win.document.addEventListener("click", click);
    win.document.addEventListener("keydown", keydown);
    media.addEventListener("change", () => { panel = false; apply(); });
    return { sync, enter, historyState: () => active() ? win.history.state : null,
      closeStudyPanel: () => { if (active() && panel) closePanel(); },
      snapshot: () => ({ view, page, panel, active: active() }) };
  }
  if (typeof module === "object" && module.exports) module.exports = { create };
  else global.StudyBridgeMobileNavigation = { create };
})(typeof window === "object" ? window : globalThis);
