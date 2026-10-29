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

test("learning notices lead the workspace and the account status opens mailbox settings", async () => {
  const view = create({ api: async () => value(), getUser: () => ({ id: "alice" }), onChange() {}, notice() {} });
  await view.load();
  const html = view.html('<textarea id="emailOriginal"></textarea><div id="toolOutput">Reply draft</div>');
  assert.match(html, /id="mailbox-reply-panel"[^>]*>.*id="emailOriginal"/s);
  assert.match(html.match(/<section id="mailbox-reply-panel"[^>]*>/)[0], /hidden/);
  assert.doesNotMatch(html.match(/<section id="mailbox-learning-panel"[^>]*>/)[0], /hidden/);
  assert.ok(html.indexOf('id="mailbox-learning-button"') < html.indexOf('id="mailbox-reply-button"'));
  const status = html.slice(html.indexOf('<button type="button" class="mailbox-account-strip"'), html.indexOf('<nav class="mailbox-sections"'));
  assert.match(status, /Gmail/); assert.match(status, /mail@example.test/); assert.match(status, /已绑定/);
  assert.match(status, /data-action="mailbox-settings"/);
  assert.match(status, /aria-label="邮箱绑定状态，前往邮箱授权设置"/);
  assert.doesNotMatch(status, /data-mailbox-connect|data-mailbox-unlink/);
  assert.doesNotMatch(html, /<details|mailbox-footnote|mailbox-manual/);
  const unbound = create({ api: async () => ({ connections: [{ provider: "gmail", configured: false, connected: false }, { provider: "outlook", configured: true, connected: false }], drafts: [] }), getUser: () => ({ id: "alice" }), onChange() {}, notice() {} });
  await unbound.load();
  assert.equal((unbound.html().match(/未绑定/g) || []).length, 2);
  assert.match(unbound.html(), /data-action="mailbox-settings"/);
  assert.doesNotMatch(unbound.html(), /授权接入准备中/);
});

test("view changes preserve notice edits and successful authorization selects learning notices", async () => {
  let user = { id: "alice" }, redraws = 0;
  const view = create({ api: async () => value(), getUser: () => user, onChange() { redraws++; }, notice() {} });
  await view.load();
  await view.action({ dataset: { action: "mailbox-view", view: "learning" } });
  assert.doesNotMatch(view.html().match(/<section id="mailbox-learning-panel"[^>]*>/)[0], /hidden/);
  const el = { dataset: { mailboxField: "time" }, value: "16:30", closest: (selector) => selector === "[data-mailbox-draft]" ? { dataset: { mailboxDraft: draft.id } } : selector === "[data-mailbox-index]" ? { dataset: { mailboxIndex: "0" } } : null };
  view.input({ target: el });
  await view.action({ dataset: { action: "mailbox-view", view: "reply" } });
  view.setBanner("Connected", { showInbox: true });
  assert.match(view.html(), /type="time" value="16:30"/);
  assert.doesNotMatch(view.html().match(/<section id="mailbox-learning-panel"[^>]*>/)[0], /hidden/);
  assert.equal(redraws, 2);
  user = { id: "bob" };
  assert.doesNotMatch(view.html().match(/<section id="mailbox-learning-panel"[^>]*>/)[0], /hidden/);
  assert.doesNotMatch(view.html(), /mail@example.test/);
});

test("learning-view sync targets only linked mailboxes and reports partial failures without losing notices", async () => {
  const calls = [], payload = { ...value(), connections: [
    { provider: "gmail", connected: true }, { provider: "outlook", connected: true }, { provider: "ignored", connected: false }
  ] };
  const view = create({ getUser: () => ({ id: "alice" }), onChange() {}, notice() {}, api: async (route, options) => {
    calls.push({ route, options });
    if (!options) return payload;
    if (route.includes("outlook")) throw new Error("Provider temporarily unavailable");
    return {};
  } });
  await view.load();
  const button = { dataset: { action: "mailbox-sync" }, disabled: false };
  await view.action(button);
  const writes = calls.filter((call) => call.options);
  assert.deepEqual(writes.map((call) => call.route).sort(), ["/api/mailbox/gmail/sync", "/api/mailbox/outlook/sync"]);
  assert.ok(writes.every((call) => call.options.body.userId === "alice" && call.options.headers["x-csrf-token"] === "csrf"));
  assert.equal(button.disabled, false);
  assert.match(view.html(), /部分邮箱已开始同步/);
  assert.match(view.html(), /Learning notice/);
});
