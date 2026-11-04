// Run on the server; --ensure preserves a valid existing pair on later deployments.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const webpush = require("web-push");
const { fileEnvironment } = require("./release-backup");
const [file, subject, mode] = process.argv.slice(2);
if (!file || !/^(mailto:|https:\/\/)/.test(subject || "") || mode && mode !== "--ensure") {
  console.error("Usage: node scripts/configure-web-push.js /private/path/.env https://YOUR_SITE [--ensure]"); process.exit(1);
}
const target = path.resolve(file);
let text = "";
try { text = fs.readFileSync(target, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
const existing = fileEnvironment(text);
const present = existing.WEB_PUSH_PUBLIC_KEY || existing.WEB_PUSH_PRIVATE_KEY;
let values;
try {
  if (present) {
    if (mode !== "--ensure") throw new Error("Existing push keys found. Preserve them; rotation requires device re-subscription.");
    const { WEB_PUSH_PUBLIC_KEY: publicKey, WEB_PUSH_PRIVATE_KEY: privateKey, WEB_PUSH_SUBJECT: contact } = existing;
    webpush.setVapidDetails(contact, publicKey, privateKey);
    const curve = crypto.createECDH("prime256v1"); curve.setPrivateKey(Buffer.from(privateKey, "base64url"));
    if (curve.getPublicKey().toString("base64url") !== publicKey) throw new Error("mismatch");
    values = { WEB_PUSH_PUBLIC_KEY: publicKey, WEB_PUSH_PRIVATE_KEY: privateKey, WEB_PUSH_SUBJECT: contact };
  } else {
    const keys = webpush.generateVAPIDKeys();
    webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
    values = { WEB_PUSH_PUBLIC_KEY: keys.publicKey, WEB_PUSH_PRIVATE_KEY: keys.privateKey, WEB_PUSH_SUBJECT: subject };
  }
} catch {
  console.error("Existing push keys or contact are invalid or already present. Configuration was preserved; keys were not rotated."); process.exit(1);
}
if (mode === "--ensure") values.WEB_PUSH_WORKER_DISABLED = "false";
for (const [key, value] of Object.entries(values)) {
  const pattern = new RegExp(String.raw`^[ \t]*${key}[ \t]*=.*$`, "gm");
  let found = false;
  text = text.replace(pattern, () => { if (found) return ""; found = true; return `${key}=${value}`; });
  if (!found) text = `${text.trimEnd()}\n${key}=${value}\n`;
}
// Same-directory atomic replacement. No keys are printed.
const temporary = `${target}.${process.pid}.tmp`;
try { fs.writeFileSync(temporary, text, { mode: 0o600, flag: "wx" }); fs.renameSync(temporary, target); }
finally { try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; } }
console.log(present ? "Existing Web Push keys verified and preserved." : "Web Push configuration saved privately. Restart the application to enable delivery.");
