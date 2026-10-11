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
