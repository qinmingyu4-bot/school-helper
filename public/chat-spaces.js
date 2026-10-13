(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeChatSpaces = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  return {
    general: { id: "general", name: "自由问答", term: "日常生活", chatType: "general" },
    prompts: [
      ["做一道菜", "帮我想一道适合今天做的菜，先问我现有食材和口味偏好。"],
      ["查天气", "帮我查询今天的天气，先确认我所在的城市。"],
      ["出行计划", "帮我安排一次出行，先问我目的地、日期和预算。"],
      ["聊一聊", "我想和你聊一聊。"]
    ]
  };
});
