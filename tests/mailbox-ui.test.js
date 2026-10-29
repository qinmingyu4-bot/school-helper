const { test } = require("node:test");
const assert = require("node:assert/strict");
const { create } = require("../public/mailbox-assistant");
const draft = { id: "draft-one", userId: "alice", provider: "gmail", generation: "generation", status: "pending", subject: '<img src=x onerror="alert(1)">', sender: "Professor", summary: "Learning notice", receivedAt: "2026-10-28T12:00:00Z", link: "https://mail.google.com/", items: [{ title: "Meeting", kind: "EVENT", date: "2026-11-16", time: "18:00", timeZone: "America/Toronto" }] };
const value = () => ({ connections: [{ provider: "gmail", configured: true, connected: true, email: "mail@example.test" }], drafts: [draft], csrfToken: "csrf", nextBefore: null });

test("mailbox UI escapes email text and retains reviewed fields through refreshed source data", async () => {
  const view = create({ api: async () => value(), getUser: () => ({ id: "alice" }), onChange() {}, notice() {} });
  await view.load();
  assert.match(view.html(), /&lt;img src=x/); assert.doesNotMatch(view.html(), /<img src=x/);
  const el = { dataset: { mailboxField: "time" }, value: "16:30", closest: (selector) => selector === "[data-mailbox-draft]" ? { dataset: { mailboxDraft: draft.id } } : selector === "[data-mailbox-index]" ? { dataset: { mailboxIndex: "0" } } : null };
  view.input({ target: el }); await view.load();
  assert.match(view.html(), /type="time" value="16:30"/);
  view.disconnected("gmail");
  assert.doesNotMatch(view.html(), /mail@example.test|Learning notice|data-mailbox-draft="draft-one"/);
});

test("late mailbox loads cannot cross accounts or restore an abandoned destination", async () => {
  let user = { id: "alice" }, resolve;
  const view = create({ api: () => new Promise((done) => { resolve = done; }), getUser: () => user, onChange() {}, notice() {} });
  const work = view.load(); user = { id: "bob" }; resolve(value()); await work;
  assert.doesNotMatch(view.html(), /mail@example.test|Learning notice/);
  let current = true;
  const another = view.load({ isCurrent: () => current }); current = false; resolve(value()); await another;
  assert.doesNotMatch(view.html(), /mail@example.test|Learning notice/);
});
