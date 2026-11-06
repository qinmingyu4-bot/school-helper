const crypto = require("crypto");
const { membershipTier } = require("./membership");

const SESSION_COOKIE = "sb_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

function createId(prefix = "id") {
  return `${prefix}_${crypto.randomUUID()}`;
}

// Keep the same scrypt strength and stored format, but avoid blocking all HTTP
// requests. Bound both worker use and queued work during authentication bursts.
let passwordWorkers = 0;
const passwordQueue = [];
async function derivePassword(password, salt) {
  if (passwordWorkers < 2) passwordWorkers++;
  else {
    if (passwordQueue.length >= 32) throw Object.assign(new Error("登录服务繁忙，请稍后重试。"), { statusCode: 503 });
    await new Promise((resolve) => passwordQueue.push(resolve));
  }
  try {
    return await new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key)));
  } finally {
    const next = passwordQueue.shift();
    if (next) next(); else passwordWorkers--;
  }
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = (await derivePassword(password, salt)).toString("hex");
  return `${salt}:${hash}`;
}

async function verifyPassword(password, stored) {
  if (typeof password !== "string" || !password || password.length > 1024) return false;
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !/^[a-f0-9]{128}$/i.test(hash || "")) return false;
  const candidate = await derivePassword(password, salt);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  const secret = process.env.SESSION_SECRET || "dev-studybridge-secret";
  return crypto.createHmac("sha256", secret).update(String(token)).digest("hex");
}

function parseCookies(header = "") {
  return header.split(";").reduce((cookies, pair) => {
    const index = pair.indexOf("=");
    if (index === -1) return cookies;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) {
      try { cookies[key] = decodeURIComponent(value); }
      catch { /* Ignore only the malformed cookie; other cookies remain usable. */ }
    }
    return cookies;
  }, Object.create(null));
}

function sessionCookie(token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(
    SESSION_TTL_MS / 1000
  )}${secure}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || "student",
    membershipTier: membershipTier(user),
    ...(user.paidMembershipExpiresAt ? { paidMembershipExpiresAt: user.paidMembershipExpiresAt } : {}),
    createdAt: user.createdAt,
    profile: user.profile || {},
    preferences: user.preferences || {}
  };
}

module.exports = {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  clearSessionCookie,
  createId,
  createSessionToken,
  hashPassword,
  hashToken,
  normalizeEmail,
  parseCookies,
  publicUser,
  sessionCookie,
  verifyPassword
};
