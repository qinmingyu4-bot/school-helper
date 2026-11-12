const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../public/grade-planner-model");
const recognition = require("../lib/grade-preview-recognition");
const localOcr = require("../lib/grade-preview-local-ocr");
const clone = (value) => JSON.parse(JSON.stringify(value));
function example() {
  return { categories: [
    { id: "hw", name: "Homework", weight: 20, method: "equal", plannedCount: 10, items: Array.from({ length: 10 }, (_, index) => ({ id: `h${index}`, name: `Homework ${index + 1}`, max: 20, score: index < 2 ? 18 : null, status: index < 2 ? "graded" : "pending" })) },
    { id: "mid", name: "Midterm", weight: 30, method: "equal", plannedCount: 1, items: [{ id: "m", name: "Midterm", score: 90, max: 100, status: "graded" }] },
    { id: "final", name: "Final", weight: 50, method: "equal", plannedCount: 1, items: [{ id: "f", name: "Final", score: null, max: 100, status: "pending" }] }
  ] };
}

test("partial categories count only each graded assessment's true overall weight", () => {
  const s = G.summarize(example());
  assert.equal(s.known, true);
  assert.equal(s.categories[0].average, 90);
  assert.equal(s.categories[0].earned, 3.6);
  assert.equal(s.earned, 30.6);
  assert.equal(s.gradedWeight, 34);
  assert.equal(s.average, 90);
  assert.equal(s.remaining, 66);
});
test("pending, zero and excluded assessments have distinct effects", () => {
  const c = example();
  c.categories[0].items[2].score = 0;
  c.categories[0].items[2].status = "graded";
  assert.equal(G.summarize(c).remaining, 64);
  assert.equal(G.summarize(c).earned, 30.6);
  c.categories[0].items[2].status = "excluded";
  assert.ok(Math.abs(G.summarize(c).categories[0].earned - 4) < 1e-9);
  assert.equal(G.isGraded({ score: 0, max: 100, status: "graded" }), true);
});
test("equal weighting and points weighting differ for unequal maximum scores", () => {
  const c = { id: "a", name: "A", weight: 100, plannedCount: 2, method: "equal", items: [{ id: "x", score: 8, max: 10, status: "graded" }, { id: "y", score: 18, max: 20, status: "graded" }] };
  assert.equal(G.categorySummary(c).average, 85);
  c.method = "points";
  assert.ok(Math.abs(G.categorySummary(c).average - 26 / 30 * 100) < 1e-9);
});
test("unknown plans, unknown points maxima and special rules pause precise totals", () => {
  for (const change of [c => c.plannedCount = null, c => { c.method = "points"; c.items[3].max = null; }, c => c.specialRule = "Drop lowest score"]) {
    const course = example(); change(course.categories[0]);
    assert.equal(G.summarize(course).known, false);
    assert.equal(G.forecast(course), null);
    assert.equal(G.required(course, 85), null);
  }
  const c = example(); c.categories[0].weight = 21;
  assert.equal(G.summarize(c).known, false);
});
test("forward and inverse scenarios agree without mutating recorded grades", () => {
  const c = example(); const before = clone(c);
  assert.equal(G.forecast(c, { hw: 85 }, "f", 80), 84.2);
  const needed = G.required(c, 90, { hw: 85 }, "f");
  assert.ok(Math.abs(needed.needed - 91.6) < 1e-9);
  assert.equal(G.forecast(c, { hw: 85 }, "f", needed.needed), 90);
  assert.equal(G.required(c, 100, { hw: 85 }, "f").status, "unreachable");
  assert.equal(G.required(c, 40, { hw: 85 }, "f").status, "achieved");
  const all = G.required(c, 85, {}, "all");
  assert.equal(G.forecast(c, {}, "all", all.needed), 85);
  assert.deepEqual(c, before);
});
test("all graded courses handle targets without dividing by zero", () => {
  const c = example();
  for (const category of c.categories) for (const item of category.items) { item.score = item.max; item.status = "graded"; }
  assert.equal(G.required(c, 90).status, "achieved");
  assert.equal(G.required(c, 90).needed, null);
  assert.equal(G.summarize(c).earned, 100);
});

