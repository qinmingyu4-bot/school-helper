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
  const image="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH2sAAAAASUVORK5CYII=";
  const read=await req(route+"/recognize",alice,{kind:"grades",name:"grades.png",mime:"image/png",dataUrl:image},"POST",headers);
  assert.equal(read.status,200); assert.equal((await read.json()).rows[0].score,18);
  let current=(await(await req("/api/grade-planner",alice)).json()).courses[0]; assert.equal(current.version,1); assert.equal(current.categories[0].items[0].score,0);
  const usage=(await(await req("/api/me/ai-usage",alice)).json()).usage; assert.ok(usage.usedUsd>0); assert.equal(usage.pendingUsd,0);
  const syllabus=await req(route+"/recognize",alice,{kind:"syllabus",name:"syllabus.txt",mime:"text/plain",dataUrl:"data:text/plain;base64,SG9tZXdvcmsgNDAlLCBGaW5hbCA2MCU="},"POST",headers);
  assert.equal(syllabus.status,200); assert.equal((await syllabus.json()).categories.length,2);
  assert.equal((await req(route+"/recognize",alice,{kind:"grades",name:"bad.png",mime:"image/png",dataUrl:"data:image/png;base64,YmFk"},"POST",headers)).status,400);
  await stop(); await start();
  current=(await(await req("/api/grade-planner",alice)).json()).courses[0]; assert.equal(current.version,1); assert.equal(current.categories[0].items[1].score,null);
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
