// Run on the target server: node scripts/configure-web-push.js /private/path/.env mailto:owner@example.com
const fs = require("node:fs");
const path = require("node:path");
const webpush = require("web-push");
const [file, subject] = process.argv.slice(2);
if (!file || !/^(mailto:|https:\/\/)/.test(subject || "")) {
  console.error("Usage: node scripts/configure-web-push.js /private/path/.env mailto:owner@example.com"); process.exit(1);
}
const target = path.resolve(file);
let text = "";
try { text = fs.readFileSync(target, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
if (/^[ \t]*WEB_PUSH_(?:PUBLIC|PRIVATE)_KEY[ \t]*=[ \t]*[^ \t\r\n]+/m.test(text)) {
  console.error("Existing push keys found. Preserve them; rotation requires device re-subscription."); process.exit(1);
}
const keys = webpush.generateVAPIDKeys();
webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
const values = { WEB_PUSH_PUBLIC_KEY: keys.publicKey, WEB_PUSH_PRIVATE_KEY: keys.privateKey, WEB_PUSH_SUBJECT: subject };
for (const [key, value] of Object.entries(values)) {
  const pattern = new RegExp(`^[ \t]*${key}[ \t]*=.*$`, "m");
  text = pattern.test(text) ? text.replace(pattern, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
}
// Same-directory atomic replacement. No keys are printed.
const temporary = `${target}.${process.pid}.tmp`;
try { fs.writeFileSync(temporary, text, { mode: 0o600, flag: "wx" }); fs.renameSync(temporary, target); }
finally { try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; } }
console.log("Web Push configuration saved privately. Restart the application to enable delivery.");