test("linked controls can take over from either side while preserving recorded grades", () => {
  const c = example(); const before = clone(c);
  const settings = { focus:"f", assumptions:{ hw:85 } };
  const forward = G.linkedForecast(c, { ...settings, driver:"assessment", score:80 });
  assert.equal(forward.total, 84.2);
  const inverse = G.linkedForecast(c, { ...settings, driver:"total", goal:90 });
  assert.ok(Math.abs(inverse.score - 91.6) < 1e-9);
  assert.equal(inverse.total, 90);
  const resumed = G.linkedForecast(c, { ...settings, driver:"assessment", score:75 });
  assert.equal(resumed.total, 81.7);
  assert.deepEqual(c, before);
});
test("linked controls keep unreachable targets distinct from the highest actual grade", () => {
  const c = example();
  const high = G.linkedForecast(c, { focus:"f", assumptions:{hw:85}, driver:"total", goal:100 });
  assert.equal(high.status, "unreachable");
  assert.ok(high.score > 100);
  assert.equal(high.total, 100);
  assert.equal(high.actual, 94.2);
  const low = G.linkedForecast(c, { focus:"f", assumptions:{hw:85}, driver:"total", goal:20 });
  assert.equal(low.status, "achieved");
  assert.equal(low.score, 0);
  assert.equal(low.actual, 44.2);
  assert.equal(low.total, 20);
});
test("linked controls support all remaining assessments and reject invalid direct input", () => {
  const c = example();
  const value = G.linkedForecast(c, { focus:"all", driver:"total", goal:85 });
  assert.equal(value.actual, 85);
  assert.equal(G.linkedForecast(c, { driver:"assessment", score:-1 }), null);
  assert.equal(G.linkedForecast(c, { driver:"total", goal:101 }), null);
  assert.equal(G.linkedForecast(c, { focus:"missing" }), null);
});
test("screenshot reviews require valid unique destinations and commit atomically", () => {
  const c = example(); const before = clone(c);
  const valid = { selected: true, categoryId: "hw", itemId: "h2", score: 18, max: 20 };
  const result = G.applyReviews(c, [valid]);
  assert.equal(result.categories[0].items[2].score, 18);
  assert.deepEqual(c, before);
  assert.throws(() => G.applyReviews(c, [valid, { ...valid, score: 19 }]), /target/);
  assert.throws(() => G.applyReviews(c, [valid, { ...valid, itemId: "h3", score: 21 }]), /grade/);
  assert.throws(() => G.applyReviews(c, [{ ...valid, itemId: "missing" }]), /target/);
  assert.throws(() => G.applyReviews(c, [{ ...valid, selected: false }]), /empty/);
  assert.deepEqual(c, before);
});
test("recognition retains missing values instead of manufacturing grades or plans", () => {
  const result = recognition.parseRecognition("grades", JSON.stringify({ rows: [{ name: "Quiz 2", score: null, max: null, evidence: "Pending" }, { name: "Quiz 3", score: 0, max: 10 }] }));
  assert.equal(result.rows[0].score, null);
  assert.equal(result.rows[0].max, null);
  assert.equal(result.rows[1].score, 0);
  const rules = recognition.parseRecognition("syllabus", JSON.stringify({ categories: [{ name: "Homework", weight: 20, method: "unknown", plannedCount: null, items: [], evidence: "Homework 20%" }] }));
  assert.equal(rules.categories[0].plannedCount, null);
  assert.equal(rules.categories[0].method, "unknown");
  assert.equal(rules.categories[0].specialRule, "");
  assert.equal(G.categorySummary(rules.categories[0]).known, false);
  assert.throws(() => recognition.parseRecognition("grades", "not JSON"));
});
test("upload validation checks actual bytes and keeps source input separate from instructions", () => {
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9N8AAAAASUVORK5CYII=";
  const file = recognition.upload({ kind: "grades", mime: "image/png", name: "quiz.png", dataUrl: `data:image/png;base64,${png}` });
  assert.equal(file.content.type, "input_image");
  assert.throws(() => recognition.upload({ kind: "grades", mime: "image/png", dataUrl: "data:image/png;base64,aGVsbG8=" }));
  assert.throws(() => recognition.upload({ kind: "grades", mime: "text/plain", dataUrl: "data:text/plain;base64,aGVsbG8=" }));
  const body = recognition.requestBody(file, "test-model");
  assert.equal(body.store, false);
  assert.match(body.instructions, /untrusted data/);
  assert.throws(() => recognition.responseText({ status: "incomplete", output: [] }));
});

test("local OCR aligns separated name and score columns without turning totals into assessments", () => {
  const lines = [
    { text: "Homework 5", x: .1, y: .8, height: .04 },
    { text: "18 / 20", x: .6, y: .802, height: .04 },
    { text: "Quiz 3", x: .1, y: .6, height: .04 },
    { text: "0 / 10", x: .6, y: .6, height: .04 },
    { text: "Quiz 4 90%", x: .1, y: .4, height: .04 },
    { text: "Overall 88 / 100", x: .1, y: .2, height: .04 },
    { text: "Quiz 5 pending", x: .1, y: .1, height: .04 }
  ];
  const rows = localOcr.extractRows(lines).rows;
  assert.equal(rows.length, 3);
  assert.equal(rows[0].name, "Homework 5");
  assert.equal(rows[0].score, 18);
  assert.equal(rows[1].score, 0);
  assert.equal(rows[2].max, 100);
  assert.equal(rows[2].score, 90);
});
