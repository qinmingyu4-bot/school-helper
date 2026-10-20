const { test } = require("node:test");
const assert = require("node:assert/strict");
const Model = require("../public/office-model");
const { calculator } = require("../lib/office-formulas");
const { contentRevisionSource, contentRevisionChanges, applyContentRevision } = require("../lib/office-content-revision");

const slidesSource = (model, editable = true) => contentRevisionSource("slides", { slides: [{ ...model.slides[0], id: "s0", editable, elements: model.slides[0].elements.map(({ src, ...el }, i) => ({ ...el, id: "e" + i })) }] });
const sheetsSource = (model, range = { from: "A1", to: "D10" }) => contentRevisionSource("sheets", { sheets: [{ ...model.sheets[0], id: "s0", range }] });

test("slide patches edit existing targets atomically while preserving images, identity, layout, other pages and undo source", () => {
  const model = Model.fresh("slides");
  model.slides.push(Model.blankSlide());
  model.slides[0].elements.push({ id: "image", type: "image", src: "data:image/png;base64,AAAA", x: 10, y: 80, w: 10, h: 10 });
  const source = slidesSource(model), original = structuredClone(model);
  const changes = contentRevisionChanges("slides", { changes: [{ slideId: "s0", elementId: "e0", set: { text: "Clearer conclusion", color: "#234567", size: 40 } }, { slideId: "s0", set: { notes: "Speaker notes", transition: "fade", duration: .6 } }] }, source);
  const next = applyContentRevision("slides", model, source, changes);
  assert.equal(next.slides.length, 2);
  assert.equal(next.slides[0].elements[0].text, "Clearer conclusion");
  assert.equal(next.slides[0].elements[0].id, original.slides[0].elements[0].id);
  assert.equal(next.slides[0].elements[0].x, original.slides[0].elements[0].x);
  assert.deepEqual(next.slides[0].elements.slice(1), original.slides[0].elements.slice(1));
  assert.deepEqual(next.slides[1], original.slides[1]);
  assert.deepEqual(model, original, "Applying a preview must not mutate the original snapshot");
  assert.equal(next.slides[0].transition, "fade");
  assert.equal(next.slides[0].notes, "Speaker notes");
});

test("slide revisions reject foreign targets, meta changes in element scope, unsafe fields, duplicate edits and overflowing geometry", () => {
  const model = Model.fresh("slides"), source = slidesSource(model, false);
  for (const change of [
    { slideId: "s1", elementId: "e0", set: { text: "Wrong page" } },
    { slideId: "s0", elementId: "e99", set: { text: "Wrong element" } },
    { slideId: "s0", set: { notes: "Outside selected element" } },
    { slideId: "s0", elementId: "e0", set: { src: "javascript:alert(1)" } },
    { slideId: "s0", elementId: "e0", set: { color: "red" } },
    { slideId: "s0", elementId: "e0", set: { x: 90 } },
    { slideId: "s0", elementId: "e0", set: { size: 100 } }
  ]) assert.throws(() => contentRevisionChanges("slides", { changes: [change] }, source), { statusCode: 502 });
  const same = { slideId: "s0", elementId: "e0", set: { text: model.slides[0].elements[0].text } };
  assert.deepEqual(contentRevisionChanges("slides", { changes: [same] }, source), []);
  assert.throws(() => contentRevisionChanges("slides", { changes: [same, same] }, source), { statusCode: 502 });
  assert.throws(() => contentRevisionChanges("slides", '{"changes":', source), { statusCode: 502 });
  assert.throws(() => contentRevisionSource("slides", { slides: null }), { statusCode: 400 });
});

test("sheet patches update multiple existing or empty cells, retain formulas/styles and recalculate cross-sheet dependencies", () => {
  const model = Model.fresh("sheets");
  model.sheets[0].cells = { A1: { value: "10", style: { color: "#123456", background: "#aabbcc" } }, A2: { value: "20", style: {} }, B1: { value: "=SUM(A1:A2)", style: {} } };
  const second = Model.fresh("sheets").sheets[0];
  second.name = "Summary"; second.cells.A1 = { value: "=Sheet1!B1*2", style: {} }; model.sheets.push(second);
  const original = structuredClone(model), source = sheetsSource(model);
  const changes = contentRevisionChanges("sheets", { changes: [{ sheetId: "s0", cell: "A1", set: { value: "15", style: { bold: true, format: "currency" } } }, { sheetId: "s0", cell: "C1", set: { value: "=SUM(A1:A2)" } }] }, source);
  const next = applyContentRevision("sheets", model, source, changes);
  assert.equal(calculator(next).display("Sheet1", "B1"), 35);
  assert.equal(calculator(next).display("Sheet1", "C1"), 35);
  assert.equal(calculator(next).display("Summary", "A1"), 70);
  assert.equal(next.sheets[0].cells.B1.value, "=SUM(A1:A2)");
  assert.deepEqual(next.sheets[0].cells.A1.style, { color: "#123456", background: "#aabbcc", bold: true, format: "currency" });
  assert.deepEqual(next.sheets[1], original.sheets[1]);
  assert.deepEqual(model, original);
  const cleared = applyContentRevision("sheets", next, sheetsSource(next), [{ sheetId: "s0", cell: "A1", set: { value: "" } }]);
  assert.equal(cleared.sheets[0].cells.A1.value, "");
  assert.deepEqual(cleared.sheets[0].cells.A1.style, next.sheets[0].cells.A1.style);
});

test("sheet edits are limited to the requested range and reject foreign ids, malformed values, unsafe formulas and duplicate writes", () => {
  const model = Model.fresh("sheets"), source = sheetsSource(model, { from: "B2", to: "C4" });
  for (const change of [
    { sheetId: "s1", cell: "B2", set: { value: "1" } },
    { sheetId: "s0", cell: "A2", set: { value: "1" } },
    { sheetId: "s0", cell: "D4", set: { value: "1" } },
    { sheetId: "s0", cell: "B0", set: { value: "1" } },
    { sheetId: "s0", cell: "B2", set: { value: 1 } },
    { sheetId: "s0", cell: "B2", set: { value: "=WEBSERVICE(\"https://example.test\")" } },
    { sheetId: "s0", cell: "B2", set: { value: "='[External.xlsx]Sheet1'!A1" } },
    { sheetId: "s0", cell: "B2", set: { style: { background: "url(x)" } } },
    { sheetId: "s0", cell: "B2", set: { style: { size: 50 } } },
    { sheetId: "s0", cell: "B2", set: { value: "x".repeat(4001) } }
  ]) assert.throws(() => contentRevisionChanges("sheets", { changes: [change] }, source), { statusCode: 502 });
  const same = { sheetId: "s0", cell: "B2", set: { value: "2" } };
  assert.throws(() => contentRevisionChanges("sheets", { changes: [same, same] }, source), { statusCode: 502 });
  assert.throws(() => sheetsSource(model, { from: "C4", to: "B2" }), { statusCode: 400 });
  assert.throws(() => sheetsSource(model, { from: "A1", to: "Z200" }), { statusCode: 400 });
  assert.deepEqual(contentRevisionChanges("sheets", { changes: [] }, source), []);
  assert.throws(() => contentRevisionSource("sheets", { sheets: [{ ...model.sheets[0], id: "s0", range: { from: "A1", to: "C10" }, cells: { A1: { value: "x".repeat(60001) } } }] }), { statusCode: 400 });
});
