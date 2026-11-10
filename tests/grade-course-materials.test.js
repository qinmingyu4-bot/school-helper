"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const M=require("../lib/grade-course-materials");
const {createGradePlanner}=require("../lib/grade-planner-service");
const {StudyBridgeDatabase}=require("../lib/database");
const doc={id:"syllabus",title:"Syllabus.pdf",type:"Material",text:"Course information\nHomework 40%\nFinal 60%",sourcePages:[{page:2,start:19,end:100}],updatedAt:"2026-11-10"};
const output=(sourceRefs=[{documentId:doc.id,quote:"Homework 40%",page:99}])=>JSON.stringify({categories:[{name:"Homework",weight:40,method:"equal",plannedCount:2,items:[],sourceRefs}]});

test("saved source extraction grounds evidence and pages without trusting model citations",async()=>{
  const prepared=await M.prepare([doc],()=>assert.fail("readable saved text must not reload an original"));
  assert.match(prepared.content[0].text,/Source documentId: syllabus/);
  const request=M.requestBody(prepared,"test-model");
  assert.equal(request.store,false);assert.match(request.instructions,/untrusted/);
  const result=M.parse(output(),prepared),ref=result.categories[0].ruleEvidence[0];
  assert.equal(ref.sourceName,doc.title);assert.equal(ref.page,2);assert.equal(ref.verified,true);
  assert.equal(result.sources[0].revision,M.revision(doc));
  assert.throws(()=>M.parse(output([{documentId:"foreign",quote:"Homework 40%"}]),prepared),{statusCode:502});
  assert.throws(()=>M.parse(output([{documentId:doc.id,quote:"Homework 99%"}]),prepared),{statusCode:502});
  assert.throws(()=>M.reviewSources([{...M.reference(doc),id:""}]),{statusCode:400});
  assert.throws(()=>M.assertCurrent([M.reference(doc)],[{...doc,text:"changed"}]),{statusCode:409});
});

test("saved materials suggest syllabus and grading sources, exclude schedules, and inspect long file tails",async()=>{
  assert.equal(M.describe(doc).suggested,true);
  assert.equal(M.describe({...doc,title:"Slides",text:"Discussion of derivatives"}).suggested,false);
  assert.equal(M.eligible({...doc,type:"Schedule"}),false);
  assert.equal(M.eligible({...doc,title:"[SCHEDULE_ITEM] Exam"}),false);
  assert.equal(M.describe({...doc,text:"No readable text extracted",hasSourcePdf:false}).canExtract,false);
  const long={...doc,text:"Generic course reading. ".repeat(4000)+"\nFinal exam 60% of the course grade.\nHomework 40%"};
  const prepared=await M.prepare([long]);
  assert.equal(prepared.sources[0].excerpted,true);assert.match(prepared.content[0].text,/Final exam 60%/);
  await assert.rejects(M.prepare([{...doc,text:"",hasSourcePdf:false}]),{statusCode:400});
});

test("unreadable saved PDFs reuse the retained original and label unverified quotes",async()=>{
  const original={dataUrl:"data:application/pdf;base64,"+Buffer.from("%PDF-test").toString("base64"),pages:3};
  const prepared=await M.prepare([{...doc,text:"No readable document text was extracted",hasSourcePdf:true}],async id=>{assert.equal(id,doc.id);return original;});
  assert.equal(prepared.content[1].type,"input_file");
  const ref=M.parse(output([{documentId:doc.id,quote:"Homework 40%",page:2}]),prepared).categories[0].ruleEvidence[0];
  assert.equal(ref.verified,false);assert.equal(ref.page,2);
  assert.equal(M.parse(output(),prepared).categories[0].ruleEvidence[0].page,null);
});

test("source changes during AI extraction reject the draft and never write grades",async()=>{
  let current=doc;
  const db={getCourse:async()=>({id:"course"}),listDocuments:async()=>[current],getGradePlan:async()=>({version:1}),readMaterial:async()=>null};
  const service=createGradePlanner({db,apiKey:"fixture",model:"test",request:async()=>{
    current={...doc,text:"changed after reading"};
    return Response.json({output:[{content:[{type:"output_text",text:output()}]}]});
  }});
  await assert.rejects(service.extractMaterials("alice","course",{documentIds:[doc.id],version:1}),{statusCode:409});
});

test("cloud confirmation guards both saved document metadata and hydrated text manifests",async()=>{
  const db=new StudyBridgeDatabase(),raw={...doc,text:"",materialStored:true,userId:"alice",courseId:"course"},manifest={parts:1,updatedAt:"revision-1"};
  let writes;
  db.dynamo={get:async(pk,sk)=>sk.endsWith("#GRADES")?null:sk===`COURSE#course#DOC#${doc.id}`?raw:sk===`DOC#${doc.id}#META`?manifest:{id:"course",userId:"alice"},transactPut:async entries=>{writes=entries;}};
  db.readMaterial=async()=>({text:doc.text});
  const input={version:0,categories:[],source:"Saved syllabus",sourceReview:{version:0,sources:[M.reference({...raw,text:doc.text})]}};
  const result=await db.saveGradePlan("alice","course",input);
  assert.equal(result.ruleSources[0].revision,input.sourceReview.sources[0].revision);
  assert.equal(writes.length,4);assert.equal(writes[2].checkOnly,true);assert.deepEqual(writes[2].expectedData,raw);
  assert.equal(writes[3].checkOnly,true);assert.deepEqual(writes[3].expectedData,manifest);
  db.readMaterial=async()=>null;
  await assert.rejects(db.saveGradePlan("alice","course",input),{statusCode:409});
  db.dynamo.get=async(_pk,sk)=>sk.endsWith("#GRADES")?result:sk.includes("#DOC#")?null:{id:"course",userId:"alice"};
  assert.equal((await db.saveGradePlan("alice","course",input)).version,1,"lost successful confirmation can be safely retried");
});
