const { test } = require("node:test");
const assert = require("node:assert/strict");
const { items, filtered, preview } = require("../public/office-library");

test("libraries combine only the matching editable and generated files, preserving all jobs and dates", () => {
  const projects = [{ id: "d", kind: "docs", name: "Essay", updatedAt: "2026-11-20" }, { id: "s", kind: "sheets", name: "Budget" }];
  const jobs = [
    { id: "pdf", kind: "document", format: "pdf", status: "ready", updatedAt: "2026-11-21", files: [{ id: "f", extension: "pdf", name: "Report.pdf" }] },
    { id: "pending", kind: "document", format: "docx", request: "Work in progress", status: "generating" },
    { id: "failed", kind: "document", format: "docx", request: "Failed attempt", status: "failed" },
    { id: "excel", kind: "document", format: "xlsx", status: "ready" },
    { id: "slides", kind: "document", format: "pptx", status: "ready" },
    { id: "cheat", kind: "document", format: "pdf", cheatsheet: { paper: "A4" } },
    { id: "image", kind: "image", format: "png" },
  ];
  const docs = items("docs", projects, jobs);
  assert.deepEqual(docs.slice(0, 2).map(p => p.id), ["pdf", "d"]);
  assert.equal(docs.length, 4);
  assert.equal(docs[0].name, "Report.pdf");
  assert.equal(docs.find(p => p.id === "pending").status, "generating");
  assert.deepEqual(items("sheets", projects, jobs).map(p => p.id).sort(), ["excel", "s"]);
  assert.deepEqual(items("slides", projects, jobs).map(p => p.id), ["slides"]);
});

test("recoverable drafts replace their saved row; search and source filters retain draft access", () => {
  const rows = items("docs", [{ id: "d", kind: "docs", name: "Old name" }], [
    { id: "a", kind: "document", format: "docx", prompt: "Finance summary" },
  ], { id: "d", kind: "docs", name: "Finance draft" });
  assert.equal(rows.filter(p => p.id === "d").length, 1);
  assert.equal(rows[0].source, "draft");
  assert.equal(filtered(rows, " FINANCE ", "all").length, 2);
  assert.deepEqual(filtered(rows, "finance", "editor").map(p => p.id), ["d"]);
  assert.deepEqual(filtered(rows, "finance", "ai").map(p => p.id), ["a"]);
  assert.equal(filtered(rows, "missing", "all").length, 0);
  assert.equal(items("sheets", [], [], { id: "d", kind: "docs", name: "Draft" }).length, 0);
});

test("first-page thumbnails escape content and never embed remote images or HTML", () => {
  const model = { content: { type: "doc", content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Research <script>alert(1)</script>" }] },
    { type: "image", attrs: { src: "https://outside.test/private.png" } },
    { type: "paragraph", content: [{ type: "text", text: "Evidence & observations" }] },
  ] } };
  const result = preview("docs", model);
  assert.match(result, /Research &lt;script&gt;/);
  assert.match(result, /Evidence &amp; observations/);
  assert.doesNotMatch(result, /<script|https:\/\/outside|<iframe|foreignObject/);
  assert.match(preview("docs", { content: { type: "doc", content: [] } }), /<svg/);
  assert.equal(preview("docs", null), "");
});

test("sheet thumbnails use cell text without calculating formulas; slides use the first slide only", () => {
  const sheet = preview("sheets", { sheets: [{ cells: { A1: { value: "Budget" }, B2: { value: "=1+2" } } }] });
  assert.match(sheet, /Budget/); assert.match(sheet, /=1\+2/);
  const slides = preview("slides", { slides: [{ background: '#f0f5f4', elements: [
    { type: "text", text: "First slide", x: 5, y: 10, w: 80, h: 20, size: 36, color: '#123456' },
    { type: "image", src: 'javascript:alert(1)' },
  ] }, { elements: [{ type: "text", text: "Second slide" }] }] });
  assert.match(slides, /First slide/); assert.match(slides, /#f0f5f4/);
  assert.doesNotMatch(slides, /Second slide|javascript:/);
});

test("generated previews use ready PNG artifacts only", () => {
  const files = [{ id: "pdf", extension: "pdf" }, { id: "png", extension: "png" }];
  const [ready] = items("docs", [], [{ id: "a", kind: "document", format: "pdf", status: "ready", summary: "Summary", files }]);
  assert.equal(ready.preview.id, "png"); assert.equal(ready.summary, "Summary");
  const [failed] = items("docs", [], [{ id: "b", kind: "document", format: "pdf", status: "failed", files }]);
  assert.equal(failed.preview, null);
});
