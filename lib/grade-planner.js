"use strict";
const G = require('../public/grade-planner-model');
const fail = (message) => Object.assign(new Error(message), { statusCode: 400 });
function validatePlan(value) {
  if (!value || !Array.isArray(value.categories) || value.categories.length > 20) throw fail('评分规则无效。');
  const ids = new Set();
  const id = (v) => { if (typeof v !== 'string' || !/^[\w-]{1,100}$/.test(v) || ids.has(v)) throw fail('评分项目编号无效或重复。'); ids.add(v); return v; };
  const text = (v, n) => { if (typeof v !== 'string' || v.length > n) throw fail('评分内容过长或无效。'); return v; };
  const categories = value.categories.map(c => {
    if (!c || !Number.isFinite(c.weight) || c.weight < 0 || c.weight > 100 || !['equal','points'].includes(c.method) || !(c.plannedCount === null || Number.isInteger(c.plannedCount) && c.plannedCount >= 0 && c.plannedCount <= 100) || !Array.isArray(c.items) || c.items.length > 100) throw fail('评分规则无效。');
    return { id:id(c.id), name:text(c.name,160), weight:c.weight, method:c.method, plannedCount:c.plannedCount, specialRule:text(c.specialRule || '',1000), evidence:text(c.evidence || '',4000), items:c.items.map(item => {
      if (!item || !G.validateGrade(item.score,item.max,item.status)) throw fail('请核对得分、满分和状态。');
      return {id:id(item.id),name:text(item.name,160),score:item.status === 'graded' ? item.score : null,max:item.max,status:item.status,source:text(item.source || '',100),evidence:text(item.evidence || '',2000)};
    }) };
  });
  const plan = {categories,source:text(value.source || '',1000)};
  if (Buffer.byteLength(JSON.stringify(plan)) > 180000) throw fail('成绩记录过长，请减少项目或来源文字。');
  return plan;
}
module.exports = {validatePlan};
