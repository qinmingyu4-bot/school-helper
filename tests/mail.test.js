const assert = require("node:assert/strict");
const { test } = require("node:test");
const nodemailer = require("nodemailer");

test("upgraded mail transport builds a verification email without sending", async () => {
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const result = await transport.sendMail({
    from: "StudyBridge <sender@example.test>",
    to: "student@example.test",
    subject: "StudyBridge verification code",
    text: "Your verification code is 123456."
  });
  const message = JSON.parse(result.message);
  assert.equal(message.to[0].address, "student@example.test");
  assert.ok(message.text.includes("123456"));
  transport.close();
});

test("patched address parsing cannot turn comments or quoted text into extra recipients", async () => {
  const transport = nodemailer.createTransport({ jsonTransport: true });
  for (const [to, expected] of [
    ["Student (note(nested) <unwanted@elsewhere.test>) <student@example.test>", "student@example.test"],
    ["Study: (note; <unwanted@elsewhere.test>) <student@example.test>;", "student@example.test"],
    ['<"local@elsewhere.test>"@example.test>', null]
  ]) {
    const result = await transport.sendMail({ from: "sender@example.test", to, subject: "Parser regression", text: "Fixture only; no email is sent." });
    if (expected) assert.deepEqual(result.envelope.to, [expected]);
    else { assert.equal(result.envelope.to.length, 1); assert.ok(result.envelope.to[0].endsWith("@example.test")); }
  }
  transport.close();
});
