const assert = require("node:assert/strict");
const { test } = require("node:test");
const { create } = require("../public/mobile-navigation");

function harness({ mobile = true, width = null, url = "http://localhost/app", historyState = null, deferBack = false } = {}) {
  const listeners = {}, documentListeners = {}, navigations = [], animations = [];
  let backCalls = 0, settleBack, shown = 0;
  const button = { focus() {}, setAttribute() {} };
  const sidebar = { inert: false, scrollTop: 0, querySelector: () => button, setAttribute() {}, removeAttribute() {} };
  const workspace = { inert: false, querySelector: () => button, animate: (...args) => animations.push(args) };
  const shell = { dataset: {}, querySelector: (s) => s === ".sidebar" ? sidebar : s === ".workspace" ? workspace : button };
  const root = { querySelector: (s) => s === ".app-shell" ? shell : s === ".sidebar" ? sidebar : s === ".workspace" ? workspace : button,
    contains: item => item === workspace };
  const media = { matches: mobile, addEventListener(_, fn) { this.change = fn; } };
  const entries = [{ state: historyState, url }]; let index = 0;
  const win = {
    innerWidth: width ?? 390, location: { href: url },
    document: { querySelector: () => null, addEventListener: (name, fn) => { documentListeners[name] = fn; },
      removeEventListener: (name, fn) => { if (documentListeners[name] === fn) delete documentListeners[name]; } },
    getComputedStyle: (node) => ({ overflowX: node.overflowX }),
    matchMedia: (query) => {
      if (query.includes("reduced-motion")) return { matches: false };
      if (width !== null) media.matches = width <= Number(query.match(/max-width:\s*(\d+)px/)[1]);
      return media;
    },
    addEventListener: (name, fn) => { listeners[name] = fn; },
    history: {
      get state() { return entries[index].state; },
      replaceState(state, _, next) { entries[index] = { state, url: next ? new URL(next, win.location.href).href : win.location.href }; win.location.href = entries[index].url; },
      pushState(state, _, next) { entries.splice(index + 1); entries.push({ state, url: new URL(next, win.location.href).href }); index++; win.location.href = entries[index].url; },
      back() {
        backCalls++;
        settleBack = () => {
          if (index) { index--; win.location.href = entries[index].url; listeners.popstate({ state: entries[index].state }); }
        };
        if (!deferBack) settleBack();
      }
    }
  };
  const navigate = (page) => navigations.push(page);
  const selectPage = (page) => { if (controller.enter(page) === false) navigate(page); };
  const controller = create({ window: win, navigate, selectPage, onWorkspaceShown: () => shown++ });
  const context = { userId: "alice", mode: "student", page: "study" };
  const sync = (patch = {}) => controller.sync(root, Object.assign(context, patch));
  const click = (action) => documentListeners.click({ preventDefault() {}, target: { closest: () => ({ dataset: { mobileAction: action } }) } });
  function touch(type, x, y, { blocked = false, scroll = false, count = 1, cancelable = true } = {}) {
    const point = { identifier: 7, clientX: x, clientY: y };
    const target = {
      parentElement: workspace, scrollWidth: scroll ? 600 : 390, clientWidth: 390, overflowX: scroll ? "auto" : "visible",
      closest(selector) { return selector === ".workspace" ? workspace : blocked ? this : null; }
    };
    const event = { target, touches: type === "touchend" ? [] : Array(count).fill(point), changedTouches: [point],
      cancelable, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    documentListeners[type]?.(event);
    return event.defaultPrevented;
  }
  return { controller, sync, click, touch, root, shell, sidebar, workspace, media, win, entries, listeners, documentListeners, navigations, animations,
    finishBack: () => settleBack(), backCalls: () => backCalls, shown: () => shown };
}

test("mobile app starts at its main menu even after the existing router writes a saved page URL", () => {
  const h = harness();
  h.win.history.replaceState(null, "", "/app?page=study"); h.sync();
  assert.equal(h.controller.snapshot().view, "menu");
  assert.equal(new URL(h.win.location.href).pathname, "/app");
  assert.equal(new URL(h.win.location.href).search, "");
  assert.equal(h.workspace.inert, true); assert.equal(h.sidebar.inert, false);
});

test("all six destinations enter a page and return through history without navigating or rebuilding the page", () => {
  for (const page of ["community", "classmates", "schedule", "study", "tools", "email"]) {
    const h = harness(); h.sync(); h.sidebar.scrollTop = 140;
    assert.equal(h.controller.enter(page), page === "study"); h.sync({ page });
    assert.equal(h.shell.dataset.mobileView, "page");
    assert.equal(h.sidebar.inert, true); assert.equal(h.workspace.inert, false);
    h.click("menu");
    assert.equal(h.shell.dataset.mobileView, "menu"); assert.equal(h.sidebar.scrollTop, 140);
    assert.equal(h.navigations.length, 0, "returning must keep form/file/chat drafts mounted");
    assert.equal(h.controller.enter(page), true, "same page reopens without a server reload");
  }
});

test("direct links open the requested page and their back button can still reach the menu", () => {
  const h = harness({ url: "http://localhost/app?page=schedule" }); h.sync({ page: "schedule" });
  assert.equal(h.shell.dataset.mobileView, "page"); h.click("menu");
  assert.equal(h.shell.dataset.mobileView, "menu"); assert.equal(h.navigations.length, 0);
});

test("mobile return shows the menu immediately and settles browser history without a second exit", () => {
  const h = harness({ deferBack: true }); h.sync();
  h.sidebar.scrollTop = 140;
  h.controller.enter("study");
  h.click("menu");
  assert.equal(h.shell.dataset.mobileView, "menu");
  assert.equal(h.workspace.inert, true);
  assert.equal(h.sidebar.scrollTop, 140);
  assert.equal(h.shown(), 1, "hide must not resize or repaint the workspace");
  h.click("menu");
  h.sync();
  assert.equal(h.win.history.state.sbMobile.view, "page", "background redraw must leave the pending history entry alone");
  assert.equal(h.backCalls(), 1);
  h.sidebar.scrollTop = 95;
  h.finishBack();
  assert.equal(h.sidebar.scrollTop, 95, "history settlement must not run the visual exit twice");
  assert.equal(h.win.location.href, "http://localhost/app");
  assert.deepEqual(h.navigations, []);
  assert.deepEqual(h.animations, []);
});

test("a new destination selected before back settles opens once, preserving history order", () => {
  const h = harness({ deferBack: true }); h.sync();
  h.controller.enter("study"); h.click("menu");
  assert.equal(h.controller.enter("schedule"), null);
  assert.equal(h.controller.enter("tools"), null);
  assert.deepEqual(h.navigations, []);
  h.finishBack();
  assert.deepEqual(h.navigations, ["tools"]);
  h.sync({ page: "tools" });
  assert.equal(h.shell.dataset.mobileView, "page");
  assert.deepEqual(h.entries.map(entry => new URL(entry.url).searchParams.get("page")), [null, "tools"]);
});

test("inward swipes from either side return once, even if the button is also pressed", () => {
  for (const [start, step, finish] of [[350, 320, 230], [40, 70, 160]]) {
    const h = harness({ deferBack: true }); h.sync(); h.controller.enter("study");
    assert.equal(h.touch("touchstart", start, 320), false);
    assert.equal(h.touch("touchmove", step, 325), true);
    assert.equal(h.touch("touchend", finish, 329), true);
    assert.equal(h.shell.dataset.mobileView, "menu");
    h.click("menu");
    h.touch("touchstart", start, 320);
    h.touch("touchmove", step, 325);
    h.touch("touchend", finish, 329);
    assert.equal(h.backCalls(), 1);
    h.finishBack();
    assert.equal(h.win.location.href, "http://localhost/app");
    assert.deepEqual(h.navigations, []);
  }
});

test("a direct-linked workspace also returns on one swipe, without navigating out of the app", () => {
  const h = harness({ url: "http://localhost/app?page=study" }); h.sync();
  h.touch("touchstart", 350, 310);
  h.touch("touchmove", 322, 309);
  h.touch("touchend", 255, 311);
  assert.equal(h.shell.dataset.mobileView, "menu");
  assert.equal(h.win.location.href, "http://localhost/app");
  assert.equal(h.backCalls(), 0);
});

test("a browser back that settles during touch cancels the pending app gesture", () => {
  const h = harness(); h.sync(); h.controller.enter("study");
  h.touch("touchstart", 350, 310);
  h.touch("touchmove", 322, 309);
  h.win.history.back();
  h.touch("touchend", 240, 311);
  assert.equal(h.shell.dataset.mobileView, "menu");
  assert.equal(h.backCalls(), 1);
});

test("edge tracking leaves scrolling, controls, native edges and canceled touches alone", () => {
  const h = harness(); h.sync(); h.controller.enter("study");
  for (const [x, y, options] of [[5, 300], [385, 300], [190, 300], [350, 300, { blocked: true }],
    [350, 300, { scroll: true }], [350, 300, { count: 2 }]]) {
    h.touch("touchstart", x, y, options);
    assert.equal(h.documentListeners.touchmove, undefined);
  }
  h.touch("touchstart", 350, 300);
  assert.equal(h.touch("touchmove", 347, 352), false);
  assert.equal(h.documentListeners.touchmove, undefined);
  h.touch("touchstart", 350, 300);
  assert.equal(h.touch("touchmove", 327, 300, { cancelable: false }), false);
  h.touch("touchend", 240, 300);
  h.touch("touchstart", 350, 300);
  h.touch("touchmove", 330, 300);
  h.touch("touchcancel", 330, 300);
  h.touch("touchend", 240, 300);
  h.touch("touchstart", 350, 300);
  h.touch("touchmove", 330, 300);
  h.touch("touchend", 308, 300);
  assert.equal(h.shell.dataset.mobileView, "page");
  assert.equal(h.backCalls(), 0);
});

test("a study panel is separate from chat, survives redraws, and closes after a course selection", () => {
  const h = harness(); h.sync(); h.controller.enter("study"); h.click("study-panel");
  assert.equal(h.controller.snapshot().panel, true); assert.equal(h.workspace.inert, true); assert.equal(h.sidebar.inert, false);
  h.sync(); assert.equal(h.shell.dataset.mobilePanel, "open");
  h.controller.closeStudyPanel(); assert.equal(h.shell.dataset.mobilePanel, "closed"); assert.equal(h.workspace.inert, false);
});

test("desktop and creator layouts are never made inert, and resizing releases the hidden pane", () => {
  const desktop = harness({ mobile: false }); desktop.sync();
  assert.equal(desktop.controller.enter("schedule"), false); assert.equal(desktop.entries.length, 1);
  assert.equal(desktop.sidebar.inert, false); assert.equal(desktop.workspace.inert, false);
  const admin = harness(); admin.sync({ mode: "admin", page: "admin" });
  assert.equal(admin.controller.enter("study"), false); assert.equal(admin.workspace.inert, false);
  const h = harness(); h.sync(); h.controller.enter("study"); h.click("study-panel");
  h.media.matches = false; h.media.change();
  assert.equal(h.controller.snapshot().panel, false); assert.equal(h.workspace.inert, false); assert.equal(h.sidebar.inert, false);
});

test("browser forward restores the destination while stale history from another account is ignored", () => {
  const h = harness(); h.sync();
  h.listeners.popstate({ state: { sbMobile: { userId: "bob", view: "page", page: "tools" } } });
  assert.equal(h.navigations.length, 0);
  h.listeners.popstate({ state: { sbMobile: { userId: "alice", view: "page", page: "tools", hasMenuEntry: true } } });
  assert.deepEqual(h.navigations, ["tools"]);
  h.sync({ page: "tools" }); assert.equal(h.shell.dataset.mobileView, "page");
});


test("portrait tablets use page navigation; landscape tablets keep both panes interactive", () => {
  for (const width of [768, 820, 834, 900, 901, 1024, 1194, 1366]) {
    const h = harness({ width, url: "http://localhost/app?page=study" }); h.sync();
    assert.equal(h.controller.snapshot().active, width <= 900, `width ${width}`);
    assert.equal(h.sidebar.inert, width <= 900);
    assert.equal(h.workspace.inert, false);
  }
});

test("rotating landscape into portrait keeps the mounted page and a usable menu return", () => {
  const h = harness({ mobile: false }); h.sync();
  h.media.matches = true; h.media.change();
  assert.equal(h.controller.snapshot().view, "page");
  assert.equal(h.workspace.inert, false);
  assert.equal(h.sidebar.inert, true);
  assert.equal(new URL(h.win.location.href).searchParams.get("page"), "study");
  h.click("menu"); assert.equal(h.controller.snapshot().view, "menu");
  assert.equal(h.controller.enter("study"), true);
  h.click("study-panel");
  h.media.matches = false; h.media.change();
  assert.equal(h.controller.snapshot().panel, false);
  h.media.matches = true; h.media.change();
  assert.equal(h.workspace.inert, false);
  assert.equal(h.navigations.length, 0, "rotation must not rebuild the page or discard drafts");
});
