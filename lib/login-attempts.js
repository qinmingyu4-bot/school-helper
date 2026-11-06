const crypto = require("node:crypto");
const { isIP } = require("node:net");
const { normalizeEmail } = require("./security");

function canonicalAddress(value) {
  if (typeof value !== "string" || value.includes("%") || !isIP(value)) return "";
  if (isIP(value) === 4) return value;
  const address = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = address.match(/^::ffff:([a-f\d]+):([a-f\d]+)$/);
  if (!mapped) return address;
  const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}

function clientAddress(req) {
  const peer = canonicalAddress(req.socket?.remoteAddress);
  // The deployed Nginx overwrites X-Real-IP and connects over loopback.
  // Direct remote clients cannot select their own limiter identity via headers.
  if (peer === "::1" || peer.startsWith("127.")) {
    return canonicalAddress(req.headers?.["x-real-ip"]) || peer;
  }
  return peer || "unknown";
}

function createLoginAttempts({ limit = 10, windowMs = 15 * 60 * 1000, maxEntries = 10000, now = Date.now } = {}) {
  const entries = new Map();
  const keySecret = crypto.randomBytes(32);
  let nextSweepAt = 0;
  const resetExpired = (entry, time) => {
    if (entry.expiresAt <= time) { entry.failures = 0; entry.expiresAt = time + windowMs; }
  };
  return {
    begin(email, address) {
      const time = now();
      if (time >= nextSweepAt) {
        for (const [key, entry] of entries) {
          if (!entry.pending && entry.expiresAt <= time) entries.delete(key);
        }
        nextSweepAt = time + Math.min(30000, windowMs);
      }
      const key = crypto.createHmac("sha256", keySecret)
        .update(JSON.stringify([normalizeEmail(email), address])).digest("hex");
      let entry = entries.get(key);
      if (!entry) {
        // Never evict a live penalty to make room for attacker-created identities.
        if (entries.size >= maxEntries) return { allowed: false, status: 503, retryAfter: Math.max(1, Math.ceil((nextSweepAt - time) / 1000)) };
        entry = { failures: 0, pending: 0, expiresAt: time + windowMs };
        entries.set(key, entry);
      }
      resetExpired(entry, time);
      if (entry.failures + entry.pending >= limit) {
        return { allowed: false, status: 429, retryAfter: entry.failures >= limit ? Math.max(1, Math.ceil((entry.expiresAt - time) / 1000)) : 1 };
      }
      entry.pending += 1;
      let settled = false;
      return {
        allowed: true,
        finish(outcome) {
          if (settled) return;
          settled = true;
          entry.pending -= 1;
          resetExpired(entry, now());
          if (outcome === "failure") entry.failures += 1;
          if (outcome === "success") entry.failures = 0;
          if (!entry.pending && !entry.failures) entries.delete(key);
        }
      };
    }
  };
}

module.exports = { clientAddress, createLoginAttempts };
