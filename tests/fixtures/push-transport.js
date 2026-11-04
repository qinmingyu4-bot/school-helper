if (process.env.NODE_ENV !== "test") throw new Error("Push fixture is test-only.");
require("web-push").sendNotification = async (subscription) => {
  if (subscription.endpoint.endsWith("/expired")) throw Object.assign(new Error("Expired fixture subscription"), { statusCode: 410 });
  return { statusCode: 201 };
};
if (process.env.PUSH_FIXTURE_FAST === "true") {
  const fs = require("node:fs"), interval = global.setInterval;
  global.setInterval = (fn, ms, ...args) => interval(fn, ms === 30000 ? 50 : ms, ...args);
  require("web-push").sendNotification = async (subscription, payload) => {
    fs.appendFileSync(process.env.PUSH_FIXTURE_FILE, payload + "\n", { mode: 0o600 });
    return { statusCode: 201 };
  };
}
