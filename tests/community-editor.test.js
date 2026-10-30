const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createController } = require("../public/community-editor");
function harness() {
  let user = { id: "alice" };
  const requests = [], saved = [], changes = [];
  const controller = createController({ api: (route, options) => new Promise((resolve, reject) => requests.push({ route, options, resolve, reject })),
    getUser: () => user, getDefaults: () => ({ school: "My school", major: "Economics" }), onChange: () => changes.push(1), onSaved: (post) => saved.push(post) });
  const post = { id: "post", mine: true, topic: "Original", content: "Original content", anonymous: true, channels: [{ type: "all", label: "全部社区" }, { type: "school", label: "Original school" }], editRevision: 2 };
  return { controller, requests, saved, changes, post, setUser: (next) => { user = next; } };
}
test("editor prefills original destinations and sends one versioned update with retained anonymity", async () => {
  const { controller, requests, saved, post } = harness();
  controller.start(post);
  assert.equal(controller.snapshot().values.school, "Original school");
  assert.equal(controller.snapshot().values.major, "Economics");
  controller.set("channels", ["all", "major"]); controller.set("content", "Updated content");
  const save = controller.save(); await controller.save();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, "PATCH");
  assert.deepEqual(requests[0].options.body.channels, [{ type: "all" }, { type: "major", value: "Economics" }]);
  assert.equal(requests[0].options.body.anonymous, true);
  assert.equal(requests[0].options.body.editRevision, 2);
  controller.set("content", "Cannot change while saving");
  assert.equal(controller.snapshot().content, "Updated content");
  requests[0].resolve({ post: { ...post, content: "Updated content" } }); await save;
  assert.equal(saved.length, 1); assert.equal(controller.snapshot(), null);
});
test("failed edits retain every field and invalid empty selections never send", async () => {
  const { controller, requests, post } = harness(); controller.start(post);
  controller.set("channels", []); await controller.save(); assert.equal(requests.length, 0);
  controller.set("channels", ["major"]); controller.set("content", "Unsent updated content");
  const pending = controller.save(); requests[0].reject(new Error("帖子已在其他页面修改")); await pending;
  assert.equal(controller.snapshot().content, "Unsent updated content");
  assert.deepEqual(controller.snapshot().channels, ["major"]);
  assert.equal(controller.snapshot().saving, false);
  assert.match(controller.snapshot().error, /其他页面/);
  controller.cancel(); assert.equal(controller.snapshot(), null);
});
test("account switches clear edit drafts and ignore late saves", async () => {
  const { controller, requests, saved, changes, post, setUser } = harness(); controller.start(post);
  const pending = controller.save(); setUser({ id: "bob" });
  assert.equal(controller.snapshot(), null); const count = changes.length;
  requests[0].resolve({ post }); await pending;
  assert.equal(saved.length, 0); assert.equal(changes.length, count);
  assert.throws(() => controller.start({ ...post, mine: false }), /只能编辑/);
});
