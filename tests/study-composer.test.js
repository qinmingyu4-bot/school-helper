const assert = require("node:assert/strict");
const { test } = require("node:test");
const { create } = require("../public/study-composer");
const fs = require("node:fs");
const vm = require("node:vm");
const modes = require("../public/study-modes");
const spaces = require("../public/chat-spaces");

function harness() {
  const events = {}, windowEvents = {};
  const input = { id: "chatInput", value: "未发送的草稿", scrollHeight: 44, style: {} };
  let focused = false;
  const menu = { open: true, querySelector: () => ({ focus() { focused = true; } }) };
  const root = { querySelector: () => input, querySelectorAll: () => menu.open ? [menu] : [] };
  const window = { document: { addEventListener: (event, fn) => { events[event] = fn; } },
    addEventListener: (event, fn) => { windowEvents[event] = fn; },
    getComputedStyle: () => ({ minHeight: "44px", maxHeight: "140px", borderTopWidth: "0px", borderBottomWidth: "0px" }) };
  return { input, menu, events, windowEvents, focused: () => focused, controller: create({ root, window }) };
}

test("shared composer grows complete lines, caps long text, shrinks after clearing and preserves drafts", () => {
  const h = harness(); h.controller.resize(); assert.equal(h.input.style.height, "44px");
  h.input.scrollHeight = 92; h.events.input({ target: h.input });
  assert.equal(h.input.style.height, "92px"); assert.equal(h.input.style.overflowY, "hidden");
  h.input.scrollHeight = 300; h.windowEvents.resize();
  assert.equal(h.input.style.height, "140px"); assert.equal(h.input.style.overflowY, "auto");
  assert.equal(h.input.value, "未发送的草稿");
  h.input.scrollHeight = 44; h.controller.resize(); assert.equal(h.input.style.height, "44px");
});

test("More remains usable inside, closes after an action/outside click and restores focus on Escape", () => {
  const h = harness();
  h.events.click({ target: { closest: (selector) => selector === ".quick-prompts-more" ? h.menu : null } });
  assert.equal(h.menu.open, true);
  h.events.click({ target: { closest: () => null } }); assert.equal(h.menu.open, false);
  h.menu.open = true; h.events.click({ target: { closest: () => h.menu } }); assert.equal(h.menu.open, false);
  h.menu.open = true; let prevented = false;
  h.events.keydown({ key: "Escape", target: { closest: () => h.menu }, preventDefault() { prevented = true; } });
  assert.equal(h.menu.open, false); assert.equal(h.focused(), true); assert.equal(prevented, true);
});

test("compact shortcuts retain every mode/general question and Cheatsheet PDF without changing prompts", () => {
  const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
  const functionSource = source.slice(source.indexOf("  function quickPromptsHtml()"), source.indexOf("  function sendButtonContent("));
  for (const mode of [...Object.keys(modes.modes), "general"]) {
    const context = vm.createContext({ state: { studyMode: mode }, isGeneralChat: () => mode === "general", studyModes: modes, chatSpaces: spaces, esc: (s) => String(s).replaceAll('"', "&quot;") });
    vm.runInContext(functionSource, context);
    const html = context.quickPromptsHtml();
    const prompts = mode === "general" ? spaces.prompts : [...modes.modes[mode].prompts, ...modes.globalPrompts];
    for (const [label, prompt] of prompts) { assert.ok(html.includes(label)); assert.ok(html.includes(prompt.replaceAll('"', "&quot;"))); }
    assert.equal((html.match(/data-action="quick-prompt"/g) || []).length, prompts.length);
    assert.ok(html.includes('class="quick-prompts-more"'));
    if (mode === "cheatsheet") assert.ok(html.includes('data-action="cheatsheet-pdf"'));
  }
});
