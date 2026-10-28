const assert = require("node:assert/strict");
const { test } = require("node:test");
const { create } = require("../public/mobile-navigation");

function harness({ mobile = true, url = "http://localhost/app", historyState = null } = {}) {
  const listeners = {}, documentListeners = {}, navigations = [], animations = [];
  const button = { focus() {}, setAttribute() {} };
  const sidebar = { inert: false, scrollTop: 0, querySelector: () => button, setAttribute() {}, removeAttribute() {} };
  const workspace = { inert: false, querySelector: () => button, animate: (...args) => animations.push(args) };
  const shell = { dataset: {}, querySelector: (s) => s === ".sidebar" ? sidebar : s === ".workspace" ? workspace : button };
  const root = { querySelector: (s) => s === ".app-shell" ? shell : s === ".sidebar" ? sidebar : s === ".workspace" ? workspace : button };
  const media = { matches: mobile, addEventListener(_, fn) { this.change = fn; } };
  const entries = [{ state: historyState, url }]; let index = 0;
  const win = {
    location: { href: url }, document: { addEventListener: (name, fn) => { documentListeners[name] = fn; } },
    matchMedia: (query) => query.includes("reduced-motion") ? { matches: false } : media,
    addEventListener: (name, fn) => { listeners[name] = fn; },
    history: {
      get state() { return entries[index].state; },
      replaceState(state, _, next) { entries[index] = { state, url: next ? new URL(next, win.location.href).href : win.location.href }; win.location.href = entries[index].url; },
      pushState(state, _, next) { entries.splice(index + 1); entries.push({ state, url: new URL(next, win.location.href).href }); index++; win.location.href = entries[index].url; },
      back() { if (index) { index--; win.location.href = entries[index].url; listeners.popstate({ state: entries[index].state }); } }
    }
  };
  const controller = create({ window: win, navigate: (page) => navigations.push(page) });
  const context = { userId: "alice", mode: "student", page: "study" };
  const sync = (patch = {}) => controller.sync(root, Object.assign(context, patch));
  const click = (action) => documentListeners.click({ preventDefault() {}, target: { closest: () => ({ dataset: { mobileAction: action } }) } });
  return { controller, sync, click, shell, sidebar, workspace, media, win, entries, listeners, navigations, animations };
}

test("mobile app starts at its main menu even after the existing router writes a saved page URL", () => {
  const h = harness();
  h.win.history.replaceState(null, "", "/app?page=study"); h.sync();
  assert.equal(h.controller.snapshot().view, "menu");
  assert.equal(new URL(h.win.location.href).pathname, "/app");
  assert.equal(new URL(h.win.location.href).search, "");
  assert.equal(h.workspace.inert, true); assert.equal(h.sidebar.inert, false);
});

test("all five destinations enter a page and return through history without navigating or rebuilding the page", () => {
  for (const page of ["community", "classmates", "schedule", "study", "tools"]) {
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
