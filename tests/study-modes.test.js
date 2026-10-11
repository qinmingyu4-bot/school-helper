const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const config = require("../public/study-modes");

test("browser and server share seven complete learning workflows", () => {
  const browser = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/study-modes.js"), "utf8"), browser);
  assert.equal(JSON.stringify(browser.StudyBridgeStudyModes.modes), JSON.stringify(config.modes));
  assert.deepEqual(Object.keys(config.modes), ["preview", "guided", "review", "assignment", "exam", "cheatsheet", "cram"]);
  assert.ok(config.getMode(config.defaultMode));
  const questions = new Set();
  for (const [id, mode] of Object.entries(config.modes)) {
    assert.equal(mode.prompts.length, 4);
    assert.ok(config.buildInstruction(id).includes(mode.instruction));
    for (const [label, question] of mode.prompts) {
      assert.ok(label.length > 0 && question.length > label.length);
      assert.ok(!questions.has(question), `Duplicate preset: ${label}`);
      questions.add(question);
    }
  }
  assert.equal(config.globalPrompts.length, 2);
});

test("non-study and inherited keys do not acquire academic workflows", () => {
  for (const id of ["email", "tool-docs", "unknown", "__proto__", "constructor", "", undefined]) {
    assert.equal(config.getMode(id), null);
    assert.equal(config.buildInstruction(id), "");
  }
});
