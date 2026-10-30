const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const english = require("../public/i18n-en");
const ui = require("../public/i18n");

test("language resolution uses a saved valid choice, then supported browser languages, then Chinese", () => {
  assert.equal(ui.resolveLanguage("en", ["zh-TW"]), "en");
  assert.equal(ui.resolveLanguage("invalid", ["fr-CA", "en-CA"]), "en");
  assert.equal(ui.resolveLanguage(null, ["zh-TW", "en-US"]), "zh-CN");
  assert.equal(ui.resolveLanguage(null, ["fr"]), "zh-CN");
  assert.equal(ui.resolveLanguage(null), "zh-CN");
});

test("UI templates translate labels and accessible text without translating user content or machine values", (context) => {
  context.after(() => ui.setLanguage("zh-CN"));
  ui.setLanguage("en");
  const userText = "设置";
  assert.equal(ui.html`<button data-action="设置" aria-label="设置">设置</button><p>${userText}</p>`, '<button data-action="设置" aria-label="Settings">Settings</button><p>设置</p>');
  assert.equal(ui.html`<input value="设置" placeholder="输入问题…">`, '<input value="设置" placeholder="Ask a question…">');
  assert.equal(ui.message`正在上传 ${2}/${3}：${"日程.pdf"}`, "Uploading 2/3: 日程.pdf");
  assert.equal(ui.text("未收录的文案"), "未收录的文案");
  assert.equal(ui.html`<b>${"<span>设置</span>"}</b>`, "<b><span>设置</span></b>");
  ui.setLanguage("zh-CN");
  assert.equal(ui.html`<button>设置</button><p>${userText}</p>`, "<button>设置</button><p>设置</p>");
});

function browser(saved, blocked = false) {
  const events = {}, storage = new Map(saved ? [[ui.storageKey, saved]] : []);
  const context = { StudyBridgeEnglish: english, navigator: { languages: ["en-CA"] },
    localStorage: { getItem: (key) => { if (blocked) throw new Error("denied"); return storage.get(key); }, setItem: (key, value) => { if (blocked) throw new Error("denied"); storage.set(key, value); } },
    document: { documentElement: {}, querySelectorAll: () => [], addEventListener: (name, listener) => { events[name] = listener; } },
    addEventListener: (name, listener) => { events[name] = listener; } };
  vm.runInNewContext(fs.readFileSync(require.resolve("../public/i18n"), "utf8"), context);
  return { context, events, storage, language: context.StudyBridgeI18n };
}

test("browser choices survive reload, update document language and synchronize other tabs", () => {
  const first = browser();
  assert.equal(first.language.getLanguage(), "en");
  first.language.setLanguage("zh-CN");
  assert.equal(first.context.document.documentElement.lang, "zh-CN");
  assert.equal(browser(first.storage.get(ui.storageKey)).language.getLanguage(), "zh-CN");
  let updates = 0;
  const unsubscribe = first.language.subscribe(() => { updates++; });
  first.events.storage({ key: ui.storageKey, newValue: "en" });
  assert.equal(first.language.getLanguage(), "en");
  assert.equal(updates, 1);
  unsubscribe();
  first.language.setLanguage("zh-CN");
  assert.equal(updates, 1);
  assert.equal(first.language.setLanguage("invalid"), false);
});

test("blocked browser storage does not prevent switching languages", () => {
  const instance = browser(null, true);
  assert.equal(instance.language.getLanguage(), "en");
  assert.doesNotThrow(() => instance.language.setLanguage("zh-CN"));
  assert.equal(instance.language.getLanguage(), "zh-CN");
});

test("calendar labels use the active locale without changing course names or schedule values", (context) => {
  context.after(() => ui.setLanguage("zh-CN"));
  const calendar = require("../public/schedule-calendar");
  ui.setLanguage("en");
  assert.match(calendar.dateLabel("2026-10-30"), /Friday, October 30, 2026/);
  const model = calendar.buildModel({ now: "2026-10-30T12:00:00Z", timeZone: "UTC", items: [{ title: "日程", kind: "DDL", startsAt: "2026-10-31T12:00:00Z" }] });
  const html = calendar.render(model);
  assert.match(html, /Next event/);
  assert.match(html, /<b>日程<\/b>/);
  assert.match(html, /Sun/);
  ui.setLanguage("zh-CN");
  assert.match(calendar.dateLabel("2026-10-30"), /2026年10月30日/);
});
