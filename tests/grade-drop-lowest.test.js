"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const G = require("../public/grade-planner-model");
const { createGradePlanner } = require("../lib/grade-planner-service");
const { readDropRule } = require("../lib/grade-preview-recognition");
const { mergeClearRules } = require("../lib/grade-rule-defaults");

function plan(marks, dropLowest = 2) {
  const items = marks.map((score, i) => ({id:"q" + i,name:"Quiz " + (i + 1),score,max:100,status:score === null ? "pending" : "graded"}));
  return {categories:[{id:"quizzes",name:"Quizzes",weight:100,method:"equal",plannedCount:items.length,dropLowest,items}]};
}

test("best 8 of 10 ranks normalized scores, preserves zeroes and reselects the lowest after edits", () => {
  const course = plan([0, 60, 70, 75, 80, 85, 90, 95, 100, 80]);
  const {items} = course.categories[0];
  Object.assign(items[1], {score:6,max:10});
  const snapshot = structuredClone(course);
  const initial = G.summarize(course);
  assert.deepEqual([...initial.categories[0].dropped], ["q0","q1"]);
  assert.equal(initial.earned, 84.375);
  assert.deepEqual(course, snapshot);
  items[0].score = 98;
  assert.deepEqual([...G.summarize(course).categories[0].dropped], ["q1","q2"]);
  course.categories[0].dropLowest = 1;
  assert.deepEqual([...G.summarize(course).categories[0].dropped], ["q1"]);
});

test("pending and manually excluded assessments remain distinct from lowest-score drops", () => {
  const course = plan([0, 60, null, null], 1);
  const group = course.categories[0];
  assert.equal(G.summarize(course).recorded, 2);
  assert.equal(G.summarize(course).categories[0].dropped.size, 0);
  assert.equal(G.summarize(course).remaining, 33.33333333);
  Object.assign(group.items[2], {status:"excluded",score:null});
  assert.equal(G.summarize(course).remaining, 0);
  assert.equal(G.summarize(course).pending.length, 1);
  assert.equal(G.forecast(course, {}, "q3", 100), 80);
  group.dropLowest = 3;
  assert.equal(G.summarize(course).known, false);
  assert.ok(G.summarize(course).issues.some(issue => issue.code === "dropCount"));
});

test("forecast accounts for a pending quiz replacing a lower recorded score", () => {
  const course = plan([90, 80, null], 1);
  assert.equal(G.forecast(course, {}, "q2", 0), 85);
  assert.equal(G.forecast(course, {}, "q2", 75), 85);
  assert.equal(G.forecast(course, {}, "q2", 96), 93);
  const goal = G.linkedForecast(course, {driver:"total",goal:93,focus:"q2"});
  assert.ok(Math.abs(goal.score - 96) < 1e-6);
  assert.equal(goal.actual, 93);
  assert.equal(G.required(course, 84, {}, "q2").needed, 0);
  const impossible = G.linkedForecast(course, {driver:"total",goal:99,focus:"q2"});
  assert.equal(impossible.status, "unreachable");
  assert.equal(impossible.maximum, 95);
});

test("equal weight drops work with different maxima, while unequal total-points drops need review", () => {
  const {categories:[category]} = plan([90, 80, 60], 1);
  Object.assign(category.items[2], {score:8,max:10});
  assert.equal(G.categorySummary(category).known,true);
  category.method = "points";
  assert.ok(G.categorySummary(category).issues.some(issue => issue.code === "dropPoints"));
  assert.equal(G.categorySummary(category).known,false);
});

test("recognizes written numbers and top-group clauses, and rejects conditional wording", () => {
  for (const [quote,count,total,planned] of [
    ["drop the lowest quiz score",1,null],
    ["The lowest two quiz marks will be dropped.",2,null],
    ["Best eight quizzes out of ten",2,10],
    ["only the best five count",1,6,6],
    ["小测10次中取最高8次",2,10],
    ["小测去掉最低的两次",2,null],
  ]) assert.deepEqual(readDropRule(quote,planned),{count,total},quote);
  assert.equal(readDropRule("Drop the lowest quiz if all quizzes were attempted."),null);
  assert.equal(readDropRule("Lowest quiz will not be dropped."),null);
});

function fixture({quote="Best 8 of 10", actual=quote, count=2, specialRule=""}={}) {
  const document = {id:"syllabus",title:"Syllabus",text:"Quizzes 100%\n" + actual,updatedAt:"v1"};
  let saved;
  const db = {
    getCourse:async()=>({id:"course"}),listDocuments:async()=>[document],getGradePlan:async()=>({categories:[],version:0}),
    saveGradePlan:async(user,course,body)=>{saved={...body,version:1};return saved;}
  };
  const output = {categories:[{name:"Quizzes",weight:100,evidence:"Quizzes 100%",dropLowest:count,dropEvidence:quote,specialRule,sourceRefs:[{documentId:document.id,quote:"Quizzes 100%"}]}]};
  const service = createGradePlanner({db,apiKey:"fixture",model:"fixture",request:async()=>Response.json({output:[{content:[{type:"output_text",text:JSON.stringify(output)}]}]})});
  return {service,document,saved:()=>saved};
}

test("both saved materials and direct uploads apply clear drop rules, but unsupported ones stay in review", async () => {
  for (const route of ["saved","upload"]) {
    for (const input of [{}, {actual:"Best 9 of 10"}, {count:1}, {specialRule:"Missed-quiz weight transfers to the final"}, {quote:"Drop the lowest two if all quizzes were attempted"}]) {
      const {service,document,saved} = fixture(input);
      const result = route === "saved"
        ? await service.extractMaterials("user","course",{documentIds:[document.id],autoSave:true,version:0})
        : await service.recognize("user","course",{kind:"syllabus",name:"Syllabus.txt",mime:"text/plain",dataUrl:"data:text/plain;base64,"+Buffer.from(document.text).toString("base64"),autoSave:true,version:0});
      if (Object.keys(input).length) {
        assert.equal(saved(),undefined);
        assert.equal(result.reviewReason.code,"unclear");
      } else {
        assert.equal(result.savedPlan.categories[0].dropLowest,2);
        assert.equal(result.savedPlan.categories[0].plannedCount,10);
        assert.equal(result.savedPlan.categories[0].items.length,10);
        assert.equal(result.savedPlan.categories[0].method,"equal");
      }
    }
  }
});

test("re-extraction preserves explicit manual choices and upgrades an identical legacy drop note", () => {
  const old = plan([70, 80, 90], 0).categories[0];
  const recognized = {...old, dropLowest:1,dropEvidence:"Best 2 of 3",items:[]};
  assert.ok(mergeClearRules([old],[recognized]).conflicts.some(issue => issue.field === "dropLowest"));
  const legacy = {...old,dropLowest:undefined,specialRule:"Best 2 of 3"};
  const merged = mergeClearRules([legacy],[recognized]);
  assert.deepEqual(merged.conflicts,[]);
  assert.deepEqual(merged.categories[0].items,legacy.items);
  assert.equal(merged.categories[0].specialRule,"");
  const absent = {...recognized,dropLowest:null,dropEvidence:""};
  assert.equal(mergeClearRules([old],[absent]).categories[0].dropLowest,0);
});
