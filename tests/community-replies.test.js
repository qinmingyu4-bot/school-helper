const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createController } = require("../public/community-replies");

function harness() {
  let user = { id: "alice" };
  const requests = [];
  const changed = [];
  const controller = createController({ getUser: () => user, onChange: (postId) => changed.push(postId),
    api: (route, options) => new Promise((resolve, reject) => requests.push({ route, options, resolve, reject })) });
  return { controller, requests, changed, setUser: (next) => { user = next; } };
}

test("reply loads preserve drafts, deduplicate older pages, and isolate threads", async () => {
  const { controller, requests } = harness();
  controller.thread("post").draft = "My unsent reply";
  const current = controller.load("post");
  requests[0].resolve({ replies: [{ id: "new", createdAt: "2026-10-26T12:00:00Z" }], nextBefore: "cursor" });
  await current;
  const older = controller.load("post", true);
  assert.match(requests[1].route, /before=cursor/);
  requests[1].resolve({ replies: [{ id: "old", createdAt: "2026-10-25T12:00:00Z" }, { id: "new", createdAt: "2026-10-26T12:00:00Z" }], nextBefore: null });
  await older;
  assert.deepEqual(controller.thread("post").replies.map((reply) => reply.id), ["old", "new"]);
  assert.equal(controller.thread("post").draft, "My unsent reply");
  assert.deepEqual(controller.thread("other").replies, []);
});

test("reply sending rejects empty drafts, prevents duplicate clicks and retains failed drafts", async () => {
  const { controller, requests } = harness();
  await controller.send("post");
  assert.equal(requests.length, 0);
  controller.thread("post").draft = "  Reply text  ";
  const failed = controller.send("post");
  await controller.send("post");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.body.content, "Reply text");
  requests[0].reject(new Error("Offline"));
  await failed;
  assert.equal(controller.thread("post").draft, "  Reply text  ");
  assert.equal(controller.thread("post").error, "Offline");
  const sent = controller.send("post");
  requests[1].resolve({ reply: { id: "sent", content: "Reply text", createdAt: "2026-10-26T12:00:00Z" } });
  await sent;
  assert.equal(controller.thread("post").draft, "");
  assert.equal(controller.thread("post").replies[0].id, "sent");
});

test("late reply reads and sends cannot update another account or reveal its drafts", async () => {
  const { controller, requests, changed, setUser } = harness();
  controller.thread("post").draft = "Alice private draft";
  const read = controller.load("read");
  const send = controller.send("post");
  setUser({ id: "bob" });
  assert.equal(controller.thread("post").draft, "");
  const before = changed.length;
  requests[0].resolve({ replies: [{ id: "alice-read" }], nextBefore: null });
  requests[1].resolve({ reply: { id: "alice-send" } });
  await Promise.all([read, send]);
  assert.deepEqual(controller.thread("post").replies, []);
  assert.deepEqual(controller.thread("read").replies, []);
  assert.equal(changed.length, before);
});
