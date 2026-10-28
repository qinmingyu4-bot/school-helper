const assert = require("node:assert/strict");
const { test } = require("node:test");
const { preferenceBackup } = require("../public/settings");

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
