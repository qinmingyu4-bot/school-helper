"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { supportsWeight, mergeClearRules } = require("../lib/grade-rule-defaults");
const { createGradePlanner } = require("../lib/grade-planner-service");
const categories = () => [
  { name:"Homework", weight:40, method:"equal", plannedCount:2, specialRule:"", evidence:"Homework 40% · Final 60%", items:[] },
  { name:"Final", weight:60, method:"equal", plannedCount:1, specialRule:"", evidence:"Homework 40% · Final 60%", items:[{id:"incoming-final",name:"Final exam",score:null,max:100,status:"pending"}] }
];
const existing = () => [
  { id:"hw", name:"Homework", weight:40, method:"unknown", plannedCount:null, specialRule:"", gradeLinks:[{url:"https://example.edu/custom",origin:"manual"}], items:[{id:"hw1",name:"Homework 1",score:0,max:20,status:"graded",source:"screenshot"}] },
  { id:"final", name:"Final", weight:60, method:"equal", plannedCount:1, specialRule:"", items:[{id:"f1",name:"Final",score:null,max:null,status:"pending"}] }
];

test("whole-table evidence binds each category to its own percentage", () => {
  const list = categories();
  for (const quote of ["Homework 40% · Final 60%", "Homework\n40 percent\nFinal\n60 percent", "40% Homework\n60% Final", "Homework ４０％ / Final ６０％"]) {
    for (const category of list) assert.equal(supportsWeight(category,quote,list),true,quote);
  }
  for (const quote of ["Homework 60% · Final 40%", "Homework 40% or 50% · Final 60%", "Homework 40% · Final 60% · Homework 50%", "NotHomework 40% · Final 60%"]) assert.equal(supportsWeight(list[0],quote,list),false,quote);
});

test("re-extraction fills missing details while preserving IDs, zero grades, maxima and manual links", () => {
  const old = existing(), before=structuredClone(old);
  const result=mergeClearRules(old,categories());
  assert.deepEqual(result.conflicts,[]);
  assert.equal(result.categories[0].id,"hw");
  assert.deepEqual(result.categories[0].items[0],old[0].items[0]);
  assert.equal(result.categories[0].items[1].status,"pending");
  assert.equal(result.categories[0].method,"equal");
  assert.equal(result.categories[0].plannedCount,2);
  assert.equal(result.categories[0].gradeLinks[0].origin,"manual");
  assert.equal(result.categories[1].items[0].id,"f1");
  assert.equal(result.categories[1].items[0].max,100);
  assert.deepEqual(old,before);
  const again=mergeClearRules(result.categories,categories());
  assert.deepEqual(again.conflicts,[]);
  assert.deepEqual(again.categories,result.categories);
});

test("known settings, unmatched records and ambiguous item mappings are never overwritten automatically", () => {
  for (const [field,change] of [
    ["weight", c=>c[0].weight=50], ["plannedCount",c=>c[0].plannedCount=3],
    ["method",c=>c[0].method="points"], ["specialRule",c=>c[0].specialRule="Drop lowest"],
    ["max",c=>c[1].items[0].max=50], ["category",c=>c[0].name="Assignments"],
    ["items",c=>c[0].items.push({...c[0].items[0],id:"duplicate"})]
  ]) {
    const old=existing();change(old);const before=structuredClone(old);
    assert.ok(mergeClearRules(old,categories()).conflicts.some(issue=>issue.field===field),field);
    assert.deepEqual(old,before);
  }
  const old=existing();old[0].plannedCount=2;old[0].method="points";
  const incoming=categories();incoming[0].plannedCount=null;incoming[0].method="unknown";
  const result=mergeClearRules(old,incoming);
  assert.deepEqual(result.conflicts,[]);
  assert.equal(result.categories[0].plannedCount,2);assert.equal(result.categories[0].method,"points");
});

function fixture({old=[],warnings=[],text="Homework 40% · Final 60%",native=false,long=false}={}) {
  let plan={version:1,categories:structuredClone(old)},writes=0;
  const doc={id:"doc",title:"Syllabus.pdf",text:native?"No readable text extracted":(long?"Course description. ".repeat(2000):"")+text,hasSourcePdf:native,updatedAt:"v1"};
  const db={getCourse:async()=>({id:"course"}),getGradePlan:async()=>structuredClone(plan),listDocuments:async()=>[doc],readMaterial:async()=>({dataUrl:`data:application/pdf;base64,${Buffer.from("%PDF-fixture").toString("base64")}`,pages:1}),saveGradePlan:async(user,id,input)=>{assert.equal(input.version,plan.version);writes++;plan={...input,version:plan.version+1};return structuredClone(plan);}};
  const service=createGradePlanner({db,apiKey:"fixture",model:"fixture",request:async()=>Response.json({output:[{content:[{type:"output_text",text:JSON.stringify({categories:categories().map(c=>({...c,sourceRefs:[{documentId:"doc",quote:"Homework 40% · Final 60%",page:1}]})),warnings})}]}]})});
  return {service,plan:()=>plan,writes:()=>writes};
}

test("saved clear rules auto-save for existing courses and long source passages",async()=>{
  for (const long of [false,true]) {
    const f=fixture({old:existing(),long});
    const result=await f.service.extractMaterials("user","course",{version:1,autoSave:true,documentIds:["doc"]});
    assert.equal(result.savedPlan.version,2);
    assert.equal(result.savedPlan.categories[0].items[0].score,0);
    assert.equal(f.writes(),1);
    await assert.rejects(f.service.extractMaterials("user","course",{version:1,autoSave:true,documentIds:["doc"]}),{statusCode:409});
  }
});

test("clear native PDF readings can save; ambiguity warnings keep them in review",async()=>{
  for (const warnings of [[],["The scan is blurry; Homework weight is uncertain"]]) {
    const f=fixture({native:true,warnings});
    const result=await f.service.extractMaterials("user","course",{version:1,autoSave:true,documentIds:["doc"]});
    assert.equal(!!result.savedPlan,!warnings.length);
    assert.equal(f.writes(),warnings.length?0:1);
    if(result.savedPlan) assert.equal(result.savedPlan.categories[0].ruleEvidence[0].verified,false);
  }
});

test("conflicts return specific reasons without saving and ordinary draft requests remain read-only",async()=>{
  const old=existing();old[0].method="points";const f=fixture({old});
  const result=await f.service.extractMaterials("user","course",{version:1,autoSave:true,documentIds:["doc"]});
  assert.equal(result.savedPlan,undefined);assert.equal(result.reviewReason.code,"conflict");
  assert.ok(result.reviewReason.details.some(issue=>issue.name==="Homework"&&issue.field==="method"));
  assert.equal(f.writes(),0);assert.deepEqual(f.plan().categories,old);
  const clean=fixture();assert.equal((await clean.service.extractMaterials("user","course",{version:1,documentIds:["doc"]})).savedPlan,undefined);
  assert.equal(clean.writes(),0);
});

test("cancelled auto-save never writes",async()=>{
  const f=fixture();const controller=new AbortController();controller.abort();
  await assert.rejects(f.service.extractMaterials("user","course",{version:1,autoSave:true,documentIds:["doc"]},controller.signal),{name:"AbortError"});
  assert.equal(f.writes(),0);
});
