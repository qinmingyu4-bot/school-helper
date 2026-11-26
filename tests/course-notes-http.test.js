const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { createHash } = require("node:crypto");
const { courseFileBytes, courseRequestBytes } = require("../public/upload-limits");

test("course notes HTTP isolates users, persists and guards concurrent saves", {timeout:45000}, async t => {
  const root = path.resolve(__dirname, "..");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-large-upload-"));
  const database = path.join(directory, "db.json");
  let child, base;
  async function stop() {
    if (child?.exitCode !== null || !child) return;
    const stopped = once(child, "exit");
    child.kill();
    await stopped;
  }
  t.after(async () => { await stop(); await fs.rm(directory, { recursive: true, force: true }); });
  async function start() {
    child = spawn(process.execPath, ["server.js"], { cwd: root, env: {
      ...process.env, NODE_ENV: "test", PORT: "0", STUDYBRIDGE_DB: "local", LOCAL_DB_FILE: database,
      LOCAL_DB_BACKUP_DISABLED: "true", SESSION_SECRET: "large-upload-test-session", REQUIRE_INVITE_CODE: "false",
      REQUIRE_EMAIL_VERIFICATION: "false", OPENAI_API_KEY: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: ""
    }, stdio: ["ignore", "pipe", "pipe"] });
    base = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("Server startup timed out")), 10000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/http:\/\/localhost:(\d+)/);
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  }
  await start();
  async function request(route, body, cookie = "", method = "POST") {
    const response = await fetch(base + route, { method, headers: { "content-type": "application/json", cookie },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, cookie: response.headers.get("set-cookie")?.split(";")[0], data: await response.json() };
  }

  const account=await request('/api/auth/register',{name:'Notes Test',email:'notes@example.test',password:'Notes-Test-2026!',passwordConfirm:'Notes-Test-2026!'});
  assert.equal(account.status,201);const cookie=account.cookie;
  const created=await request('/api/courses',{name:'Notes course'},cookie);const c=created.data.course.id;
  const bytes=await fs.readFile(path.join(root,'tests/fixtures/schedule-full.pdf'));
  const upload=await request(`/api/courses/${c}/documents`,{fileName:'slides.pdf',fileType:'application/pdf',fileData:bytes.toString('base64')},cookie);
  assert.equal(upload.status,201);const d=upload.data.document.id;
  const route=`/api/courses/${c}/notes/${d}?page=1`;
  assert.equal((await request(route,null,'','GET')).status,401);
  const second=await request('/api/auth/register',{name:'Other',email:'other-notes@example.test',password:'Notes-Test-2026!',passwordConfirm:'Notes-Test-2026!'});
  assert.equal((await request(route,null,second.cookie,'GET')).status,404);
  assert.equal((await fetch(base+`/api/courses/${c}/note-source/${d}`,{headers:{cookie:second.cookie}})).status,404);
  const source=await fetch(base+`/api/courses/${c}/note-source/${d}`,{headers:{cookie}});assert.equal(source.status,200);assert.deepEqual(Buffer.from(await source.arrayBuffer()),bytes);
  const items=[{type:'text',x:.2,y:.3,width:.02,color:'#112233',text:'课堂笔记 / lecture notes'},{type:'sticky',x:.1,y:.2,w:.3,h:.25,background:'#fff2a8',text:'复习重点',ink:[{type:'pen',color:'#112233',width:.01,points:[[.1,.2],[.3,.4]]}]}];
  assert.equal((await request(route,{version:0,items},cookie,'PUT')).status,200);
  assert.equal((await request(route,{version:0,items:[]},cookie,'PUT')).status,409);
  assert.equal((await request(route,{version:1,items:[{type:'bad'}]},cookie,'PUT')).status,400);
  const allRoute=`/api/courses/${c}/notes/${d}?all=true`;
  assert.equal((await request(allRoute,null,'','GET')).status,401);
  assert.equal((await request(allRoute,null,second.cookie,'GET')).status,404);
  assert.deepEqual((await request(allRoute,null,cookie,'GET')).data.pages,[{page:1,version:1,items}]);
  const eco=(await request('/api/courses',{name:'ECO101 Economics',term:'Fall'},cookie)).data.course;
  const autoFile={fileName:'ECO_101_week02.pdf',fileType:'application/pdf',fileData:bytes.toString('base64')};
  assert.equal((await request('/api/course-materials',autoFile)).status,401);
  const filed=await request('/api/course-materials',autoFile,cookie);
  assert.equal(filed.status,201);assert.equal(filed.data.courseId,eco.id);
  const listed=(await request(`/api/courses/${eco.id}/documents`,null,cookie,'GET')).data.documents;
  assert.deepEqual(listed.map(x=>x.id),[filed.data.document.id]);
  assert.equal((await request(`/api/courses/${c}/documents`,null,cookie,'GET')).data.documents.length,1);
  const fromText=(await request('/api/courses',{name:'SBTEST101'},cookie)).data.course;
  const textMatch=await request('/api/course-materials',{...autoFile,fileName:'week02.pdf'},cookie);
  assert.equal(textMatch.status,201,JSON.stringify(textMatch.data));assert.equal(textMatch.data.courseId,fromText.id);
  await request('/api/courses',{name:'ECO101 Economics',term:'Winter'},cookie);
  const ambiguous=await request('/api/course-materials',autoFile,cookie);
  assert.equal(ambiguous.status,200);assert.equal(ambiguous.data.needsCourse,true);assert.equal(ambiguous.data.reason,'ambiguous');
  assert.equal((await request(`/api/courses/${eco.id}/documents`,null,cookie,'GET')).data.documents.length,1);
  const manual=await request('/api/course-materials',{...autoFile,courseId:eco.id},cookie);
  assert.equal(manual.status,201);assert.equal(manual.data.document.courseId,eco.id);
  assert.equal((await request('/api/course-materials',{...autoFile,courseId:eco.id},second.cookie)).status,404);
  const unknown=await request('/api/course-materials',{...autoFile,fileName:'PHY999_notes.pdf'},cookie);
  assert.equal(unknown.data.needsCourse,true);
  assert.equal((await request('/api/course-materials',{...autoFile,fileData:''},cookie)).status,400);

  const blankRoute=`/api/courses/${c}/notes`;
  assert.equal((await request(blankRoute,{},'')).status,401);
  assert.equal((await request(blankRoute,{},second.cookie)).status,404);
  assert.equal((await request('/api/courses/general/notes',{},cookie)).status,403);
  const blank=await request(blankRoute,{title:' 课堂白纸 '},cookie);
  assert.equal(blank.status,201);
  const blankDoc=blank.data.document;
  assert.equal(blankDoc.blankNote,true);
  assert.equal(blankDoc.title,'课堂白纸');
  assert.equal(blankDoc.courseId,c);
  assert.equal(blankDoc.sourcePageCount,1);
  const blankPage=`${blankRoute}/${blankDoc.id}?page=1`;
  const blankSource=`/api/courses/${c}/note-source/${blankDoc.id}`;
  assert.equal((await fetch(base+blankSource,{headers:{cookie:second.cookie}})).status,404);
  const sheet=await fetch(base+blankSource,{headers:{cookie}});
  assert.equal(sheet.status,200);
  assert.equal(sheet.headers.get('content-type'),'application/pdf');
  const { PDFDocument, PageSizes }=require('pdf-lib');
  const pdf=await PDFDocument.load(await sheet.arrayBuffer());
  assert.equal(pdf.getPageCount(),1);
  const { width, height }=pdf.getPage(0).getSize();
  assert.deepEqual([width,height],PageSizes.A4);
  const wide = await request(blankRoute,{title:'横向白纸', orientation:'landscape'},cookie);
  assert.equal(wide.status,201);
  const wideSource = await fetch(base+'/api/courses/'+c+'/note-source/'+wide.data.document.id,{headers:{cookie}});
  const widePdf = await PDFDocument.load(await wideSource.arrayBuffer());
  assert.deepEqual(widePdf.getPage(0).getSize(), {width:height,height:width});
  const reopened = await PDFDocument.load(await (await fetch(base+blankSource,{headers:{cookie}})).arrayBuffer());
  assert.deepEqual(reopened.getPage(0).getSize(), {width,height});
  await request('/api/courses/'+c+'/documents/'+wide.data.document.id,null,cookie,'DELETE');
  assert.deepEqual((await request(blankPage,null,cookie,'GET')).data,{version:0,items:[]});
  assert.equal((await request(`${blankRoute}/${blankDoc.id}?page=2`,null,cookie,'GET')).status,400);
  assert.equal((await request(blankPage,{version:0,items},second.cookie,'PUT')).status,404);
  assert.equal((await request(blankPage,{version:0,items},cookie,'PUT')).status,200);
  assert.equal((await request(blankPage,{version:0,items},cookie,'PUT')).status,409);
  const blankListed=(await request(`/api/courses/${c}/documents`,null,cookie,'GET')).data.documents.find(doc=>doc.id===blankDoc.id);
  assert.equal(blankListed.blankNote,true);

  await stop();await start();
  assert.deepEqual((await request(blankPage,null,cookie,'GET')).data.items,items);
  assert.deepEqual((await request(`${blankRoute}/${blankDoc.id}?all=true`,null,cookie,'GET')).data.pages,[{page:1,version:1,items}]);
  assert.deepEqual((await request(route,null,cookie,'GET')).data.items,items);
  assert.deepEqual((await request(allRoute,null,cookie,'GET')).data.pages,[{page:1,version:1,items}]);
  assert.equal((await request(`/api/courses/${c}/notes/${d}?page=0`,null,cookie,'GET')).status,400);
  assert.equal((await request(`/api/courses/${c}/notes/${d}?page=9999`,null,cookie,'GET')).status,400);
  const module=await fetch(base+'/vendor/pdfjs/pdf.min.mjs');assert.match(module.headers.get('content-type'),/javascript/);
  await request(`/api/courses/${c}/documents/${d}`,null,cookie,'DELETE');
  assert.equal((await request(route,null,cookie,'GET')).status,404);
  assert.equal((await request(allRoute,null,cookie,'GET')).status,404);
  await request(`/api/courses/${c}/documents/${blankDoc.id}`,null,cookie,'DELETE');
  assert.equal((await request(blankPage,null,cookie,'GET')).status,404);
  assert.equal((await fetch(base+blankSource,{headers:{cookie}})).status,404);
  const state=JSON.parse(await fs.readFile(database,'utf8'));assert.equal(Object.keys(state.courseNotes).length,0);
});
