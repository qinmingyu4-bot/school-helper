const crypto = require("node:crypto");
const { verificationEmail } = require("./verification-email");
const { hashToken } = require("./security");

const validEmail = (email) => typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email);

function emailPolicy(env = process.env) {
  const production = env.NODE_ENV === "production";
  const minutes = Number(env.EMAIL_CODE_TTL_MINUTES || 15);
  return {
    required: env.REQUIRE_EMAIL_VERIFICATION === "true" || (production && env.REQUIRE_EMAIL_VERIFICATION !== "false"),
    fallbackAllowed: !production && env.ALLOW_EMAIL_CODE_FALLBACK === "true",
    ttlMs: (Number.isFinite(minutes) && minutes > 0 && minutes <= 60 ? minutes : 15) * 60000,
    resendSeconds: 60
  };
}

function createEmailVerification({ db, sendEmail, policy = emailPolicy(), now = Date.now }) {
  const pending = new Map();
  // Serialize issuance and attempts for each mailbox, including concurrent HTTP requests.
  async function exclusive(email, purpose, run) {
    const key = `${purpose}:${email}`;
    const previous = pending.get(key) || Promise.resolve();
    const task = previous.catch(() => {}).then(run);
    pending.set(key, task);
    try { return await task; } finally { if (pending.get(key) === task) pending.delete(key); }
  }
  const digest = (email, purpose, code) => hashToken(`${purpose}:${email}:${code}`);

  async function issue(email, purpose) {
    return exclusive(email, purpose, async () => {
      const existing = await db.getAuthCode(email, purpose);
      const retryAfter = Math.ceil((Number(existing?.sentAt || 0) + policy.resendSeconds * 1000 - now()) / 1000);
      if (retryAfter > 0) throw Object.assign(new Error(`请等待 ${retryAfter} 秒后再发送验证码。`), { status: 429, retryAfter });
      const code = String(crypto.randomInt(100000, 1000000));
      const sentAt = now();
      const record = { email, purpose, codeHash: digest(email, purpose, code), sentAt, expiresAt: sentAt + policy.ttlMs, attempts: 0 };
      // Persist before sending, but never leave an undelivered code usable after a failure.
      await db.createAuthCode(record);
      let result;
      try {
        await sendEmail({ to: email, ...verificationEmail({ code, purpose, minutes: policy.ttlMs / 60000 }) });
        result = { sent: true };
      } catch (error) {
        if (policy.fallbackAllowed && error.emailSetup) {
          result = { sent: false, fallbackCode: code, message: "本地测试模式：临时验证码已填入，尚未验证邮箱收信。" };
        } else {
          await db.deleteAuthCode(email, purpose);
          throw Object.assign(new Error("验证码邮件暂时无法发送，请稍后重试或联系管理员。"), { status: 503 });
        }
      }
      return { ...result, resendAfter: policy.resendSeconds, expiresIn: policy.ttlMs / 1000 };
    });
  }

  async function verify(email, purpose, value) {
    return exclusive(email, purpose, async () => {
      const code = String(value || "").trim();
      const record = await db.getAuthCode(email, purpose);
      if (!record) throw new Error("请先向此邮箱发送验证码。");
      if (Number(record.expiresAt || 0) <= now()) {
        await db.deleteAuthCode(email, purpose);
        throw new Error("邮箱验证码已过期，请重新发送。");
      }
      if (Number(record.attempts || 0) >= 5) throw new Error("验证码错误次数过多，请重新发送。");
      const expected = Buffer.from(String(record.codeHash || ""), "hex");
      const candidate = Buffer.from(digest(email, purpose, code), "hex");
      if (!/^\d{6}$/.test(code) || !expected.length || expected.length !== candidate.length || !crypto.timingSafeEqual(expected, candidate)) {
        await db.createAuthCode({ ...record, attempts: Number(record.attempts || 0) + 1 });
        throw new Error("邮箱验证码不正确，请检查后重试。");
      }
      await db.deleteAuthCode(email, purpose);
    });
  }
  return { issue, verify };
}

module.exports = { validEmail, emailPolicy, createEmailVerification };
