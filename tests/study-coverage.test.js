const { test } = require("node:test");
const assert = require("node:assert/strict");
const { questionOutline, buildExerciseCoverage } = require("../lib/study-coverage");
const { selectAiModel } = require("../lib/ai-routing");
const { buildMaterialContext, selectStudyVisuals } = require("../lib/study-context");
const paper = Array.from({ length: 6 }, (_, n) => `${n + 1}. Exercise statement\n(a) First part\n(b) Second part\n(\nc) Third part\n(d) Last part`).join("\n");

test("inventory identifies all six numbered problems and split-line subparts without treating page numbers as questions", () => {
  const outline = questionOutline("2023\n2\n" + paper + "\n11\nSTOP");
  assert.deepEqual(outline, Array.from({ length: 6 }, (_, n) => ({ number: n + 1, parts: ["a", "b", "c", "d"] })));
  assert.deepEqual(questionOutline("2023\n2\n11\nSome paragraphs without numbered questions"), []);
  assert.equal(questionOutline("第1题：解释函数\n(a) 定义\n第2题：计算导数\n(a) 推导").length, 2);
  assert.equal(questionOutline("question 1: Explain\n(a) First\nquestion 2: Solve\n(b) Last").length, 2);
});

test("coverage focuses on the new or explicitly named file instead of unrelated course problems", () => {
  const old = { name: "old.pdf", kind: "pdf", text: paper.replaceAll("Exercise", "Old") }, fresh = { name: "new.pdf", kind: "pdf", text: paper };
  assert.deepEqual(buildExerciseCoverage({ documents: [{ title: "Notes", text: paper }], attachments: [old, fresh], currentAttachments: [fresh] }).map(x => x.source), ["new.pdf"]);
  assert.deepEqual(buildExerciseCoverage({ attachments: [old, fresh], message: "Explain old.pdf" }).map(x => x.source), ["old.pdf"]);
  assert.deepEqual(buildExerciseCoverage({ attachments: [old, fresh], message: "Continue" }).map(x => x.source), ["new.pdf"]);
});

test("short PDF problem sets and retained course exercises use the complex model for tutoring, with routine and nonacademic requests preserved", () => {
  const models = { simpleModel: "Luna", complexModel: "Sol" }, attachment = { kind: "pdf", name: "paper.pdf", text: paper };
  const message = "请带着我学习这部分内容，按概念、例子、检查理解的顺序来。";
  assert(paper.length < 9000);
  assert.equal(selectAiModel({ mode: "guided", message, attachments: [attachment] }, models), "Sol");
  assert.equal(selectAiModel({ mode: "guided", message, savedAttachments: [attachment] }, models), "Sol");
  assert.equal(selectAiModel({ mode: "guided", message: "teach me", documents: [{ text: paper }] }, models), "Sol");
  assert.equal(selectAiModel({ mode: "guided", message: "谢谢", savedAttachments: [attachment] }, models), "Luna");
  assert.equal(selectAiModel({ mode: "guided", message: "describe the receipt", attachments: [{ kind: "pdf", name: "receipt.pdf", text: "Purchased two pencils" }] }, models), "Luna");
});

test("new uploads retain complete text even when older background sources exceed the retrieval budget", () => {
  const fresh = { kind: "pdf", name: "current.pdf", text: paper + "\nFINAL_SUBPART_MARKER" };
  const context = buildMaterialContext({ documents: [{ title: "Background", text: "background ".repeat(40000) }], attachments: [fresh], currentAttachments: [fresh], message: "请带着我学习这部分内容", budget: 6000 });
  assert(context.includes("FINAL_SUBPART_MARKER"));
  assert(context.includes(paper));
  assert(context.length < 6500);
});

test("native PDF selection prioritizes new/named originals, deduplicates bytes and rejects remote or malformed PDF inputs", () => {
  const pdf = { kind: "pdf", name: "paper.pdf", dataUrl: "data:application/pdf;base64," + Buffer.from("%PDF-1.7\nfixture").toString("base64") };
  const images = Array.from({ length: 10 }, (_, n) => ({ kind: "image", name: `image-${n}.png`, dataUrl: "data:image/png;base64," + n }));
  assert(selectStudyVisuals([pdf, ...images], "explain paper.pdf").includes(pdf));
  assert(selectStudyVisuals([pdf, ...images], "teach me", [pdf]).includes(pdf));
  assert.equal(selectStudyVisuals([pdf, structuredClone(pdf)], "teach me").length, 1);
  assert.equal(selectStudyVisuals([pdf, ...images], "teach me", [pdf]).length, 8);
  assert.deepEqual(selectStudyVisuals([{ kind: "pdf", name: "x.pdf", dataUrl: "https://example.test/private.pdf" }, { ...pdf, dataUrl: "data:application/pdf;base64,not-pdf" }], "read it"), []);
});
