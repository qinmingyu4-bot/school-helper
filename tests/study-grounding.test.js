const { test } = require("node:test");
const assert = require("node:assert/strict");
const { refersToVisual, missingStudyVisuals, missingVisualReply } = require("../lib/study-grounding");
const { selectStudyVisuals } = require("../lib/study-context");

test("missing-figure detection distinguishes a referenced original from drawing a new graph", () => {
  for (const text of ["根据下图求 x", "如图，求面积", "Find the slope from the graph", "Use Figure 2 to find x", "The triangle is shown below"]) assert(refersToVisual(text), text);
  for (const text of ["画出 y=x 的图像", "Draw a graph of y=x", "Explain integration", "Calculate 2+2"]) assert(!refersToVisual(text), text);
});

test("normal chat refuses omitted current images and unavailable named course originals", () => {
  const attachments = Array.from({ length: 9 }, (_, n) => ({ name: `q${n}.png`, kind: "image", dataUrl: `data:image/png;base64,${n}` }));
  const visuals = selectStudyVisuals(attachments, "解题", attachments);
  assert.deepEqual(missingStudyVisuals({ message: "解题", currentAttachments: attachments, attachments, visuals }), ["q0.png"]);
  assert.deepEqual(missingStudyVisuals({ message: "Explain exam.pdf", documents: [{ title: "exam.pdf", text: "OCR", hasSourcePdf: true }] }), ["exam.pdf"]);
  assert.deepEqual(missingStudyVisuals({ message: "Explain q1.png", attachments, visuals }), []);
});

test("text-only questions cannot borrow an unrelated diagram as their missing figure", () => {
  const paper = { name: "paper.txt", kind: "text", text: "Question 1: Find x from the graph." };
  assert.deepEqual(missingStudyVisuals({ message: "解题", currentAttachments: [paper], visuals: [{ name: "old-lecture.pdf", kind: "pdf" }] }), ["paper.txt"]);
  assert.deepEqual(missingStudyVisuals({ message: "如图求 x" }), ["题目中引用的图"]);
  assert.deepEqual(missingStudyVisuals({ message: "谢谢", attachments: [paper] }), []);
  assert.deepEqual(missingStudyVisuals({ message: "Draw a graph of y=x" }), []);
  assert.deepEqual(missingStudyVisuals({ message: "继续讲解 paper.txt。补充说明：直角三角形两条直角边分别为 3 和 4，求斜边。", attachments: [paper] }), []);
  assert.deepEqual(missingStudyVisuals({ message: "继续讲解 paper.txt。补充说明：  ", attachments: [paper] }), ["paper.txt"]);
  assert.match(missingVisualReply(["paper.txt"]), /题号、完整题干、图中标注和单位/);
});

test("course titles match their actual original file by identity, not by filename", () => {
  const documents = [{ id: "doc1", title: "期末试卷", hasSourcePdf: true }];
  const original = { kind: "pdf", name: "scan.pdf", documentId: "doc1", sourceName: "期末试卷", dataUrl: "data:application/pdf;base64," + Buffer.from("%PDF-1.7\nfixture").toString("base64") };
  const other = Array.from({ length: 9 }, (_, n) => ({ kind: "image", name: `old${n}.png`, dataUrl: `data:image/png;base64,${n}` }));
  const visuals = selectStudyVisuals([original, ...other], "请讲解期末试卷");
  assert(visuals.includes(original));
  assert.deepEqual(missingStudyVisuals({ message: "请讲解期末试卷", documents, visuals }), []);
  assert.deepEqual(missingStudyVisuals({ message: "请讲解期末试卷", documents, visuals: [{ ...original, documentId: "another-doc" }] }), ["期末试卷"]);
});
