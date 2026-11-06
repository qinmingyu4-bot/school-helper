const assert = require("node:assert/strict");
const { test } = require("node:test");
const { clientAddress, createLoginAttempts } = require("../lib/login-attempts");

test("login failures expire without extending the window, normalize email, and isolate account/address pairs", () => {
  let time = 0;
  const limiter = createLoginAttempts({ now: () => time });
  for (let i = 0; i < 10; i++) {
    const attempt = limiter.begin("  OWNER@Example.test ", "192.0.2.1");
    assert.equal(attempt.allowed, true); attempt.finish("failure");
  }
  assert.deepEqual(limiter.begin("owner@example.test", "192.0.2.1"), { allowed: false, status: 429, retryAfter: 900 });
  for (const [email, address] of [["other@example.test", "192.0.2.1"], ["owner@example.test", "192.0.2.2"]]) {
    const attempt = limiter.begin(email, address); assert.equal(attempt.allowed, true); attempt.finish("success");
  }
  time = 899001;
  assert.equal(limiter.begin("owner@example.test", "192.0.2.1").retryAfter, 1);
  time = 900000;
  const recovered = limiter.begin("owner@example.test", "192.0.2.1");
  assert.equal(recovered.allowed, true); recovered.finish("success");
});

test("successful login clears failures; cancelled/system-error attempts are not charged", () => {
  const limiter = createLoginAttempts({ limit: 2 });
  for (let i = 0; i < 12; i++) {
    const attempt = limiter.begin("user", "ip"); assert.equal(attempt.allowed, true); attempt.finish(); attempt.finish("failure");
  }
  limiter.begin("user", "ip").finish("failure");
  limiter.begin("user", "ip").finish("success");
  limiter.begin("user", "ip").finish("failure");
  const next = limiter.begin("user", "ip"); assert.equal(next.allowed, true); next.finish("failure");
  assert.equal(limiter.begin("user", "ip").status, 429);
});

test("pending work reserves the budget and settling out of order cannot erase concurrent failures", () => {
  const limiter = createLoginAttempts({ limit: 2 });
  const a = limiter.begin("user", "ip"), b = limiter.begin("user", "ip");
  assert.equal(limiter.begin("user", "ip").retryAfter, 1);
  a.finish("success");
  const c = limiter.begin("user", "ip"); assert.equal(c.allowed, true);
  b.finish("failure"); c.finish("failure"); a.finish("success");
  assert.equal(limiter.begin("user", "ip").status, 429);
});

test("bounded storage retains live penalties, reclaims expired entries and does not lose pending work", () => {
  let time = 0;
  const limiter = createLoginAttempts({ limit: 1, windowMs: 1000, maxEntries: 2, now: () => time });
  limiter.begin("blocked", "ip").finish("failure");
  const pending = limiter.begin("pending", "ip");
  for (let i = 0; i < 20; i++) assert.equal(limiter.begin(`new${i}`, "ip").status, 503);
  assert.equal(limiter.begin("blocked", "ip").status, 429);
  time = 1000;
  const fresh = limiter.begin("fresh", "ip"); assert.equal(fresh.allowed, true); fresh.finish("success");
  assert.equal(limiter.begin("pending", "ip").status, 429);
  pending.finish("failure");
  assert.equal(limiter.begin("pending", "ip").retryAfter, 1);
  time = 2000;
  assert.equal(limiter.begin("pending", "ip").allowed, true);
});

test("only a loopback proxy can supply X-Real-IP; equivalent IP spellings share a key", () => {
  const address = (peer, real, forwarded = "198.51.100.123") => clientAddress({ socket: { remoteAddress: peer }, headers: { "x-real-ip": real, "x-forwarded-for": forwarded } });
  assert.equal(address("203.0.113.5", "192.0.2.1"), "203.0.113.5");
  assert.equal(address("::ffff:203.0.113.5", "192.0.2.1"), "203.0.113.5");
  for (const peer of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
    assert.equal(address(peer, "::ffff:192.0.2.1"), "192.0.2.1");
    assert.equal(address(peer, "2001:0db8:0000:0000:0000:0000:0000:0001"), "2001:db8::1");
    for (const invalid of [undefined, ["192.0.2.1"], "192.0.2.1, 192.0.2.2", "not-an-ip", "fe80::1%eth0"]) {
      assert.ok(["127.0.0.1", "::1"].includes(address(peer, invalid)));
    }
  }
  assert.equal(clientAddress({ headers: { "x-real-ip": "192.0.2.1" } }), "unknown");
});
