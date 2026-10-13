const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const activity = require("../public/user-activity");

test("recent activity labels handle missing, future and minute/hour/day boundaries", () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  for (const [seconds, label] of [[-60, "刚刚"], [0, "刚刚"], [59, "刚刚"], [60, "1 分钟前"], [3599, "59 分钟前"], [3600, "1 小时前"], [86400, "1 天前"], [86400 * 45, "45 天前"]]) {
    assert.equal(activity.relativeTime(new Date(now - seconds * 1000).toISOString(), now), label);
  }
  for (const value of [null, undefined, "", "invalid"]) assert.equal(activity.relativeTime(value, now), "暂无记录");
  const browser = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/user-activity.js"), "utf8"), browser);
  assert.equal(browser.StudyBridgeUserActivity.relativeTime(new Date(now - 60000).toISOString(), now), "1 分钟前");
});

test("heartbeats stop in background or after five idle minutes and are rate limited", () => {
  const now = 1000000;
  const input = { visible: true, lastInteractionAt: now, lastReportedAt: now - 60000, now };
  assert.equal(activity.shouldReport(input), true);
  assert.equal(activity.shouldReport({ ...input, visible: false }), false);
  assert.equal(activity.shouldReport({ ...input, lastReportedAt: now - 59999 }), false);
  assert.equal(activity.shouldReport({ ...input, lastInteractionAt: now - 300000 }), false);
  assert.equal(activity.shouldReport({ ...input, lastInteractionAt: now - 299999 }), true);
});
