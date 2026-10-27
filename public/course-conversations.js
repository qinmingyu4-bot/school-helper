(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeCourseConversations = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_ID = "default";
  const key = (userId, courseId, conversationId = DEFAULT_ID) => JSON.stringify([userId, courseId, conversationId]);
  function title(value) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 120) throw new Error("对话标题需为 1–120 个字符。");
    return value.trim();
  }
  function touch(conversation, message) {
    const firstQuestion = message.role === "user" && !conversation.titleEdited && !conversation.autoTitled && conversation.title === "新对话";
    const question = String(message.displayText || message.content || "").split("\n\nAttachments:\n")[0].replace(/\s+/g, " ").trim();
    return { ...conversation, updatedAt: message.createdAt,
      ...(firstQuestion ? { autoTitled: true, title: question ? question.slice(0, 40) + (question.length > 40 ? "…" : "") : "文件讨论" } : {}) };
  }
  return { DEFAULT_ID, key, title, touch };
});
