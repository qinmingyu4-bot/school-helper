const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { test } = require("node:test");
const { setTimeout: delay } = require("node:timers/promises");

test("registration and password reset require delivered mailbox-bound codes", { timeout: 30000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-email-"));
  const mailFile = path.join(directory, "mail.jsonl");
  const child = spawn(process.execPath, ["--require", "./tests/fixtures/verification-mail.js", "server.js"], {
    cwd: path.resolve(__dirname, ".."), env: { ...process.env, PORT: "0", NODE_ENV: "production", STUDYBRIDGE_DB: "local",
      LOCAL_DB_FILE: path.join(directory, "database.json"), LOCAL_DB_BACKUP_DISABLED: "true", REQUIRE_EMAIL_VERIFICATION: "true",
      REQUIRE_INVITE_CODE: "true", OWNER_INVITE_CODE: "verification-owner", ADMIN_EMAILS: "verified@example.test",
      ALLOW_EMAIL_CODE_FALLBACK: "true", SESSION_SECRET: "isolated-verification-secret", TEST_VERIFICATION_MAIL_FILE: mailFile,
      SMTP_HOST: "fixture.test", SMTP_USER: "fixture", SMTP_PASS: "fixture", MAIL_FROM: "StudyBridge <sender@example.test>",
      GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", OPENAI_API_KEY: "" }, stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(async () => {
    if (child.exitCode === null) { const done = once(child, "exit"); child.kill(); await done; }
    await fs.rm(directory, { recursive: true, force: true });
  });
  const base = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Verification server startup timed out")), 10000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", () => { clearTimeout(timer); reject(new Error("Verification server exited")); });
    child.stdout.on("data", (chunk) => { output += chunk; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); } });
  });
  const request = async (route, body, cookie = "") => {
    const response = await fetch(base + route, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie }, body: body && JSON.stringify(body) });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  const details = { email: "verified@example.test", inviteCode: "verification-owner" };
  const registration = { ...details, name: "Verified student", password: "Verification-Password-2026!", passwordConfirm: "Verification-Password-2026!" };
  assert.equal((await request("/api/auth/config")).data.emailVerificationRequired, true);
  assert.equal((await request("/api/auth/register", registration)).status, 403);
  assert.equal((await request("/api/auth/send-verification", { ...details, email: "typo@" })).status, 400);
  assert.equal((await request("/api/auth/send-verification", { ...details, inviteCode: "wrong" })).status, 400);
  const sent = await request("/api/auth/send-verification", details);
  assert.equal(sent.status, 200);
  assert.equal(sent.data.emailCode, "");
  assert.equal(sent.data.emailDelivery, "email");
  const mail = JSON.parse((await fs.readFile(mailFile, "utf8")).trim());
  assert.equal(mail.to, details.email);
  assert.match(mail.html, /验证你的邮箱/);
  assert.match(mail.html, /letter-spacing:8px/);
  const code = mail.text.match(/\d{6}/)[0];
  assert.ok(!JSON.stringify(sent.data).includes(code));
  const duplicate = await request("/api/auth/send-verification", details);
  assert.equal(duplicate.status, 429);
  assert.ok(Number(duplicate.headers.get("retry-after")) > 0);
  assert.equal((await request("/api/auth/register", { ...registration, email: "typo@example.test", emailCode: code })).status, 403);
  assert.equal((await request("/api/auth/register", { ...registration, emailCode: "000000" })).status, 403);
  const account = await request("/api/auth/register", { ...registration, emailCode: code });
  assert.equal(account.status, 201);
  assert.match(account.headers.get("set-cookie"), /Secure/);
  assert.equal((await request("/api/auth/register", { ...registration, emailCode: code })).status, 409);
  assert.equal((await request("/api/auth/login", registration)).status, 200);
  const cookie = account.headers.get("set-cookie").split(";")[0];
  const status = await request("/api/admin/system-status", undefined, cookie);
  assert.equal(status.data.email.fallbackAllowed, false);
  const requestReset = (email) => request("/api/auth/request-password-reset", { email });
  const crossSiteForm = await fetch(base + "/api/auth/request-password-reset", {
    method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ email: details.email })
  });
  assert.equal(crossSiteForm.status, 415);
  const reset = await requestReset(details.email.toUpperCase());
  assert.equal(reset.status, 200);
  assert.deepEqual(reset.data, { ok: true, resendAfter: 60, expiresIn: 900 });
  const unknown = await requestReset("unknown@example.test");
  assert.equal(unknown.status, reset.status);
  assert.deepEqual(unknown.data, reset.data);
  const repeated = await requestReset(details.email);
  assert.equal(repeated.status, reset.status);
  assert.deepEqual(repeated.data, reset.data);
  let messages = [];
  for (let attempt = 0; attempt < 100; attempt++) {
    messages = (await fs.readFile(mailFile, "utf8")).trim().split("\n").map(JSON.parse);
    if (messages.length >= 2) break;
    await delay(20);
  }
  assert.deepEqual(messages.map((message) => message.to), [details.email, details.email]);
  const resetCode = messages[1].text.match(/\d{6}/)[0];
  const newPassword = "Replacement-Password-2026!";
  const replacement = { email: details.email, password: newPassword, passwordConfirm: newPassword, emailCode: resetCode };
  const wrongCode = resetCode === "123456" ? "654321" : "123456";
  const wrong = await request("/api/auth/reset-password", { ...replacement, emailCode: wrongCode });
  assert.equal(wrong.status, 400);
  assert.deepEqual((await request("/api/auth/reset-password", { ...replacement, email: "unknown@example.test" })).data, wrong.data);
  assert.equal((await request("/api/auth/reset-password", { ...replacement, passwordConfirm: "Different!" })).status, 400);
  assert.equal((await request("/api/auth/reset-password", { ...registration, emailCode: resetCode })).status, 400);
  assert.equal((await request("/api/admin/system-status", undefined, cookie)).status, 200);
  const races = await Promise.all([replacement, replacement].map((body) => request("/api/auth/reset-password", body)));
  assert.equal(races.filter((result) => result.status === 200).length, 1);
  assert.equal((await request("/api/auth/reset-password", { ...registration, emailCode: resetCode })).status, 400);
  assert.equal((await request("/api/admin/system-status", undefined, cookie)).status, 401);
  assert.equal((await request("/api/auth/login", registration)).status, 401);
  const signedIn = await request("/api/auth/login", replacement);
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.data.user.id, account.data.user.id);
  const refreshedCookie = signedIn.headers.get("set-cookie").split(";")[0];
  const invitation = await request("/api/admin/invites", { label: "Delivery failure test" }, refreshedCookie);
  assert.equal(invitation.status, 201);
  const failed = await request("/api/auth/send-verification", { email: "fail@example.test", inviteCode: invitation.data.invite.code });
  assert.equal(failed.status, 503);
  assert.ok(!JSON.stringify(failed.data).includes("private transport"));
  assert.ok(!failed.data.emailCode);
  const standardDetails = { email: "open-standard@example.test" };
  const standardRegistration = { ...registration, ...standardDetails, inviteCode: "", membershipTier: "plus" };
  assert.equal((await request("/api/auth/register", standardRegistration)).status, 403, "Open registration still requires email verification");
  const standardSent = await request("/api/auth/send-verification", standardDetails);
  assert.equal(standardSent.status, 200);
  const standardMail = JSON.parse((await fs.readFile(mailFile, "utf8")).trim().split("\n").at(-1));
  const standardCode = standardMail.text.match(/\d{6}/)[0];
  const standardAccount = await request("/api/auth/register", { ...standardRegistration, emailCode: standardCode });
  assert.equal(standardAccount.status, 201);
  assert.equal(standardAccount.data.user.membershipTier, "standard");
  assert.equal(account.data.user.membershipTier, "plus");

  for (let i = 0; i < 7; i++) assert.equal((await requestReset(`unused-${i}@example.test`)).status, 200);
  const limited = await requestReset(details.email);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
});
