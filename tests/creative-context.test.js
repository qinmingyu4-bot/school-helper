const assert = require("node:assert/strict");
const { test } = require("node:test");
const { courseContext, historicalImages, uniqueSources, revisionContext } = require("../lib/creative-context");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");

test("PDF context includes full course text, retained attachments and named old images without crossing accounts", async () => {
  const db = {
    getCourse: async (user, course) => user === "alice" && course === "math" ? { name: "Math" } : null,
    listDocuments: async () => [{ title: "lecture", text: "x".repeat(15000) + "LATE_COURSE_TEXT" }],
    listChatAttachments: async () => [{ kind: "text", name: "old-notes.txt", text: "OLD_ATTACHMENT_TEXT" }, ...Array.from({ length: 12 }, (_, i) => ({ name: `image-${i}.png`, kind: "image", dataUrl: `data:image/png;base64,${png.toString("base64")}` }))],
    listMessages: async () => [{ role: "user", content: "KEEP_GUIDANCE" }]
  };
  const result = await courseContext(db, "alice", "math", "继续用 image-0.png 修改", {});
  assert.match(result.text, /LATE_COURSE_TEXT/);
  assert.match(result.text, /OLD_ATTACHMENT_TEXT/);
  assert.match(result.text, /KEEP_GUIDANCE/);
  assert.equal(result.images.length, 8);
  assert.equal(result.images[0].name, "image-0.png");
  await assert.rejects(courseContext(db, "bob", "math", "read", {}), (error) => error.statusCode === 404);
  assert.equal(typeof await courseContext(db, "alice", "math", "read", null), "string");
});

test("historical images validate bytes and source merging deduplicates identical content safely", () => {
  const image = historicalImages([{ name: "../../image.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` }])[0];
  assert.equal(image.name, "image.png");
  assert.deepEqual(image.bytes, png);
  assert.throws(() => historicalImages([{ name: "fake.png", dataUrl: "data:image/png;base64,YQ==" }]));
  assert.throws(() => historicalImages([{ name: "fake.svg", dataUrl: "data:image/svg+xml;base64,YQ==" }]));
  assert.equal(uniqueSources([image, image]).length, 1);
  const files = uniqueSources([image, { ...image, bytes: Buffer.from("different") }]);
  assert.notEqual(files[0].name, files[1].name);
  const history = revisionContext({ format: "pdf", request: "x".repeat(1700) + "LATE_REQUIREMENT" });
  assert.match(history, /LATE_REQUIREMENT/);
  assert.ok(revisionContext({ format: "pdf", revisionContext: "x".repeat(40000), request: "LATEST" }).length < 36500);
});
