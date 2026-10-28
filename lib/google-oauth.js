const crypto = require("node:crypto");

const TTL_MS = 10 * 60 * 1000;
function cookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-sb_google_oauth" : "sb_google_oauth";
}
function cookie(value, maxAge) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${cookieName()}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}
function signature(body) {
  return crypto.createHmac("sha256", process.env.SESSION_SECRET || "dev-studybridge-secret").update(body).digest("base64url");
}
function equal(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function startGoogleOAuth({ mode, inviteCode, now = Date.now() }) {
  const nonce = crypto.randomBytes(32).toString("base64url");
  const verifier = crypto.randomBytes(32).toString("base64url");
  const body = Buffer.from(JSON.stringify({ mode, inviteCode, nonce, createdAt: now })).toString("base64url");
  return {
    state: `${body}.${signature(body)}`,
    cookie: cookie(JSON.stringify({ nonce, verifier }), TTL_MS / 1000),
    codeChallenge: crypto.createHash("sha256").update(verifier).digest("base64url")
  };
}
function verifyGoogleOAuth(state, cookieHeader, now = Date.now()) {
  try {
    if (typeof state !== "string" || state.length > 4096) throw new Error();
    const parts = state.split(".");
    if (parts.length !== 2 || !equal(parts[1], signature(parts[0]))) throw new Error();
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (!Number.isFinite(payload.createdAt) || now - payload.createdAt > TTL_MS || payload.createdAt - now > 60000) throw new Error();
    const pair = String(cookieHeader || "").split(";").map((value) => value.trim()).find((value) => value.startsWith(`${cookieName()}=`));
    if (!pair) throw new Error();
    const browser = JSON.parse(decodeURIComponent(pair.slice(cookieName().length + 1)));
    if (!/^[A-Za-z0-9_-]{43}$/.test(browser.verifier) || !equal(browser.nonce, payload.nonce)) throw new Error();
    if (!payload.nonce || !["login", "register"].includes(payload.mode)) throw new Error();
    return { ...payload, codeVerifier: browser.verifier };
  } catch {
    throw new Error("Google login session is invalid or expired. Please start Google login again in this browser.");
  }
}
function clearGoogleOAuthCookie() {
  return cookie("", 0);
}

module.exports = { startGoogleOAuth, verifyGoogleOAuth, clearGoogleOAuthCookie };
