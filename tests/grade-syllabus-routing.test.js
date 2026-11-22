"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const { createGradePlanner } = require("../lib/grade-planner-service");

const simpleText = "Quizzes 30%\nFinal Exam 70%\nBest eight quizzes out of ten count toward the grade.";
const weightQuote = "Quizzes 30%";
const dropQuote = "Best eight quizzes out of ten count toward the grade.";
const complexText = "Quizzes 30%\nFinal Exam 70%\nDrop the lowest quiz if every quiz was attempted.\nFor an approved absence, transfer the missed quiz weight to the Final Exam.";

function rules(drop = true, quote = weightQuote) {
  return { categories: [
    { name: "Quizzes", weight: 30, method: "equal", plannedCount: 10, items: [], evidence: quote,
      dropLowest: drop ? 2 : null, dropEvidence: drop ? dropQuote : "", sourceRefs: [{ documentId: "source", quote }] },
    { name: "Final Exam", weight: 70, method: "equal", plannedCount: 1, items: [], evidence: "Final Exam 70%",
      sourceRefs: [{ documentId: "source", quote: "Final Exam 70%" }] }
  ] };
}

function fixture({ text = simpleText, reply = () => rules(), existing = [], pdf } = {}) {
  const calls = [];
  const writes = [];
  const document = { id: "source", title: "Syllabus", text, updatedAt: "v1", hasSourcePdf: !!pdf };
  const db = {
    getCourse: async () => ({ id: "course" }),
    listDocuments: async () => [document],
    readMaterial: async () => pdf && { dataUrl: pdf, pages: 2 },
    getGradePlan: async () => ({ version: 0, categories: existing }),
    saveGradePlan: async (_user, _course, body) => {
      writes.push(body);
      return { ...body, version: 1 };
    }
  };
  const service = createGradePlanner({ db, apiKey: "fixture", model: "Sol", syllabusModel: "Luna",
    request: async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body.model);
      const result = reply(body.model);
      return result instanceof Response ? result : Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify(result) }] }] });
    }
  });
  const run = (route, autoSave = true, signal) => route === "saved"
    ? service.extractMaterials("user", "course", { documentIds: ["source"], autoSave, version: 0 }, signal)
    : service.recognize("user", "course", {
      kind: "syllabus", name: "Syllabus", mime: pdf ? "application/pdf" : "text/plain",
      dataUrl: pdf || "data:text/plain;base64," + Buffer.from(text).toString("base64"), autoSave, version: 0
    }, signal);
  return { run, calls, writes };
}

for (const route of ["upload", "saved"]) {
  test(`${route}: a grounded weight and top-eight rule saves after exactly one Luna request`, async () => {
    const f = fixture();
    const result = await f.run(route);
    assert.deepEqual(f.calls, ["Luna"]);
    assert.equal(f.writes.length, 1);
    assert.equal(result.savedPlan.categories[0].dropLowest, 2);
  });

  test(`${route}: original conditional grading goes directly to Sol and stays in manual review`, async () => {
    // Even a Sol response that omits the condition must never auto-apply.
    const f = fixture({ text: complexText, reply: () => rules(false) });
    const result = await f.run(route);
    assert.deepEqual(f.calls, ["Sol"]);
    assert.equal(f.writes.length, 0);
    assert.equal(result.reviewReason.code, "unclear");
  });

  test(`${route}: missing drop or unsupported quotation gets one Sol retry`, async () => {
    for (const invalid of [rules(false), rules(true, "Quizzes 30% invented")]) {
      const f = fixture({ reply: model => model === "Luna" ? invalid : rules() });
      const result = await f.run(route);
      assert.deepEqual(f.calls, ["Luna", "Sol"]);
      assert.equal(f.writes.length, 1);
      assert.equal(result.savedPlan.categories[0].dropLowest, 2);
    }
  });

  test(`${route}: repeated omission, or a model flag for exceptional grading, requires manual review`, async () => {
    for (const reply of [() => rules(false), model => {
      const result = rules();
      if (model === "Luna") result.categories[0].specialRule = "Instructor exception needs clarification";
      return result;
    }]) {
      const f = fixture({ reply });
      const result = await f.run(route);
      assert.deepEqual(f.calls, ["Luna", "Sol"]);
      assert.equal(result.reviewReason.code, "unclear");
      assert.equal(f.writes.length, 0);
    }
  });

  test(`${route}: provider failure does not dispatch Sol or write grades`, async () => {
    const f = fixture({ reply: () => new Response("", { status: 429 }) });
    await assert.rejects(f.run(route), { statusCode: 502 });
    assert.deepEqual(f.calls, ["Luna"]);
    assert.equal(f.writes.length, 0);
  });

  test(`${route}: a conflict with existing rules is presented once without a second model request`, async () => {
    const existing = [{ id: "quiz", name: "Quizzes", weight: 50, method: "equal", items: [] }];
    const f = fixture({ existing });
    const result = await f.run(route);
    assert.deepEqual(f.calls, ["Luna"]);
    assert.equal(result.reviewReason.code, "conflict");
    assert.equal(f.writes.length, 0);
  });
}

test("a condition on an original PDF page hidden from extracted saved text routes to Sol", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage();
  simpleText.split("\n").forEach((line, index) => page.drawText(line, { x: 40, y: 700 - 24 * index, font }));
  pdf.addPage().drawText("For an approved absence, transfer the missed quiz weight to the Final Exam.", { x: 40, y: 700, font });
  const f = fixture({ pdf: await pdf.saveAsBase64({ dataUri: true, useObjectStreams: false }) });
  const result = await f.run("saved");
  assert.deepEqual(f.calls, ["Sol"]);
  assert.equal(result.reviewReason.code, "unclear");
  assert.equal(f.writes.length, 0);
});

test("a PDF page with no readable text requires Sol and manual review", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage();
  simpleText.split("\n").forEach((line, index) => page.drawText(line, { x: 40, y: 700 - 24 * index, font }));
  pdf.addPage().drawText("2", { x: 40, y: 40, font });
  const f = fixture({ pdf: await pdf.saveAsBase64({ dataUri: true, useObjectStreams: false }) });
  const result = await f.run("upload");
  assert.deepEqual(f.calls, ["Sol"]);
  assert.equal(result.reviewReason.code, "unclear");
  assert.equal(f.writes.length, 0);
});

test("a true quotation for Quizzes does not authorize dropping Final Exam scores", async () => {
  const f = fixture({ reply: model => {
    const result = rules();
    if (model === "Luna") {
      const [quiz, final] = result.categories;
      quiz.dropLowest = null;
      quiz.dropEvidence = "";
      Object.assign(final, { plannedCount: 10, dropLowest: 2, dropEvidence: dropQuote });
    }
    return result;
  }});
  const result = await f.run("upload");
  assert.deepEqual(f.calls, ["Luna", "Sol"]);
  assert.equal(result.savedPlan.categories[0].dropLowest, 2);
  assert.equal(result.savedPlan.categories[1].dropLowest, null);
});

test("an exactly quoted standalone no-drop note stays on Luna", async () => {
  const f = fixture({ text: simpleText + "\nNo Final Exam mark is dropped.", reply: () => {
    const result = rules();
    result.categories[1].specialRule = "No Final Exam mark is dropped.";
    return result;
  }});
  const result = await f.run("upload");
  assert.deepEqual(f.calls, ["Luna"]);
  assert.equal(result.savedPlan.categories[1].specialRule, "");
});
