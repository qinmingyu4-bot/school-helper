"use strict";
const recognition = require("./grade-preview-recognition");
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
function createGradePlanner({ db, apiKey, model, request }) {
  let active = 0;
  const capabilities = () => ({ configured: Boolean(apiKey), syllabusConfigured: Boolean(apiKey), provider: apiKey ? "ai" : null });
  return {
    async read(userId) {
      const courses = (await db.listCourses(userId)).filter((c) => c.name !== "Schedule & Deadlines" && c.chatType !== "general");
      return { ...capabilities(), courses: await Promise.all(courses.map(async (c) => ({ id: c.id, code: c.name, name: c.name, term: c.term, ...await db.getGradePlan(userId, c.id) }))) };
    },
    async recognize(userId, courseId, body, signal) {
      if (!await db.getCourse(userId, courseId)) throw fail(404, "课程不存在。");
      let file;
      try { file = recognition.upload(body); } catch (error) { throw fail(400, error.message); }
      if (!apiKey) throw fail(503, "AI 识别尚未配置，请先手动填写。");
      if (active >= 2) throw fail(429, "已有文件正在识别，请稍后重试。");
      active++;
      try {
        const response = await request("https://api.openai.com/v1/responses", { method: "POST", signal,
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify(recognition.requestBody(file, model)) });
        if (!response.ok) throw fail(502, "AI 识别暂时不可用，请重试；尚未保存任何成绩。");
        return recognition.parseRecognition(file.kind, recognition.responseText(await response.json()));
      } finally { active--; }
    }
  };
}
module.exports = { createGradePlanner };
