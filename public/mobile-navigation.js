(function (global) {
  "use strict";
  const ui = typeof module === "object" && module.exports ? require("./i18n") : globalThis.StudyBridgeI18n;

  function create({ window: win = global, navigate, selectPage, onWorkspaceShown = () => {} }) {
    const media = win.matchMedia("(max-width: 900px)");
    const initialHasPage = new URL(win.location.href).searchParams.has("page");
    const initialHistory = win.history.state?.sbMobile;
    let root, userId, page, student = false, view = "menu", panel = false, initialized = false;
    let menuScroll = 0, returnPage = "study", hasMenuEntry = false, entering = "";
    let returning = false, queuedPage = "";
    let swipe = null;
    const doc = win.document;
    const marker = () => ({ ...(win.history.state || {}), sbMobile: { userId, view, page, hasMenuEntry } });
    const active = () => media.matches && student && Boolean(userId);
    const canReturn = () => active() && view === "page" && !returning;
    function apply(focus = false) {
      const shell = root?.querySelector(".app-shell");
      if (!shell) return;
      const sidebar = shell.querySelector(".sidebar"), workspace = shell.querySelector(".workspace");
      const enabled = active();
      if (enabled && view === "menu" && sidebar) {
        // Set the selection before exposing the menu, including while history is settling.
        for (const item of sidebar.querySelectorAll(".side-nav .nav-card[data-page], .profile-card[data-page]")) {
          const selected = item.dataset.page === page;
          item.classList.toggle("active", selected);
          if (selected) {
            if (item.getAttribute("aria-current") !== "page") item.setAttribute("aria-current", "page");
          } else if (item.hasAttribute("aria-current")) item.removeAttribute("aria-current");
        }
      }
      if (shell.dataset.mobileView !== view) shell.dataset.mobileView = view;
      const panelState = panel ? "open" : "closed";
      if (shell.dataset.mobilePanel !== panelState) shell.dataset.mobilePanel = panelState;
      if (sidebar) {
        sidebar.inert = enabled && view === "page" && !panel;
        if (enabled && panel) sidebar.setAttribute("aria-label", ui.text("课程与资料"));
        else sidebar.removeAttribute("aria-label");
      }
      if (workspace) workspace.inert = enabled && (view === "menu" || panel);
      shell.querySelector('[data-mobile-action="study-panel"]')?.setAttribute("aria-expanded", String(panel));
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
        stopSwipe();
        userId = context.userId;
        initialized = false; panel = false; hasMenuEntry = false; menuScroll = 0;
        returning = false; queuedPage = ""; entering = "";
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
      if (active() && !returning) win.history.replaceState(marker(), "", view === "menu" ? "/app" : win.location.href);
      apply();
      if (active() && entering === page) {
        entering = "";
        root.querySelector('[data-mobile-action="menu"]')?.focus({ preventScroll: true });
      }
    }
    function enter(destination) {
      if (!active()) return false;
      if (returning) { queuedPage = destination; return null; }
      const same = page === destination;
      if (!same) entering = destination;
      if (view === "menu") {
        menuScroll = root.querySelector(".sidebar")?.scrollTop || 0;
        view = "page"; hasMenuEntry = true; returnPage = destination; panel = false;
        const next = marker(); next.sbMobile.page = destination;
        win.history.pushState(next, "", `/app?page=${encodeURIComponent(destination)}`);
      } else { view = "page"; panel = false; }
      if (same) { apply(true); onWorkspaceShown(); }
      return same;
    }
    function showMenu() {
      if (view === "menu") return;
      stopSwipe();
      returnPage = page; panel = false;
      view = "menu"; entering = "";
      apply(true);
      const sidebar = root.querySelector(".sidebar");
      if (sidebar) sidebar.scrollTop = menuScroll;
    }
    function closePanel() {
      if (!panel) return;
      panel = false; apply(); onWorkspaceShown();
      root?.querySelector('[data-mobile-action="study-panel"]')?.focus({ preventScroll: true });
    }
    function returnToMenu() {
      if (!canReturn()) return;
      returning = hasMenuEntry && win.history.state?.sbMobile?.view === "page";
      // Show the menu once. The history event only settles the URL and index.
      showMenu();
      if (returning) win.history.back();
      else win.history.replaceState(marker(), "", "/app");
    }
    function stopSwipe() {
      if (!swipe) return;
      swipe = null;
      doc.removeEventListener("touchmove", moveSwipe);
      doc.removeEventListener("touchend", endSwipe);
      doc.removeEventListener("touchcancel", stopSwipe);
    }
    function startSwipe(event) {
      stopSwipe();
      if (!canReturn() || panel || event.defaultPrevented || event.touches.length !== 1
        || win.visualViewport?.scale > 1.01) return;
      const { identifier, clientX: x, clientY: y } = event.touches[0];
      const fromLeft = x < win.innerWidth / 2;
      const edgeDistance = fromLeft ? x : win.innerWidth - x;
      // Leave the outermost edge to native system/browser gestures.
      if (edgeDistance < 24 || edgeDistance > 64) return;
      const target = event.target;
      const workspace = target.closest?.(".workspace");
      if (!workspace || !root.contains(workspace) || doc.querySelector("dialog[open]")
        || target.closest("a, button, input, textarea, select, label, [contenteditable], [role='slider'], #officeHost")) return;
      for (let node = target; node && node !== workspace; node = node.parentElement) {
        if (node.scrollWidth > node.clientWidth + 2 && /^(auto|scroll|overlay)$/.test(win.getComputedStyle(node).overflowX)) return;
      }
      swipe = { identifier, x, y, direction: fromLeft ? 1 : -1, page, claimed: false };
      // Register a cancelable move handler only for a possible edge swipe.
      doc.addEventListener("touchmove", moveSwipe, { passive: false });
      doc.addEventListener("touchend", endSwipe, { passive: false });
      doc.addEventListener("touchcancel", stopSwipe, { passive: true });
    }
    function moveSwipe(event) {
      const touch = event.touches[0];
      if (!swipe || !canReturn() || panel || swipe.page !== page || event.touches.length !== 1
        || touch.identifier !== swipe.identifier || !event.cancelable || event.defaultPrevented) {
        stopSwipe();
        return;
      }
      const inward = (touch.clientX - swipe.x) * swipe.direction;
      const vertical = Math.abs(touch.clientY - swipe.y);
      if (!swipe.claimed && (inward < -8 || vertical > 12 && vertical > inward * 0.75)) {
        stopSwipe();
        return;
      }
      if (swipe.claimed || inward >= 12 && inward > vertical * 1.5) {
        event.preventDefault();
        swipe.claimed = true;
      }
    }
    function endSwipe(event) {
      const tracked = swipe;
      stopSwipe();
      if (!tracked?.claimed || !canReturn() || panel || tracked.page !== page || event.touches.length
        || !event.cancelable || event.defaultPrevented) return;
      const touch = event.changedTouches[0];
      if (touch?.identifier !== tracked.identifier) return;
      const inward = (touch.clientX - tracked.x) * tracked.direction;
      if (inward < 64 || inward <= Math.abs(touch.clientY - tracked.y) * 1.5) return;
      event.preventDefault();
      returnToMenu();
    }
    function click(event) {
      const action = event.target.closest?.("[data-mobile-action]")?.dataset.mobileAction;
      if (!action || !active()) return;
      event.preventDefault();
      if (action === "menu") returnToMenu();
      if (action === "study-panel" && view === "page") { panel = true; apply(true); }
      if (action === "close-panel") closePanel();
    }
    function popstate(event) {
      const saved = event.state?.sbMobile;
      if (!saved || saved.userId !== userId) return;
      returning = false;
      const destination = queuedPage;
      queuedPage = "";
      if (!active()) { if (destination) void selectPage(destination); return; }
      panel = false; hasMenuEntry = Boolean(saved.hasMenuEntry);
      if (saved.view === "menu") {
        showMenu();
        win.history.replaceState(marker(), "", "/app");
        if (destination) void selectPage(destination);
      } else {
        view = "page";
        if (saved.page !== page) void navigate(saved.page);
        else { apply(true); onWorkspaceShown(); }
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
    doc.addEventListener("click", click);
    doc.addEventListener("keydown", keydown);
    doc.addEventListener("touchstart", startSwipe, { passive: true });
    media.addEventListener("change", () => {
      stopSwipe();
      panel = false;
      // Rotation/split view keeps the mounted page and drafts visible.
      if (active() && !returning) {
        view = "page";
        hasMenuEntry = false;
        win.history.replaceState(marker(), "", `/app?page=${encodeURIComponent(page)}`);
      }
      apply();
      if (!active() || view === "page") onWorkspaceShown();
    });
    return { sync, enter, historyState: () => active() ? win.history.state : null,
      closeStudyPanel: () => { if (active() && panel) closePanel(); },
      snapshot: () => ({ view, page, panel, active: active() }) };
  }
  if (typeof module === "object" && module.exports) module.exports = { create };
  else global.StudyBridgeMobileNavigation = { create };
})(typeof window === "object" ? window : globalThis);
