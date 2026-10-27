const assert = require("node:assert/strict");
const { test } = require("node:test");
const { normalize, summary, buildInstruction, createSaver } = require("../public/learning-style");

test("academic preferences are gated by current intent without losing saved checkbox choices", () => {
  for (const englishTerms of [false, true]) {
    const preferences = { englishTerms, englishAnswers: true, chineseExplanations: true, customInstruction: "Use bilingual examples" };
    const snapshot = { ...preferences };
    const instruction = buildInstruction(preferences);
    assert.ok(instruction.indexOf("ACADEMIC SCOPE GATE") < instruction.indexOf("resolved response contract"));
    assert.match(instruction, /ONLY for the academic portion/);
    assert.match(instruction, /being inside a course or having a study mode selected does not make every question academic/);
    assert.match(instruction, /A general chat can contain academic work/);
    assert.match(instruction, /会不会很麻烦.*remains non-academic/);
    assert.match(instruction, /Reassess when the user changes topics/);
    assert.match(instruction, /For mixed requests, apply.*only to the learning portion/);
    assert.match(instruction, /API, HTTPS, BYOK and ChatGPT.*regardless of the English-terms checkbox/);
    assert.match(instruction, /do NOT apply.*custom study-format instructions/);
    assert.match(instruction, /Latest explicit user requests still take precedence/);
    assert.match(instruction, /Combined checkboxes/);
    assert.deepEqual(preferences, snapshot);
  }
  assert.match(buildInstruction({ englishAnswers: false }), /must not trigger an extra English translation/);
});

test("all checkbox combinations retain independent answer, explanation and term choices", () => {
  for (const englishTerms of [false, true]) for (const englishAnswers of [false, true]) for (const chineseExplanations of [false, true]) {
    const value = { englishTerms, englishAnswers, chineseExplanations, customInstruction: "" };
    assert.deepEqual(normalize(value), value);
    const instruction = buildInstruction(value);
    assert.ok(instruction.includes(englishTerms ? "English terms ON" : "English terms OFF"));
    assert.ok(instruction.includes(englishAnswers ? "English answer ON" : "English answer OFF"));
    assert.ok(instruction.includes(chineseExplanations ? "Chinese explanation ON" : "Chinese explanation OFF"));
    assert.equal(instruction.includes("Both sections are required"), englishAnswers && chineseExplanations);
    assert.ok(instruction.includes("Language choices do not reduce teaching depth"));
    assert.ok(instruction.includes("English answer ON does not mean answer-only"));
    if (englishAnswers && chineseExplanations) {
      assert.ok(instruction.includes("teach first in 中文讲解"));
      assert.ok(instruction.includes("each part's Chinese teaching explanation"));
    }
    assert.ok(!instruction.includes("old default toggles"));
  }
  assert.match(summary({ englishAnswers: true, chineseExplanations: true }), /英文作答.*中文讲解/);
});

test("explicit/custom requests have clear precedence without treating the input language as an override", () => {
  const instruction = buildInstruction({ englishAnswers: true, chineseExplanations: true, customInstruction: "Only Chinese for this course" });
  assert.ok(instruction.includes("latest EXPLICIT language/format request"));
  assert.ok(instruction.includes("A question merely written in Chinese"));
  assert.ok(instruction.includes("overrides conflicting checkbox defaults"));
  assert.ok(instruction.includes("Only Chinese for this course"));
  assert.ok(instruction.includes("withholds the final answer until permitted"));
  assert.equal(normalize({ englishAnswers: "false" }).englishAnswers, false);
  assert.equal(normalize(null).englishTerms, true);
});

test("rapid edits save serially and a send-time flush waits for the newest draft", async () => {
  const starts = [], releases = [], statuses = [];
  const saver = createSaver({ initial: {}, onChange: (state) => statuses.push(state.status), save: (value) => {
    starts.push(value);
    return new Promise((resolve) => releases.push(() => resolve(value)));
  } });
  saver.setDraft({ englishAnswers: true });
  const saving = saver.flush();
  saver.setDraft({ englishAnswers: true, chineseExplanations: true });
  const sending = saver.flush();
  assert.equal(starts.length, 1);
  releases[0]();
  await Promise.resolve();
  assert.equal(starts.length, 2);
  assert.equal(starts[1].chineseExplanations, true);
  assert.equal(saver.snapshot().status, "saving");
  releases[1]();
  await Promise.all([saving, sending]);
  assert.equal(saver.snapshot().status, "saved");
  assert.equal(saver.snapshot().dirty, false);
  assert.ok(statuses.includes("unsaved") && statuses.includes("saving"));
});

test("save failures retain the unsaved draft and permit an explicit retry", async () => {
  let failed = true;
  const saver = createSaver({ initial: {}, save: async (value) => { if (failed) throw new Error("offline"); return value; } });
  saver.setDraft({ chineseExplanations: true });
  await assert.rejects(saver.flush(), /offline/);
  assert.equal(saver.snapshot().status, "error");
  assert.equal(saver.snapshot().draft.chineseExplanations, true);
  failed = false;
  await saver.flush();
  assert.equal(saver.snapshot().status, "saved");
});

test("disposing an account's saver prevents later edits or notifications from leaking into another account", async () => {
  let release;
  const changes = [];
  const saver = createSaver({ initial: {}, save: (value) => new Promise((resolve) => { release = () => resolve(value); }), onChange: (value) => changes.push(value) });
  saver.setDraft({ englishAnswers: true });
  const saving = saver.flush();
  saver.dispose();
  const count = changes.length;
  saver.setDraft({ chineseExplanations: true });
  release();
  await saving;
  assert.equal(changes.length, count);
  await assert.rejects(saver.flush(), /已取消/);
});
