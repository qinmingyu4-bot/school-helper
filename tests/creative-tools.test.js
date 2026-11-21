const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

function harness(courses = [{ id: "math", name: "Math" }, { id: "econ", name: "Economics" }]) {
  const fields = {}, listeners = {}, requests = [];
  let ctx, output = "";
  const document = { hidden: false, getElementById: (id) => fields[id], addEventListener: (type, callback) => { listeners[type] = callback; } };
  const window = { StudyBridgeCheatsheetPrint: require("../public/cheatsheet-print"), StudyBridgeMarkdown: { render: (text) => text } };
  vm.runInNewContext(fs.readFileSync(require.resolve("../public/creative-tools"), "utf8"), { StudyBridgeI18n: require("../public/i18n"), window, document, setTimeout, clearTimeout, confirm: () => true });
  const tools = window.StudyBridgeCreativeTools;
  function render() {
    tools.capture();
    output = tools.html(ctx);
    for (const key of Object.keys(fields)) delete fields[key];
    fields.creativePrompt = { value: output.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1] };
    const selected = output.match(/<option value="([^"]*)" selected/);
    fields.creativeCourse = { value: selected?.[1] || "" };
    for (const key of Object.keys(window.StudyBridgeCheatsheetPrint.defaults)) {
      const input = output.match(new RegExp(`<input id="print-${key}"[^>]*>`));
      const select = output.match(new RegExp(`<select id="print-${key}">([\\s\\S]*?)</select>`));
      fields[`print-${key}`] = input ? { type: key === "monochrome" ? "checkbox" : "number", value: input[0].match(/value="([^"]*)"/)?.[1], checked: input[0].includes("checked") } : { value: select[1].match(/<option value="([^"]*)" selected/)[1] };
    }
  }
  ctx = { userId: "alice", tool: "cheatsheet", courseId: courses[0]?.id || "", courses, esc: (text) => text, render,
    visible: () => true, readFiles: async (files) => files.map((file) => ({ fileName: file.name })),
    selectCourse: (courseId) => { ctx = { ...ctx, courseId }; render(); },
    api: async (route, options) => {
      if (!options) return route.endsWith("capabilities") ? { video: false } : { jobs: [] };
      requests.push(options.body);
      return { job: { ...options.body, id: `job-${requests.length}`, status: "ready", files: [{ id: "pdf", name: "sheet.pdf", extension: "pdf", size: 100 }] } };
    } };
  render();
  return { tools, fields, requests, html: () => output,
    changeCourse: (value) => { fields.creativeCourse.value = value; listeners.change({ target: { id: "creativeCourse", value } }); },
    upload: (name) => listeners.change({ target: { id: "creativeFiles", files: [{ name }] } }),
    action: (action, id) => tools.handle({ dataset: { action, id } }, ctx) };
}

test("course switching preserves isolated drafts, print settings, uploads, revisions and outgoing course IDs", async () => {
  const h = harness();
  h.fields.creativePrompt.value = "Math formulas";
  h.fields["print-columns"].value = "3";
  h.upload("math-notes.txt");
  h.changeCourse("econ");
  assert.equal(h.fields.creativePrompt.value, "");
  assert.equal(h.fields["print-columns"].value, "2");
  assert.doesNotMatch(h.html(), /math-notes.txt/);
  h.fields.creativePrompt.value = "Economic definitions";
  await h.action("creative-generate");
  assert.equal(h.requests[0].courseId, "econ");
  assert.equal(h.requests[0].format, "pdf");
  assert.equal(h.requests[0].attachments.length, 0);
  h.changeCourse("math");
  assert.equal(h.fields.creativePrompt.value, "Math formulas");
  assert.equal(h.fields["print-columns"].value, "3");
  assert.match(h.html(), /math-notes.txt/);
  assert.doesNotMatch(h.html(), /Economic definitions/);
  await h.action("creative-generate");
  assert.equal(h.requests[1].courseId, "math");
  assert.equal(h.requests[1].attachments[0].fileName, "math-notes.txt");
  assert.equal(h.requests[1].cheatsheet.columns, 3);
  await h.action("creative-revise", "job-2");
  h.fields.creativePrompt.value = "Add derivatives";
  h.changeCourse("econ");
  assert.doesNotMatch(h.html(), /修改上一版/);
  h.changeCourse("math");
  assert.match(h.html(), /修改上一版/);
  assert.equal(h.fields.creativePrompt.value, "Add derivatives");
  await h.action("creative-generate");
  assert.equal(h.requests[2].parentId, "job-2");
  assert.equal(h.requests[2].courseId, "math");
  h.tools.stop();
});

test("cheatsheet cannot submit without an available course", async () => {
  const h = harness([]);
  h.fields.creativePrompt.value = "Make a sheet";
  assert.match(h.html(), /data-action="creative-generate" disabled/);
  assert.match(h.html(), /请先在学习区添加课程/);
  await h.action("creative-generate");
  assert.equal(h.requests.length, 0);
  assert.match(h.html(), /请先选择课程/);
});

