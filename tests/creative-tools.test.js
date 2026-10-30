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
