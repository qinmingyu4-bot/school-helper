const assert = require("node:assert/strict");
const { test } = require("node:test");
const { render, isPreviewUrl } = require("../public/chat-attachments");

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
