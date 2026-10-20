const { test } = require("node:test");
const assert = require("node:assert/strict");
const { revisionBlocks, revisionEdits } = require("../lib/office-revision");

test("document revision accepts only bounded, identified source paragraphs without silently truncating", () => {
  const blocks = [{ id: "b0", text: "观点与引用 😀" }, { id: "b1", text: "Second paragraph" }];
  assert.deepEqual(revisionBlocks(blocks), blocks);
  for (const input of [[], null, [{ id: "b0", text: " " }], [{ id: "x", text: "Text" }],
    [{ id: "b0", text: "a" }, { id: "b0", text: "b" }], [{ id: "b0", text: "a".repeat(20001) }]])
    assert.throws(() => revisionBlocks(input), { statusCode: 400 });
  assert.equal(revisionBlocks([{ id: "b0", text: "a".repeat(20000) }])[0].text.length, 20000);
});

test("AI revision validates target identity, duplicates, JSON and size, preserving unchanged blocks", () => {
  const blocks = [{ id: "b0", text: "Original" }, { id: "b1", text: "Keep this" }];
  const multiline = [{ id: "b0", text: "Revised\ntext" }];
  assert.deepEqual(revisionEdits("```json\n" + JSON.stringify({ edits: multiline }) + "\n```", blocks), multiline);
  assert.deepEqual(revisionEdits(JSON.stringify({ edits: [{ id: "b1", text: "Keep this" }] }), blocks), []);
  assert.deepEqual(revisionEdits('{"edits":[]}', blocks), []);
  assert.deepEqual(revisionEdits('{"edits":[{"id":"b0","text":""}]}', blocks), [{ id: "b0", text: "" }]);
  for (const plan of [null, {}, { edits: [{ id: "b9", text: "New" }] },
    { edits: [{ id: "b0", text: "a" }, { id: "b0", text: "b" }] },
    { edits: [{ id: "b0", text: 7 }] }, { edits: [{ id: "b0", text: "a".repeat(30001) }] }])
    assert.throws(() => revisionEdits(JSON.stringify(plan), blocks), { statusCode: 502 });
  assert.throws(() => revisionEdits("Truncated JSON", blocks), { statusCode: 502 });
});
