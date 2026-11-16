(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeFeedbackContext = factory();
})(globalThis, function () {
  "use strict";
  const pages = {
    study: "学习", schedule: "日程", grades: "成绩规划", email: "邮箱助手",
    tools: "办公工具", community: "社区", classmates: "同学", profile: "账号与资料",
    admin: "开发者端", other: "其他"
  };
  const operations = {
    ask: "生成学习回答", upload: "上传课程资料", create: "创建课程",
    practice: "课程练习", save: "保存更改", recognize: "识别资料",
    transcribe: "语音转写", sync: "同步邮箱", reply: "生成邮件回复",
    import: "导入文件", export: "导出文件", generate: "AI 辅助生成",
    post: "发布内容", message: "发送消息", load: "读取页面数据", other: "其他操作"
  };
  function operation(path, method, page) {
    const route = String(path || "").split("?")[0];
    if (/^\/api\/courses\/[^/]+\/chat$/.test(route)) return page === "email" ? ["email", "reply"] : ["study", "ask"];
    if (/^\/api\/courses\/[^/]+\/documents$/.test(route) && method === "POST") {
      return page === "schedule" ? ["schedule", "save"] : ["study", "upload"];
    }
    if (route === "/api/courses" && method === "POST") return ["study", "create"];
    if (/^\/api\/courses\/[^/]+\/learning-loop(?:\/|$)/.test(route)) return ["study", "practice"];
    if (/^\/api\/grade-planner(?:\/|$)/.test(route)) {
      return ["grades", method === "GET" ? "load" : method === "PUT" ? "save" : "recognize"];
    }
    if (/^\/api\/schedule\//.test(route)) {
      const action = route.split("/")[3];
      return ["schedule", ({ items: "load", manage: "save", import: "save", extract: "recognize",
        "parse-text": "recognize", transcribe: "transcribe", calendar: "load" })[action] || "other"];
    }
    if (/^\/api\/office(?:\/|$)|^\/api\/creative(?:\/|$)/.test(route)) {
      const action = route.split("/")[3];
      return ["tools", method === "GET" ? "load" : ({ import: "import", export: "export", assist: "generate" })[action] ||
        (route.startsWith("/api/creative") ? "generate" : "save")];
    }
    if (/^\/api\/mailbox(?:\/|$)/.test(route)) return ["email", method === "GET" ? "load" : route.endsWith("/sync") ? "sync" : "save"];
    if (/^\/api\/community(?:\/|$)/.test(route)) return ["community", method === "GET" ? "load" : "post"];
    if (/^\/api\/(?:classmates|classmate-requests)(?:\/|$)/.test(route)) return ["classmates", method === "GET" ? "load" : "message"];
    if (/^\/api\/me\/(?:profile|preferences|appearance|password)$/.test(route)) return ["profile", method === "GET" ? "load" : "save"];
    return [Object.hasOwn(pages, page) ? page : "other", "other"];
  }

  function codeLabel(code) {
    return ({
      "HTTP-400": "请求未通过验证",
      "HTTP-403": "没有操作权限",
      "HTTP-404": "找不到请求的数据",
      "HTTP-409": "数据已更新或发生冲突",
      "HTTP-413": "提交内容超过大小限制",
      "HTTP-422": "无法处理提交的内容",
      "HTTP-500": "服务处理失败",
      "HTTP-502": "上游服务未能完成请求",
      "HTTP-503": "服务暂不可用",
      "HTTP-504": "服务响应超时",
      "HTTP-429": "操作过于频繁或已达到额度上限",
      "UPLOAD_PARSE": "无法读取资料文字",
      "CONNECTION": "连接中断或网络不可用",
      "STREAM": "操作进行中意外中断",
      "MANUAL": "用户主动反馈"
    })[code] || "操作失败";
  }

  return { pages, operations, operation, codeLabel };
});
