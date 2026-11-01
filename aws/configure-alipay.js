"use strict";
// Run on the application server with a private JSON payload on stdin. Never logs secrets.
const fs = require("node:fs/promises"), path = require("node:path"), os = require("node:os");
const { execFileSync } = require("node:child_process");
const Stripe = require("stripe");
const { API_VERSION } = require("../lib/billing-service");
const ORIGIN = "https://studybridge.ink";
const EVENTS = ["checkout.session.completed", "checkout.session.expired", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed",
  "payment_intent.succeeded", "payment_intent.payment_failed", "payment_intent.canceled", "refund.created", "refund.updated", "refund.failed", "charge.refunded"];
const fail = (message) => Object.assign(Error(message), { safe: true });
function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/).filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line)).map((line) => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^(["'])(.*)\1$/, "$2")];
  }));
}
function renderEnv(source, values) {
  return source.split(/\r?\n/).filter((line) => !Object.hasOwn(values, line.split("=", 1)[0])).join("\n").trimEnd() + "\n" + Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
}
async function prepare(payload, stripe, db) {
  if (!/^(?:sk|rk)_live_[A-Za-z0-9_]+$/.test(payload.secretKey || "") || !/^whsec_[A-Za-z0-9_]+$/.test(payload.webhookSecret || "") || !/^we_[A-Za-z0-9_]+$/.test(payload.webhookId || "") ||
      !/^acct_[A-Za-z0-9]+$/.test(payload.accountId || "") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.ownerEmail || "") ||
      ![payload.monthPriceId, payload.semesterPriceId].every((id) => /^price_[A-Za-z0-9_]+$/.test(id || "")) || payload.monthPriceId === payload.semesterPriceId) throw fail("Invalid private Alipay configuration.");
  const account = await stripe.accounts.retrieve();
  if (account.id !== payload.accountId || account.country !== "CA") throw fail("The key belongs to a different Stripe account. Configuration was not changed.");
  const hook = await stripe.webhookEndpoints.retrieve(payload.webhookId);
  if (!hook.livemode || hook.status !== "enabled" || hook.url !== `${ORIGIN}/api/billing/alipay/webhook` || hook.api_version !== API_VERSION ||
      !EVENTS.every((event) => hook.enabled_events?.includes(event) || hook.enabled_events?.includes("*"))) throw fail("The live webhook destination/version/events do not match.");
  for (const [priceId, amount] of [[payload.monthPriceId, 1999], [payload.semesterPriceId, 6999]]) {
    const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
    if (!price.livemode || !price.active || price.type !== "one_time" || price.currency !== "cad" || price.unit_amount !== amount || price.tax_behavior !== "exclusive" ||
        !price.product?.active || price.product.tax_code !== "txcd_10105001") throw fail("Draft Alipay Prices must match the expected CAD amounts and AI service tax category.");
  }
  const tax = await stripe.tax.settings.retrieve();
  if (tax.status !== "active") throw fail("Stripe Tax origin/settings are incomplete.");
  const owner = await db.findUserByEmail(payload.ownerEmail.trim().toLowerCase(), { consistent: true });
  if (!owner?.id || !/^[\w-]{1,100}$/.test(owner.id)) throw fail("The existing StudyBridge owner account was not found.");
  return { ALIPAY_MODE: "live", ALIPAY_CHECKOUT_ACCESS: "closed", ALIPAY_PRICES_APPROVED: "false", ALIPAY_TERMS_VERSION: "", ALIPAY_OWNER_USER_ID: owner.id,
    ALIPAY_MONTH_AMOUNT_CENTS: "1999", ALIPAY_SEMESTER_AMOUNT_CENTS: "6999", BILLING_PUBLIC_BASE_URL: ORIGIN, STRIPE_ALIPAY_ACCOUNT_ID: payload.accountId,
    STRIPE_ALIPAY_SECRET_KEY: payload.secretKey, STRIPE_ALIPAY_WEBHOOK_SECRET: payload.webhookSecret,
    STRIPE_ALIPAY_MONTH_PRICE_ID: payload.monthPriceId, STRIPE_ALIPAY_SEMESTER_PRICE_ID: payload.semesterPriceId };
}
async function replacePrivate(file, bytes) {
  const temporary = `${file}.alipay-${require("node:crypto").randomUUID()}`;
  try { await fs.writeFile(temporary, bytes, { flag: "wx", mode: 0o600 }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}
function restart(values) { execFileSync("pm2", ["restart", "studybridge", "--update-env"], { env: { ...process.env, ...values }, stdio: "pipe" }); }
async function main() {
  const expected = process.argv[2], revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (!/^[a-f0-9]{40}$/.test(expected || "") || expected !== revision) throw fail("Expected deployment revision does not match. Configuration was not changed.");
  const envFile = path.resolve(".env");
  if (!(await fs.lstat(envFile)).isFile()) throw fail("Expected a regular production .env file.");
  const lock = await fs.open(`${envFile}.alipay-lock`, "wx", 0o600);
  try {
    const original = await fs.readFile(envFile), fileValues = parseEnv(original.toString());
    for (const [key, value] of Object.entries(fileValues)) if (process.env[key] === undefined) process.env[key] = value;
    let input = ""; for await (const chunk of process.stdin) { input += chunk; if (input.length > 16384) throw fail("Private configuration payload is too large."); }
    const payload = JSON.parse(input), stripe = new Stripe(payload.secretKey, { apiVersion: API_VERSION, timeout: 15000, maxNetworkRetries: 1 });
    const { StudyBridgeDatabase } = require("../lib/database");
    const values = await prepare(payload, stripe, new StudyBridgeDatabase());
    if (fileValues.BILLING_PUBLIC_BASE_URL && fileValues.BILLING_PUBLIC_BASE_URL !== ORIGIN) throw fail("Existing billing origin differs; owner review is required.");
    const runtime = JSON.parse(execFileSync("pm2", ["jlist"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })).find((row) => row.name === "studybridge")?.pm2_env;
    if (!runtime) throw fail("The production application process was not found.");
    const previous = Object.fromEntries(Object.keys(values).map((key) => [key, runtime[key] ?? runtime.env?.[key] ?? fileValues[key] ?? ""]));
    const backupRoot = path.join(os.homedir(), ".studybridge-private-backups"); await fs.mkdir(backupRoot, { recursive: true, mode: 0o700 });
    const backup = await fs.mkdtemp(path.join(backupRoot, "alipay-"));
    await fs.writeFile(path.join(backup, ".env"), original, { mode: 0o600 });
    await fs.writeFile(path.join(backup, "previous-alipay-environment.json"), JSON.stringify(previous), { mode: 0o600 });
    if (!(await fs.readFile(envFile)).equals(original)) throw fail("Private configuration changed concurrently. No change made.");
    try {
      await replacePrivate(envFile, renderEnv(original.toString(), values)); restart(values);
      let ready = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        try { const response = await fetch("http://127.0.0.1:3000/api/health", { signal: AbortSignal.timeout(2000) }); ready = response.ok && (await response.json()).ok === true; } catch { /* Wait for restart. */ }
        if (ready) break; await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!ready) throw fail("Application health verification failed.");
      const currentRuntime = JSON.parse(execFileSync("pm2", ["jlist"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })).find((row) => row.name === "studybridge")?.pm2_env;
      if (!currentRuntime || !Object.entries(values).every(([key, value]) => String(currentRuntime[key] ?? currentRuntime.env?.[key] ?? "") === value)) throw fail("Private runtime configuration verification failed.");
      const result = await fetch("http://127.0.0.1:3000/api/billing/alipay/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (result.status !== 401) throw fail("Payment endpoint authentication check failed.");
      execFileSync("pm2", ["save"], { stdio: "pipe" });
    } catch {
      await replacePrivate(envFile, original); restart(previous);
      throw fail("Alipay setup validation failed. Previous private configuration was restored.");
    }
    console.log("Alipay account, draft Prices and webhook configuration installed. Sales CLOSED; prices NOT approved. No payment was created. Signed event delivery and real payment still require separate verification.");
  } finally { await lock.close(); await fs.rm(`${envFile}.alipay-lock`, { force: true }); }
}
if (require.main === module) main().catch((error) => { console.error(error.safe ? error.message : "Private Alipay setup failed; credential and provider output was suppressed."); process.exitCode = 1; });
module.exports = { prepare, parseEnv, renderEnv, EVENTS, ORIGIN };
