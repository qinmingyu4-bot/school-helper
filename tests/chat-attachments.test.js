const assert = require("node:assert/strict");
const { test } = require("node:test");
const { render, isPreviewUrl, clipboardImages } = require("../public/chat-attachments");

test("uploaded image cards show a private preview with escaped filename and original-image action", () => {
  const url = "/api/courses/course_1/attachments/CHAT%23msg_1?index=0";
  const html = render([{ name: '题目<img src=x onerror="bad">.png', kind: "image", url }]);
  assert.ok(html.includes('data-action="view-chat-image"'));
  assert.ok(html.includes('loading="lazy"'));
  assert.ok(html.includes("题目&lt;img"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes(url));
  assert.ok(render([{ name: "syllabus.pdf", kind: "pdf" }]).includes("chat-file"));
});

test("image previews reject external, executable and raw data URLs", () => {
  for (const url of ["https://evil.test/photo.png", "//evil.test", "javascript:alert(1)", "data:image/svg+xml,<svg/>", '/api/courses/c/attachments/m?index=0" onclick="bad']) {
    assert.equal(isPreviewUrl(url), false);
    assert.ok(!render([{ name: "bad.png", kind: "image", url }]).includes("<img"));
  }
  assert.equal(isPreviewUrl("blob:http://localhost:3000/abc-123"), true);
  assert.equal(render([]), "");
});

test("screenshot clipboard items become byte-preserving files without duplicating the files list", async () => {
  const file = new File([Buffer.from("screenshot bytes")], "image.png", { type: "image/png" });
  const images = clipboardImages({ items: [{ kind: "string", type: "text/plain" }, { kind: "file", type: "image/png", getAsFile: () => file }], files: [file] });
  assert.equal(images.length, 1);
  assert.match(images[0].name, /^截图-\d+-\d+\.png$/);
  assert.equal(images[0].type, "image/png");
  assert.equal(Buffer.from(await images[0].arrayBuffer()).toString(), "screenshot bytes");
  const next = clipboardImages({ files: [file] })[0];
  assert.notEqual(images[0].name, next.name, "separate screenshot pastes must not be deduplicated as image.png");
});

test("clipboard fallback supports multiple named images and ignores text, HTML and unsupported files", () => {
  const photo = new File(["photo"], "lecture.jpg", { type: "image/jpeg" });
  const diagram = new File(["diagram"], "figure.webp", { type: "image/webp" });
  const unsafe = new File(["<svg/>"], "figure.svg", { type: "image/svg+xml" });
  const pdf = new File(["pdf"], "lecture.pdf", { type: "application/pdf" });
  assert.deepEqual(clipboardImages({ items: [{ kind: "file", type: "image/png", getAsFile: () => null }], files: [photo, diagram, unsafe, pdf] }).map((file) => file.name), ["lecture.jpg", "figure.webp"]);
  assert.deepEqual(clipboardImages({ items: [{ kind: "string", type: "text/html" }] }), []);
  assert.deepEqual(clipboardImages(null), []);
});
