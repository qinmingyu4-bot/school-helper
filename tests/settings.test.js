const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const { preferenceBackup } = require("../public/settings");

test("sign-out reports progress, drains saves, and restores retry after a failure", async () => {
  const source = fs.readFileSync(require.resolve("../public/settings"), "utf8");
  const events = [], statuses = [], button = { disabled: false };
  let finishSave, finishLogout, click;
  const context = vm.createContext({
    dialog: { querySelector: () => ({ addEventListener: (_name, handler) => { click = handler; } }) },
    active: () => true, ui: { text: value => value }, setStatus: (_selector, text, error) => statuses.push({ text, error }),
    saveLearning: () => new Promise(resolve => { events.push("save learning"); finishSave = resolve; }),
    flushAppearance: async () => { events.push("save appearance"); },
    logout: () => new Promise(resolve => { events.push("sign out"); finishLogout = resolve; })
  });
  vm.runInContext(source.slice(source.indexOf('    dialog.querySelector(".settings-logout").addEventListener'),
    source.indexOf("    function editLearning()")), context);
  const pending = click({ currentTarget: button });
  await click({ currentTarget: button });
  assert.equal(button.disabled, true);
  assert.match(statuses.at(-1).text, /正在退出登录/);
  assert.deepEqual(events, ["save learning", "save appearance"]);
  finishSave();
  await new Promise(setImmediate);
  assert.equal(events.at(-1), "sign out");
  finishLogout(false);
  await pending;
  assert.equal(button.disabled, false);
  assert.equal(statuses.at(-1).error, true);
  const retry = click({ currentTarget: button });
  finishSave();
  await new Promise(setImmediate);
  finishLogout(true);
  await retry;
  assert.equal(button.disabled, true);
  assert.equal(events.filter(event => event === "sign out").length, 2);
});

test("preference exports include only the selected appearance and learning choices, without credentials or account data", () => {
  const result = preferenceBackup({ version: "1.1.86", date: new Date("2026-10-26T12:00:00Z"),
    appearance: { theme: "mist-blue", token: "private-token", email: "private@example.test" },
    learning: { englishTerms: true, englishAnswers: false, chineseExplanations: true, customInstruction: "先举例，再总结。", password: "private-password", courseFiles: ["private.pdf"] } });
  assert.equal(result.format, "studybridge-preferences");
  assert.equal(result.formatVersion, 1);
  assert.equal(result.exportedAt, "2026-10-26T12:00:00.000Z");
  assert.deepEqual(result.appearance, { theme: "mist-blue" });
  assert.deepEqual(result.learningStyle, { englishTerms: true, englishAnswers: false, chineseExplanations: true, customInstruction: "先举例，再总结。" });
  assert.doesNotMatch(JSON.stringify(result), /private/);
});

test("preference exports retain dark mode and its remembered daytime palette", () => {
  const value = preferenceBackup({ version: "1.1.104", appearance: { theme: "celadon", mode: "dark" }, learning: {} });
  assert.deepEqual(value.appearance, { theme: "celadon", mode: "dark" });
});

test("preference exports retain the optional color logo and omit the default monochrome choice", () => {
  const options = { version: "1.1.115", learning: {} };
  assert.deepEqual(preferenceBackup({ ...options, appearance: { theme: "monochrome", mode: "dark", logo: "color" } }).appearance,
    { theme: "monochrome", mode: "dark", logo: "color" });
  assert.deepEqual(preferenceBackup({ ...options, appearance: { theme: "celadon", logo: "monochrome" } }).appearance,
    { theme: "celadon" });
});