test("remembered tools course takes priority over study course and falls back after course deletion", () => {
  const source = fs.readFileSync(require.resolve("../public/app"), "utf8");
  const start = source.indexOf("  function creativeContext() {");
  const end = source.indexOf("  function adminPage()", start);
  const saved = new Map([["studybridge.cheatsheetCourse.alice", "econ"]]);
  const state = { user: { id: "alice" }, tool: "cheatsheet", activeCourseId: "math", courses: [{ id: "math" }, { id: "econ" }] };
  const context = vm.createContext({ ui: require("../public/i18n"), state, localStorage: { getItem: (key) => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    cheatsheetCourses: new Map(), api() {}, readFiles() {}, esc() {}, render() {} });
  vm.runInContext(source.slice(start, end), context);
  assert.equal(context.creativeContext().courseId, "econ");
  context.creativeContext().selectCourse("math");
  assert.equal(saved.get("studybridge.cheatsheetCourse.alice"), "math");
  context.creativeContext().selectCourse("foreign-course");
  assert.equal(context.creativeContext().courseId, "math");
  state.courses = [{ id: "econ" }];
  assert.equal(context.creativeContext().courseId, "econ");
  state.user = { id: "bob" };
  state.courses = [];
  assert.equal(context.creativeContext().courseId, "");
});

test("stale video contexts cannot render or submit video production", async () => {
  const document = { addEventListener() {}, getElementById() { return null; } };
  const window = { StudyBridgeCheatsheetPrint: require("../public/cheatsheet-print") };
  vm.runInNewContext(fs.readFileSync(require.resolve("../public/creative-tools"), "utf8"), { StudyBridgeI18n: require("../public/i18n"), window, document, setTimeout, clearTimeout });
  const tools = window.StudyBridgeCreativeTools;
  let calls = 0;
  const ctx = { tool: "video", api: async () => { calls++; }, esc: (text) => text };
  assert.match(tools.html(ctx), /不支持任何形式的视频制作/);
  assert.doesNotMatch(tools.html(ctx), /textarea|creative-generate/);
  await tools.handle({ dataset: { action: "creative-generate" } }, ctx);
  assert.equal(calls, 0);
  assert.equal(tools.videoEnabled(), false);
});

test("video output is rejected and the fixed rule reaches AI creation instructions", () => {
  const { validateFile } = require("../lib/creative-files");
  assert.throws(() => validateFile("movie.mp4", Buffer.from("0000ftypisom000000")), /格式/);
  const { DOCUMENT_INSTRUCTION } = require("../lib/creative-service");
  assert.match(DOCUMENT_INSTRUCTION, /does not support video production in any form/);
});

test("tool tabs return to Course notes from Docs and Sheets without loading a creative job", async () => {
  const source = fs.readFileSync(require.resolve("../public/app"), "utf8");
  const start = source.indexOf('      if (action === "tool-mode") {');
  const end = source.indexOf('      if (["office-view-library"', start);
  assert.ok(start >= 0 && end > start);
  const state = { tool: "notes", toolView: "edit" }, saved = new Map(), rendered = [];
  const context = vm.createContext({ state, action: "tool-mode", button: { dataset: {} },
    localStorage: { setItem: (key, value) => saved.set(key, value) },
    officeTools: { capture() {}, supports: tool => ["docs", "sheets", "slides"].includes(tool) },
    creativeTools: { capture() {}, load() { assert.fail("notes and office tabs must not load creative jobs"); } },
    render: () => assert.fail("tool tabs must not rebuild the outer page"),
    renderToolsWorkspace: () => rendered.push(state.tool) });
  const choose = vm.runInContext(`(async () => { ${source.slice(start, end)} })`, context);
  for (const tool of ["docs", "sheets", "notes", "docs", "notes"]) {
    context.button.dataset.tool = tool;
    await choose();
    assert.equal(state.tool, tool);
    assert.equal(state.toolView, "library");
    assert.equal(state.officeEntry, null);
    assert.equal(saved.get("studybridge.tool"), tool);
    assert.equal(rendered.at(-1), tool);
  }
});

test("switching the tools workspace preserves the shell and tab controls", () => {
  const source = fs.readFileSync(require.resolve("../public/app"), "utf8");
  const start = source.indexOf("  function renderToolsWorkspace() {");
  const end = source.indexOf("  function creativeContext()", start);
  assert.ok(start >= 0 && end > start);
  const children = ["old editor", "old trailing text"], mounted = [];
  const buttons = ["notes", "docs", "sheets"].map(tool => ({
    dataset: { tool }, attributes: {}, active: false,
    classList: { toggle(name, value) { buttons.find(button => button.dataset.tool === tool).active = value; } },
    setAttribute(name, value) { this.attributes[name] = value; }
  }));
  const tabs = {
    get nextSibling() { return children.length ? { remove() { children.shift(); } } : null; },
    insertAdjacentHTML(position, html) { assert.equal(position, "afterend"); children.push(html); },
    querySelectorAll() { return buttons; }
  };
  const state = { page: "tools", tool: "sheets" };
  const context = vm.createContext({ state,
    root: { querySelector(selector) { assert.equal(selector, ".tools-tabs"); return tabs; },
      set innerHTML(value) { assert.fail("the shell must remain mounted"); } },
    render() { assert.fail("switching tools must not render the full page"); },
    toolsWorkspaceHtml: () => "new editor", creativeContext: () => state,
    officeTools: { mount(ctx) { mounted.push(ctx.tool); } },
    window: { StudyBridgeCourseNotes: { mount(ctx) { mounted.push(ctx.tool); } }, StudyBridgeOfficeLibrary: { mount(ctx) { mounted.push(ctx.tool); } } }
  });
  vm.runInContext(`${source.slice(start, end)}; renderToolsWorkspace();`, context);
  assert.deepEqual(children, ["new editor"]);
  assert.deepEqual(buttons.map(button => button.active), [false, false, true]);
  assert.deepEqual(buttons.map(button => button.attributes["aria-pressed"]), ["false", "false", "true"]);
  assert.deepEqual(mounted, ["sheets", "sheets", "sheets"]);
});

function imageHistoryHarness(t, options = {}) {
  const records = [{id:'one',kind:'image',format:'png',status:'ready',prompt:'First image',files:[]},{id:'two',kind:'image',format:'png',status:'failed',prompt:'Second image',files:[]}];
  const calls = []; let output = '', current = true, confirm = options.confirm || ((_job, submit) => submit());
  const window = {StudyBridgeCheatsheetPrint:require('../public/cheatsheet-print'),StudyBridgeMarkdown:{render:s=>s}};
  const document = {hidden:false,getElementById:()=>null,addEventListener(){},querySelector:()=>null};
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/creative-tools'),'utf8'),{StudyBridgeI18n:require('../public/i18n'),window,document,setTimeout,clearTimeout});
  const tools=window.StudyBridgeCreativeTools;
  const ctx={userId:'alice',tool:'images',courses:[],esc:s=>String(s).replaceAll('<','&lt;').replaceAll('"','&quot;'),visible:()=>current,isCurrent:()=>current,
    render:()=>{output=tools.html(ctx);},confirmDelete:(job,submit)=>confirm(job,submit),
    api:async(route,init)=>{calls.push({route,method:init?.method||'GET'});if(init)return options.remove?.(route)||{};return route.endsWith('capabilities')?{configured:true}: {jobs:records.map(j=>({...j}))};}};
  t.after(()=>tools.stop());
  return {tools,ctx,records,calls,html:()=>output,render:ctx.render,load:async()=>{await tools.load(ctx);ctx.render();},
    action:id=>tools.handle({dataset:{action:'creative-delete',id}},ctx),setConfirm:fn=>{confirm=fn;},switchAccount:()=>{current=false;tools.html({...ctx,userId:'bob'});}};
}

test('image history exposes separate delete controls, preserves other records and clears the deleted preview', async t=>{
  const h=imageHistoryHarness(t); await h.load();
  assert.match(h.html(),/creative-history-row/); assert.match(h.html(),/aria-label="删除作品：First image"/);
  assert.doesNotMatch(h.html(),/<button[^>]*creative-history-item[^>]*>(?:(?!<\/button>)[\s\S])*<button/);
  h.tools.select('one'); await h.action('one');
  assert.doesNotMatch(h.html(),/First image/); assert.match(h.html(),/Second image/);
  assert.equal(h.calls.filter(c=>c.method==='DELETE').length,1);
  await h.load(); assert.doesNotMatch(h.html(),/First image/,'stale list responses must not restore deleted output');
});

test('canceling deletion sends no request; failed deletion retains work for retry',async t=>{
  let fail=true; const h=imageHistoryHarness(t,{confirm:async()=>null,remove:()=>{if(fail)throw Error('Deletion unavailable');}}); await h.load();
  await h.action('one'); assert.equal(h.calls.filter(c=>c.method==='DELETE').length,0); assert.match(h.html(),/First image/);
  h.setConfirm((_job,submit)=>submit()); await h.action('one'); assert.match(h.html(),/First image/); assert.match(h.html(),/Deletion unavailable/);
  fail=false; await h.action('one'); assert.doesNotMatch(h.html(),/First image/);
});

test('repeated deletion clicks share one confirmation and account changes prevent late mutations',async t=>{
  let submit, resolve; const dialog=new Promise(done=>{resolve=done;});
  const h=imageHistoryHarness(t,{confirm:(_job,work)=>{submit=work;return dialog;}}); await h.load();
  const pending=h.action('one'); await h.action('one'); assert.equal(h.calls.filter(c=>c.method==='DELETE').length,0);
  h.switchAccount(); await assert.rejects(submit(),/登录账号已改变/); resolve(null); await pending;
  assert.equal(h.calls.filter(c=>c.method==='DELETE').length,0);
});

test('running image jobs cannot be deleted from the history handler',async t=>{
  const h=imageHistoryHarness(t); h.records[0].status='generating'; await h.load(); await h.action('one');
  assert.doesNotMatch(h.html(),/data-action="creative-delete" data-id="one"/);
  assert.equal(h.calls.filter(c=>c.method==='DELETE').length,0);
});
