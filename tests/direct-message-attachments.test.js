const assert = require("node:assert/strict");
const { test } = require("node:test");
const view = require("../public/direct-message-attachments");
const server = require("../lib/direct-message-attachments");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1cAAAAASUVORK5CYII=", "base64");
const upload = (bytes, fileName = "notes.txt", mime = "text/plain") => ({ fileName, fileData: `data:${mime};base64,${bytes.toString("base64")}` });

test("direct attachments preserve bytes, derive image metadata and download active formats as files", () => {
  const normalized = server.normalize([upload(png, "截图.png", "image/png"), upload(Buffer.from("<script>bad()</script>"), "../page.html", "text/html")]);
  assert.equal(normalized[0].kind, "image"); assert.equal(normalized[0].width, 1); assert.equal(normalized[0].mime, "image/png");
  assert.equal(normalized[0].size, png.length); assert.deepEqual(Buffer.from(normalized[0].base64, "base64"), png);
  assert.equal(normalized[1].kind, "file"); assert.equal(normalized[1].mime, "application/octet-stream");
  assert.ok(!normalized[1].name.includes("/"));
  assert.equal(server.normalize([upload(Buffer.from('<svg onload="bad()"/>'), "icon.svg", "image/svg+xml")])[0].kind, "file");
  const meta = server.metadata("mate_chat", "dm_message", normalized);
  assert.ok(meta.every((item) => !item.base64 && view.isUrl(item.url)));
});

test("invalid data, forged sizes, excess counts and decoded size limits are enforced", () => {
  for (const input of [null, {}, [null], [upload(Buffer.alloc(0))], [{ fileData: "https://evil.example/a" }], [{ fileData: "data:text/plain;base64,AAA=".replace("AAA=", "AA==AA==") }], [upload(Buffer.from("fake"), "photo.png", "image/png")], Array.from({ length: 7 }, () => upload(Buffer.from("x")))]) {
    assert.throws(() => server.normalize(input), { statusCode: 400 });
  }
  const large = upload(Buffer.alloc(view.fileBytes + 1)); large.fileSize = 1;
  assert.throws(() => server.normalize([large]), { statusCode: 413 });
  const chunk = upload(Buffer.alloc(11 * 1024 * 1024));
  assert.throws(() => server.normalize([chunk, chunk]), { statusCode: 413 });
  assert.deepEqual(server.normalize(undefined), []);
});

test("only private direct attachment URLs render previews and downloadable cards; filenames are escaped", () => {
  const url = "/api/classmates/mate_chat/attachments/dm_msg?index=0";
  const html = view.render([{ url, name: '<img onerror="bad()">.png', size: 12, kind: "image", width: 1, height: 1 }]);
  assert.ok(html.includes("data-action=\"view-chat-image\"")); assert.ok(html.includes("&amp;download=1"));
  assert.ok(html.includes("&lt;img")); assert.ok(!html.includes('<img onerror="bad()">'));
  for (const unsafe of ["javascript:alert(1)", "//evil.test/a", "https://evil.test/a", "data:image/png;base64,AA==", url + '" onclick="bad()', url + "&download=1"]) {
    assert.equal(view.isUrl(unsafe), false); assert.ok(!view.render([{ url: unsafe, kind: "image" }]).includes("<img"));
  }
});

test("file selection validates the whole batch before replacing a retained draft", () => {
  const saved = [{ name: "notes.txt", size: 10, lastModified: 1 }];
  assert.equal(view.addFiles(saved, [saved[0]]).length, 1);
  for (const incoming of [[{ name: "big.zip", size: view.fileBytes + 1 }], [{ name: "empty.txt", size: 0 }], Array.from({ length: 6 }, (_, index) => ({ name: String(index), size: 1 }))]) assert.throws(() => view.addFiles(saved, incoming));
  assert.equal(saved.length, 1);
});

test("attachment drafts isolate chats/accounts, retain retry identities and clear only delivered files", () => {
  let userId = "alice", chatId = "one", sequence = 0;
  const revoked = [];
  const drafts = view.createDrafts({ userId: () => userId, chatId: () => chatId, createId: () => `request-${++sequence}`, createUrl: (file) => `blob:test/${file.name}`, revokeUrl: (url) => revoked.push(url) });
  const first = { name: "one.png", type: "image/png", size: 10 }, next = { name: "two.txt", size: 11 };
  drafts.add([first]); drafts.preview(first);
  const snapshot = drafts.snapshot("Hello");
  assert.equal(drafts.snapshot("Hello"), snapshot, "failed delivery can retry the same identity");
  drafts.add([next]); drafts.sent(snapshot);
  assert.deepEqual(drafts.files(), [next]); assert.deepEqual(revoked, ["blob:test/one.png"]);
  chatId = "two"; assert.deepEqual(drafts.files(), []); drafts.add([first]); drafts.preview(first);
  chatId = "one"; assert.deepEqual(drafts.files(), [next]);
  const changed = drafts.snapshot("Other text"); assert.notEqual(changed.clientId, snapshot.clientId);
  userId = "bob"; assert.deepEqual(drafts.files(), []); drafts.sent(changed); assert.deepEqual(drafts.files(), []);
  assert.equal(revoked.length, 2);
});
