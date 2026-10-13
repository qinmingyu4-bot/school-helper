(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeUserActivity = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function relativeTime(value, now = Date.now()) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return "暂无记录";
    const minutes = Math.floor(Math.max(0, now - timestamp) / 60000);
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    return `${Math.floor(hours / 24)} 天前`;
  }

  function shouldReport({ visible, lastInteractionAt, lastReportedAt, now = Date.now() }) {
    return visible && now - lastInteractionAt < 5 * 60000 && now - lastReportedAt >= 60000;
  }

  return { relativeTime, shouldReport };
});
