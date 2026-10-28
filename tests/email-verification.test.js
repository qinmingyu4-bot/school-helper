const assert = require("node:assert/strict");
const { test } = require("node:test");
const { emailPolicy, validEmail, createEmailVerification } = require("../lib/email-verification");

test("production email policy requires verification by default and never exposes codes", () => {
  assert.deepEqual(emailPolicy({ NODE_ENV: "production", ALLOW_EMAIL_CODE_FALLBACK: "true" }), { required: true, fallbackAllowed: false, ttlMs: 900000, resendSeconds: 60 });
  assert.equal(emailPolicy({ NODE_ENV: "test", ALLOW_EMAIL_CODE_FALLBACK: "true" }).fallbackAllowed, true);
  assert.equal(emailPolicy({ REQUIRE_EMAIL_VERIFICATION: "false" }).required, false);
  for (const value of ["NaN", "-1", "Infinity", "1000"]) assert.equal(emailPolicy({ EMAIL_CODE_TTL_MINUTES: value }).ttlMs, 900000);
  for (const email of ["student@example.com", "student+tag@example.co.uk"]) assert.equal(validEmail(email), true);
  for (const email of ["typo@", "one@@example.com", "a@b", "a@b..com", "space @example.com"]) assert.equal(validEmail(email), false);
});

function fixture({ fail = false, fallbackAllowed = false } = {}) {
  let time = 1000000;
  const codes = new Map(), messages = [];
  const key = (email, purpose) => `${purpose}:${email}`;
  const db = {
    getAuthCode: async (email, purpose) => codes.get(key(email, purpose)),
    createAuthCode: async (record) => codes.set(key(record.email, record.purpose), structuredClone(record)),
    deleteAuthCode: async (email, purpose) => codes.delete(key(email, purpose))
  };
  const service = createEmailVerification({ db, now: () => time, policy: { ttlMs: 900000, resendSeconds: 60, fallbackAllowed },
    sendEmail: async (message) => { if (fail) throw Object.assign(new Error("Private SMTP details"), { emailSetup: true }); messages.push(message); } });
  return { ...service, codes, messages, advance: (ms) => { time += ms; }, code: () => messages.at(-1).text.match(/\d{6}/)[0] };
}

test("codes bind mailbox and purpose, expire, replace previous codes and can only be consumed once", async () => {
  const f = fixture();
  assert.equal((await f.issue("a@example.test", "register")).sent, true);
  const first = f.code();
  const record = [...f.codes.values()][0];
  assert.equal(record.code, undefined);
  assert.equal(record.codeHash, require("../lib/security").hashToken(`register:a@example.test:${first}`));
  await assert.rejects(f.verify("b@example.test", "register", first), /先/);
  await assert.rejects(f.verify("a@example.test", "password-reset", first), /先/);
  const results = await Promise.allSettled([f.verify("a@example.test", "register", first), f.verify("a@example.test", "register", first)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  await f.issue("a@example.test", "register");

  f.advance(60000);
  await f.issue("a@example.test", "register");
  // Replacement stores only the latest challenge, with a new issuance time.
  assert.equal(f.codes.size, 1);
  assert.equal([...f.codes.values()][0].sentAt, 1060000);
  assert.equal([...f.codes.values()][0].attempts, 0);
  f.advance(900000);
  await assert.rejects(f.verify("a@example.test", "register", f.code()), /过期/);
  assert.equal(f.codes.size, 0);
});

test("concurrent sends and wrong guesses cannot bypass resend or five-attempt limits", async () => {
  const f = fixture();
  const sends = await Promise.allSettled(Array.from({ length: 8 }, () => f.issue("a@example.test", "register")));
  assert.equal(sends.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(f.messages.length, 1);
  assert.equal(sends.find((r) => r.status === "rejected").reason.status, 429);
  const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => f.verify("a@example.test", "register", "invalid")));
  assert.ok(attempts.every((r) => r.status === "rejected"));
  assert.equal([...f.codes.values()][0].attempts, 5);
  await assert.rejects(f.verify("a@example.test", "register", f.code()), /次数过多/);
  f.advance(60000);
  await f.issue("a@example.test", "register");
  await f.verify("a@example.test", "register", f.code());
});

test("delivery failure removes challenges and hides transport details; local fallback is explicit", async () => {
  const f = fixture({ fail: true });
  await assert.rejects(f.issue("a@example.test", "register"), (error) => error.status === 503 && !error.message.includes("SMTP"));
  assert.equal(f.codes.size, 0);
  const local = fixture({ fail: true, fallbackAllowed: true });
  const result = await local.issue("a@example.test", "register");
  assert.match(result.fallbackCode, /^\d{6}$/);
  await local.verify("a@example.test", "register", result.fallbackCode);
});

test("DynamoDB challenges use current reads and preserve cooldown across service restarts", async () => {
  const { StudyBridgeDatabase } = require("../lib/database");
  const { memoryDynamo } = require("./helpers/community-dynamo");
  const db = new StudyBridgeDatabase();
  const { store, calls } = memoryDynamo();
  db.dynamo = store;
  let code;
  const options = { db, policy: { ttlMs: 900000, resendSeconds: 60, fallbackAllowed: false }, sendEmail: async (mail) => { code = mail.text.match(/\d{6}/)[0]; } };
  await createEmailVerification(options).issue("cloud@example.test", "register");
  const restarted = createEmailVerification(options);
  await assert.rejects(restarted.issue("cloud@example.test", "register"), { status: 429 });
  await restarted.verify("cloud@example.test", "register", code);
  await assert.rejects(restarted.verify("cloud@example.test", "register", code), /先/);
  const reads = calls.filter((call) => call.target === "GetItem");
  assert.ok(reads.length >= 4);
  assert.ok(reads.every((call) => call.body.ConsistentRead === true));
});
