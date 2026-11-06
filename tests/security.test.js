const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { hashPassword, verifyPassword, parseCookies } = require("../lib/security");

test("password work yields to other requests and preserves the existing scrypt format", async () => {
  const password = "Long-Existing-Password-2026!", salt = "0123456789abcdef0123456789abcdef";
  const legacy = `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
  let responsive = false;
  const turn = new Promise((resolve) => setImmediate(() => { responsive = true; resolve(); }));
  const work = verifyPassword(password, legacy);
  assert.ok(work instanceof Promise, "password derivation must not block the request thread");
  await turn;
  assert.equal(responsive, true);
  assert.equal(await work, true);
  assert.equal(await verifyPassword("wrong", legacy), false);
  const stored = await hashPassword(password);
  assert.match(stored, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.equal(await verifyPassword(password, stored), true);
  assert.notEqual(stored, await hashPassword(password));
});

test("malformed login credentials fail closed without invoking expensive work or throwing", async () => {
  const stored = await hashPassword("Valid-Password-2026!");
  for (const input of [undefined, null, {}, [], 42, true, "", "x".repeat(1025)]) {
    assert.equal(await verifyPassword(input, stored), false);
  }
  for (const stored of [null, "", "salt", "salt:not-hex", "salt:ab"]) assert.equal(await verifyPassword("password", stored), false);
});

test("a malformed cookie cannot break login or hide a valid session cookie", () => {
  assert.equal(parseCookies("analytics=%ZZ; sb_session=valid%2Ftoken").sb_session, "valid/token");
  assert.equal(parseCookies("sb_session=%E0%A4%A; theme=dark").sb_session, undefined);
  assert.equal(parseCookies("sb_session=%E0%A4%A; theme=dark").theme, "dark");
  assert.equal(Object.getPrototypeOf(parseCookies("__proto__=bad; constructor=bad")), null);
});

test("password bursts have bounded concurrency and queue capacity and recover afterwards", async () => {
  const stored = await hashPassword("Queue-Password-2026!");
  let turns = 0;
  const heartbeat = setInterval(() => turns++, 1);
  const results = await Promise.allSettled(Array.from({ length: 35 }, () => verifyPassword("Queue-Password-2026!", stored)));
  clearInterval(heartbeat);
  assert.equal(results.filter((item) => item.status === "fulfilled" && item.value).length, 34);
  const rejected = results.filter((item) => item.status === "rejected");
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.statusCode, 503);
  assert.ok(turns > 0, "unrelated event-loop work continues during the burst");
  assert.equal(await verifyPassword("Queue-Password-2026!", stored), true);
});
