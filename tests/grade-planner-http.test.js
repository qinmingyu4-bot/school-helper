"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { StudyBridgeDatabase } = require("../lib/database");

test("account grades enforce ownership, CSRF, revision checks, private persistence and reviewed AI reads", { timeout: 30000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sb-grades-http-"));
  const file = path.join(directory, "db.json");
  let child, base;
  async function stop() { if (child && child.exitCode === null) { const exit = once(child, "exit"); child.kill(); await exit; } }
  t.after(async () => { await stop(); await fs.rm(directory, { recursive:true, force:true }); });
  async function start() {
    child = spawn(process.execPath, ["--require", "./tests/fixtures/grade-ai.js", "server.js"], { cwd:path.resolve(__dirname,".."), env: {
      ...process.env, PORT:"0", NODE_ENV:"test", STUDYBRIDGE_DB:"local", LOCAL_DB_FILE:file, LOCAL_DB_BACKUP_DISABLED:"true", REQUIRE_EMAIL_VERIFICATION:"false",
      OPENAI_API_KEY:"test-fixture", OPENAI_COMPLEX_MODEL:"gpt-6.1-sol", OPENAI_WEB_SEARCH:"false", SESSION_SECRET:"grade-test-session" }, stdio:["ignore","pipe","pipe"] });
    base = await new Promise((resolve,reject) => {
      let output="", errors=""; const timeout=setTimeout(()=>reject(new Error(errors || "Server timed out")),10000);
      child.stderr.on("data", c=>errors+=c); child.once("exit",()=>{clearTimeout(timeout);reject(new Error(errors));});
      child.stdout.on("data", c=>{output+=c; const match=output.match(/http:\/\/localhost:(\d+)/); if(match){clearTimeout(timeout);resolve(`http://127.0.0.1:${match[1]}`);}});
    });
  }
  await start();
  const req = (route,cookie="",body,method=body?"POST":"GET",headers={}) => fetch(base+route,{method,headers:{cookie,"content-type":"application/json",...headers},...(body?{body:JSON.stringify(body)}:{})});
  const register = async (name) => { const r=await req("/api/auth/register","",{name,email:`${name}@example.test`,password:"GradeTest2026!",passwordConfirm:"GradeTest2026!"}); assert.equal(r.status,201); return r.headers.get("set-cookie").split(";")[0]; };
  const alice=await register("gradealice"), bob=await register("gradebob");
  assert.equal((await req("/api/grade-planner")).status,401);
  assert.equal((await fetch(base+"/grades.html",{redirect:"manual"})).status,302);
  const course=(await (await req("/api/courses",alice,{name:"Calculus"})).json()).course;
  const bootstrap=await req("/api/grade-planner",alice); assert.match(bootstrap.headers.get("cache-control"),/private.*no-store/);
  const snapshot=await bootstrap.json(); assert.equal(snapshot.courses[0].categories.length,0);
  const headers={"x-csrf-token":snapshot.csrfToken,origin:base}; const route=`/api/grade-planner/${course.id}`;
  assert.equal((await req(route+"/locations")).status,401);
  assert.equal((await req(route+"/locations",bob)).status,404);
  const reference=(await(await req(`/api/courses/${course.id}/documents`,alice,{title:"Syllabus.txt",text:"Homework grades can be checked at https://gradescope.example.edu/courses/123.\nQuiz grades can be checked in Quercus > Grades."})).json()).document;
  await req(`/api/courses/${course.id}/documents`,alice,{title:"[SCHEDULE_ITEM] Reminder",type:"Schedule",text:"Homework grades https://ignore.example.edu/grades"});
  const other=(await(await req("/api/courses",alice,{name:"Other course"})).json()).course;
  await req(`/api/courses/${other.id}/documents`,alice,{title:"Other syllabus",text:"Homework grades are posted at https://foreign-course.example.edu/grades."});
  const sourcesResponse=await req(route+"/locations",alice);
  assert.match(sourcesResponse.headers.get("cache-control"),/private.*no-store/);
  const sources=await sourcesResponse.json(); assert.equal(sources.checkedCount,1); assert.equal(sources.locations.length,2);
  assert.equal(sources.locations[0].documentId,reference.id); assert.equal(sources.locations[0].sourceName,"Syllabus.txt"); assert.match(sources.locations[0].quote,/Homework grades/);
  assert.ok(!JSON.stringify(sources).includes("foreign-course"));
  await req(`/api/courses/${course.id}/documents/${reference.id}`,alice,{title:"Updated syllabus.txt",text:"Homework grades can be viewed at https://new.example.edu/grades."},"PATCH");
  const refreshed=await(await req(route+"/locations",alice)).json(); assert.equal(refreshed.locations.length,1); assert.equal(refreshed.locations[0].url,"https://new.example.edu/grades");
  await req(`/api/courses/${course.id}/documents/${reference.id}`,alice,undefined,"DELETE");
  assert.equal((await(await req(route+"/locations",alice)).json()).locations.length,0);
  const plan={version:0,source:"Manual",categories:[{id:"cat1",name:"Homework",weight:100,method:"equal",plannedCount:2,specialRule:"",evidence:"",items:[{id:"hw1",name:"Homework 1",score:0,max:20,status:"graded"},{id:"hw2",name:"Homework 2",score:null,max:20,status:"pending"}]}]};
  assert.equal((await req(route,alice,plan,"PUT")).status,403);
  assert.equal((await req(route,alice,plan,"PUT",{...headers,origin:"https://other.test"})).status,403);
  const bobToken=(await(await req("/api/grade-planner",bob)).json()).csrfToken;
  assert.equal((await req(route,bob,plan,"PUT",{"x-csrf-token":bobToken})).status,404);
  assert.equal((await req(route,alice,plan,"PUT",headers)).status,200);
  // Retrying a lost successful response is safe; different stale edits are not.
  assert.equal((await req(route,alice,plan,"PUT",headers)).status,200);
  assert.equal((await req(route,alice,{...plan,source:"stale"},"PUT",headers)).status,409);
  assert.equal((await req(route,alice,{...plan,version:1,categories:[{...plan.categories[0],weight:90}]},"PUT",headers)).status,400);
  assert.equal((await req(route,alice,{...plan,version:1,categories:[{...plan.categories[0],gradeLinks:[{url:"javascript:alert(1)"}]}]},"PUT",headers)).status,400);
  const withLink={...plan,version:1,categories:[{...plan.categories[0],gradeLinks:[{url:"https://manual.example.edu/grades",origin:"manual",label:"Course grades"}],gradeDirections:[{quote:"Homework grades are posted in Quercus > Grades.",sourceName:"syllabus.txt",page:2}]}]};
  assert.equal((await req(route,alice,withLink,"PUT",headers)).status,200);
  const image="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH2sAAAAASUVORK5CYII=";
  const read=await req(route+"/recognize",alice,{kind:"grades",name:"grades.png",mime:"image/png",dataUrl:image},"POST",headers);
  assert.equal(read.status,200); assert.equal((await read.json()).rows[0].score,18);
  let current=(await(await req("/api/grade-planner",alice)).json()).courses.find(c=>c.id===course.id); assert.equal(current.version,2); assert.equal(current.categories[0].items[0].score,0); assert.equal(current.categories[0].gradeLinks[0].url,"https://manual.example.edu/grades");
  const usage=(await(await req("/api/me/ai-usage",alice)).json()).usage; assert.ok(usage.usedUsd>0); assert.equal(usage.pendingUsd,0);
  const syllabus=await req(route+"/recognize",alice,{kind:"syllabus",name:"syllabus.txt",mime:"text/plain",dataUrl:"data:text/plain;base64,SG9tZXdvcmsgNDAlLCBGaW5hbCA2MCU="},"POST",headers);
  assert.equal(syllabus.status,200); assert.equal((await syllabus.json()).categories.length,2);
  assert.equal((await req(route+"/recognize",alice,{kind:"grades",name:"bad.png",mime:"image/png",dataUrl:"data:image/png;base64,YmFk"},"POST",headers)).status,400);
  // Reuse already-uploaded course material: extraction is a private read, confirmation is the only write.
  const savedText="Homework 40% — 2 equally weighted assignments.\nFinal 60% — one exam.\nHomework grades can be viewed at https://grades.example.edu/homework.\nFinal grades are posted in Quercus > Grades.";
  const savedDoc=(await(await req(`/api/courses/${course.id}/documents`,alice,{title:"Saved syllabus.txt",text:savedText})).json()).document;
  assert.equal((await req(route+"/materials")).status,401);
  assert.equal((await req(route+"/materials",bob)).status,404);
  const catalogResponse=await req(route+"/materials",alice);
  assert.match(catalogResponse.headers.get("cache-control"),/private.*no-store/);
  const catalog=await catalogResponse.json();
  assert.equal(catalog.version,2);assert.equal(catalog.materials.length,1);assert.equal(catalog.materials[0].id,savedDoc.id);
  assert.equal(catalog.materials[0].suggested,true);assert.equal(catalog.materials[0].text,undefined);
  const selection={documentIds:[savedDoc.id],version:2};
  assert.equal((await req(route+"/extract-materials",alice,selection)).status,403);
  assert.equal((await req(route+"/extract-materials",bob,selection,"POST",{"x-csrf-token":bobToken})).status,404);
  assert.equal((await req(route+"/extract-materials",alice,{...selection,documentIds:[savedDoc.id,savedDoc.id]},"POST",headers)).status,400);
  assert.equal((await req(route+"/extract-materials",alice,{...selection,documentIds:["foreign-document"]},"POST",headers)).status,400);
  assert.equal((await req(route+"/extract-materials",alice,{...selection,version:1},"POST",headers)).status,409);
  const extract=async()=>{const response=await req(route+"/extract-materials",alice,selection,"POST",headers);assert.equal(response.status,200);return response.json();};
  let draft=await extract();
  assert.equal(draft.categories[0].ruleEvidence[0].sourceName,"Saved syllabus.txt");assert.equal(draft.categories[0].ruleEvidence[0].verified,true);
  assert.equal(draft.categories[0].gradeLinks[0].url,"https://grades.example.edu/homework");
  assert.ok(draft.categories[1].gradeDirections.some(d=>/Quercus/.test(d.quote)));
  current=(await(await req("/api/grade-planner",alice)).json()).courses.find(c=>c.id===course.id);
  assert.equal(current.version,2);assert.equal(current.categories.length,1);assert.equal(current.categories[0].items[0].score,0);
  const confirm=()=>({version:2,source:"Saved syllabus.txt",sourceReview:draft.sourceReview,categories:draft.categories.map((category,index)=>({...category,id:index?"final":"cat1",items:index?category.items:current.categories[0].items}))});
  await req(`/api/courses/${course.id}/documents/${savedDoc.id}`,alice,{title:"Saved syllabus.txt",text:savedText+"\nUpdated course note."},"PATCH");
  assert.equal((await req(route,alice,confirm(),"PUT",headers)).status,409);
  assert.equal((await(await req("/api/grade-planner",alice)).json()).courses.find(c=>c.id===course.id).version,2);
  draft=await extract();const confirmation=confirm();
  assert.equal((await req(route,alice,confirmation,"PUT",headers)).status,200);
  assert.equal((await req(route,alice,confirmation,"PUT",headers)).status,200);
  current=(await(await req("/api/grade-planner",alice)).json()).courses.find(c=>c.id===course.id);
  assert.equal(current.version,3);assert.equal(current.categories[0].items[0].score,0);assert.equal(current.ruleSources[0].id,savedDoc.id);
  assert.equal(current.categories[0].ruleEvidence[0].quote,"Homework 40%");

  const createCourse = async name => (await (await req("/api/courses", alice, { name })).json()).course;
  const uploaded = await createCourse("Uploaded syllabus auto-save");
  const uploadRoute = `/api/grade-planner/${uploaded.id}/recognize`;
  const upload = async (text, version = 0) => {
    const response = await req(uploadRoute, alice, {
      kind: "syllabus", name: "Syllabus.txt", mime: "text/plain", version, autoSave: true,
      dataUrl: `data:text/plain;base64,${Buffer.from(text).toString("base64")}`
    }, "POST", headers);
    assert.equal(response.status, 200);
    return response.json();
  };
  assert.equal((await upload("Homework 40%\nFinal 60%\nDrop the lowest homework")).savedPlan, undefined);
  assert.equal((await upload("Homework 50%\nFinal 50%")).savedPlan, undefined);
  const savedUpload = (await upload("Homework 40%\nFinal 60%\nHomework count is unspecified")).savedPlan;
  assert.equal(savedUpload.version, 1);
  assert.equal(savedUpload.categories[0].method, "unknown");
  assert.equal(savedUpload.categories[0].weight, 40);
  assert.equal(savedUpload.categories[1].items[0].status, "pending");
  assert.equal((await upload("Homework 40%\nFinal 60%", 1)).savedPlan, undefined);

  const reused = await createCourse("Saved syllabus auto-save");
  const reusedDoc = (await (await req(`/api/courses/${reused.id}/documents`, alice,
    { title: "Syllabus.txt", text: savedText })).json()).document;
  const reusedRoute = `/api/grade-planner/${reused.id}/extract-materials`;
  const reuse = { version: 0, autoSave: true, documentIds: [reusedDoc.id] };
  const savedReuse = (await (await req(reusedRoute, alice, reuse, "POST", headers)).json()).savedPlan;
  assert.equal(savedReuse.version, 1);
  assert.equal(savedReuse.ruleSources[0].id, reusedDoc.id);
  assert.equal(savedReuse.categories[0].items.length, 2);
  assert.equal((await req(reusedRoute, alice, reuse, "POST", headers)).status, 409);
  const autoPlans = (await (await req("/api/grade-planner", alice)).json()).courses;
  assert.equal(autoPlans.find(value => value.id === uploaded.id).version, 1);
  assert.equal(autoPlans.find(value => value.id === reused.id).version, 1);
  for (const value of [uploaded, reused]) await req(`/api/courses/${value.id}`, alice, undefined, "DELETE");
  await stop(); await start();
  current=(await(await req("/api/grade-planner",alice)).json()).courses.find(c=>c.id===course.id); assert.equal(current.version,3); assert.equal(current.categories[0].items[1].score,null); assert.equal(current.categories[0].ruleEvidence[0].sourceName,"Saved syllabus.txt"); assert.equal(current.categories[1].gradeDirections[0].quote.includes("Quercus"),true);
  assert.equal((await(await req("/api/grade-planner",bob)).json()).courses.length,0);
  assert.equal((await req(`/api/courses/${course.id}`,alice,undefined,"DELETE")).status,200);
  await stop(); const raw=JSON.parse(await fs.readFile(file)); assert.equal(Object.keys(raw.gradePlans).length,0);
});

test("cloud grade plans condition transactions on both plan and course revisions", async () => {
  const db=new StudyBridgeDatabase(); let writes;
  db.dynamo={get:async(_pk,sk)=>sk.endsWith("#GRADES")?null:{id:"course1",userId:"alice"},transactPut:async(value)=>{writes=value;}};
  const plan=await db.saveGradePlan("alice","course1",{version:0,categories:[],source:""});
  assert.equal(plan.version,1); assert.equal(writes[0].createOnly,true); assert.equal(writes[1].checkOnly,true); assert.equal(writes[1].expectedData.userId,"alice");
  db.dynamo.transactPut=async()=>{throw Object.assign(new Error("conflict"),{code:"TransactionCanceledException"});};
  await assert.rejects(db.saveGradePlan("alice","course1",{version:0,categories:[]}),{statusCode:409});
});
