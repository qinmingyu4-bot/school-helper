"use strict";
const G = require("../public/grade-planner-model");
const { normalizeLink, normalizeDirection } = require("../public/grade-locations");
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const key = (userId, courseId) => JSON.stringify([userId, courseId]);
const empty = () => ({ version: 0, categories: [], source: "" });
const text = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
function validate(input) {
  if (!input || !Number.isSafeInteger(input.version) || input.version < 0 || !Array.isArray(input.categories) || input.categories.length > 20) throw fail(400, "评分规则格式无效。");
  const ids = new Set();
  const uniqueId = (id) => { if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(id) || ids.has(id)) throw fail(400, "成绩项目标识无效或重复。"); ids.add(id); return id; };
  const categories = input.categories.map((c) => {
    if (!c || !text(c.name, 80) || !Number.isFinite(c.weight) || c.weight < 0 || c.weight > 100 || !["equal", "points"].includes(c.method)
      || c.plannedCount !== null && (!Number.isInteger(c.plannedCount) || c.plannedCount < 1 || c.plannedCount > 100)
      || !Array.isArray(c.items) || c.items.length > 100) throw fail(400, "请核对评分占比、次数和计算方式。");
    if (c.gradeLinks !== undefined && (!Array.isArray(c.gradeLinks) || c.gradeLinks.length > 5 || c.gradeLinks.some((link)=>!normalizeLink(link,link?.origin)))) throw fail(400,"请填写有效的成绩查询网址（http 或 https）。");
    if (c.gradeDirections !== undefined && (!Array.isArray(c.gradeDirections) || c.gradeDirections.length > 5 || c.gradeDirections.some((value)=>!normalizeDirection(value)))) throw fail(400,"成绩查询说明格式无效。");
    return { id: uniqueId(c.id), name: text(c.name, 80), weight: c.weight, method: c.method, plannedCount: c.plannedCount,
      gradeLinks:(c.gradeLinks || []).map((link)=>normalizeLink(link,link?.origin)),
      gradeDirections:(c.gradeDirections || []).map(normalizeDirection),
      specialRule: text(c.specialRule, 500), evidence: text(c.evidence, 1200), items: c.items.map((item) => {
        if (!item || !text(item.name, 120) || !G.validateGrade(item.score, item.max, item.status) || item.max > 1000000) throw fail(400, "请核对项目得分和满分。");
        return { id: uniqueId(item.id), name: text(item.name, 120), score: item.status === "graded" ? item.score : null, max: item.max,
          status: item.status, source: item.source === "screenshot" ? "screenshot" : "" };
      }) };
  });
  if (categories.length && Math.abs(categories.reduce((sum, c) => sum + c.weight, 0) - 100) > .000001) throw fail(400, "所有类别的占比需要合计为 100%。");
  const result = { categories, source: text(input.source, 160) };
  if (Buffer.byteLength(JSON.stringify(result)) > 240000) throw fail(400, "成绩记录过长，请减少项目或规则说明。");
  return result;
}
module.exports = {
  async getGradePlan(userId, courseId) {
    return (this.dynamo ? await this.dynamo.get(`USER#${userId}`, `COURSE#${courseId}#GRADES`, { consistent: true })
      : await this.local.read((db) => db.gradePlans?.[key(userId, courseId)])) || empty();
  },
  async saveGradePlan(userId, courseId, input) {
    const next = validate(input);
    const prepare = (previous, course) => {
      if (!course || course.userId !== userId) throw fail(404, "课程不存在。");
      if (previous?.version === input.version + 1 && JSON.stringify({ categories:previous.categories, source:previous.source }) === JSON.stringify(next)) return previous;
      if ((previous?.version || 0) !== input.version) throw fail(409, "这门课的成绩已在其他页面更新，请刷新后再修改。");
      return { ...next, version: input.version + 1, userId, courseId, kind: "gradePlan", updatedAt: new Date().toISOString() };
    };
    if (!this.dynamo) return this.local.write((db) => {
      const result = prepare(db.gradePlans?.[key(userId, courseId)], db.courses[courseId]);
      db.gradePlans ||= {}; db.gradePlans[key(userId, courseId)] = result; return result;
    });
    const pk = `USER#${userId}`, sk = `COURSE#${courseId}#GRADES`, courseSk = `COURSE#${courseId}`;
    const [previous, course] = await Promise.all([this.dynamo.get(pk, sk, { consistent: true }), this.dynamo.get(pk, courseSk, { consistent: true })]);
    const result = prepare(previous, course);
    try { await this.dynamo.transactPut([{ pk, sk, type: "gradePlan", data: result, ...(previous ? { expectedData: previous } : { createOnly: true }) },
      { pk, sk: courseSk, type: "course", data: course, expectedData: course, checkOnly: true }]); }
    catch (error) { if (["TransactionCanceledException", "ConditionalCheckFailedException", "TransactionConflictException"].includes(error.code)) throw fail(409, "成绩或课程已更新，请刷新后重试。"); throw error; }
    return result;
  }
};
