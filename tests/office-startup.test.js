const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const loader = fs.readFileSync(path.join(__dirname, "../public/office-loader.js"), "utf8");
const editorSource = fs.readFileSync(path.join(__dirname, "../client/office-editor.mjs"), "utf8");
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function browser(connection = {}) {
  const elements = [], attachments = [], workspaces = new Set();
  let host = null, tabs = true, now = 1000;
  const editor = {
    detach() {},
    hasWorkspace: ctx => workspaces.has(`${ctx.userId}:${ctx.tool}`),
    attach(target, ctx) { attachments.push(ctx); workspaces.add(`${ctx.userId}:${ctx.tool}`); },
  };
  const window = { StudyBridgeI18n: { text: x => x }, StudyBridgeOfficeEditor: editor };
  vm.runInNewContext(loader, {
    window, navigator: { connection }, Date: { now: () => now },
    document: {
      getElementById: () => host,
      querySelector: () => tabs,
      createElement: tag => ({ tag, remove() { this.removed = true; } }),
      head: { appendChild: element => elements.push(element) },
    },
  });
  return {
    office: window.StudyBridgeOffice, elements, attachments,
    host: () => { host = { isConnected: true }; return host; },
    noHost: () => { host = null; },
    noTabs: () => { tabs = false; },
    advance: ms => { now += ms; },
    script: () => elements.filter(e => e.tag === "script").at(-1),
  };
}

test("tools page preloads only public editor bytes; data saver and other pages stay on demand", async () => {
  for (const connection of [{}, { saveData: true }, { effectiveType: "2g" }, { effectiveType: "slow-2g" }]) {
    const b = browser(connection);
    const ctx = { userId: "a", api: () => assert.fail("prefetch must not read account data") };
    await b.office.mount(ctx); await b.office.mount(ctx);
    assert.equal(b.elements.length, Object.keys(connection).length ? 0 : 1);
    if (!Object.keys(connection).length) {
      assert.equal(b.elements[0].rel, "preload");
      assert.equal(b.elements[0].as, "script");
      assert.equal(b.elements[0].fetchPriority, "low");
    }
  }
  const b = browser(); b.noTabs();
  await b.office.mount({ userId: "a" });
  assert.equal(b.elements.length, 0);
});

test("list request overlaps editor download and is shared across first opens; saves and expiry invalidate it", async () => {
  const b = browser(), response = deferred();
  let calls = 0;
  const ctx = { userId: "a", tool: "docs", api: () => { calls++; return response.promise; } };
  await b.office.mount(ctx);
  b.host();
  const opening = b.office.mount(ctx);
  await tick();
  assert.equal(calls, 1); assert.equal(b.attachments.length, 0);
  assert.equal(b.elements[0].href, b.script().src);
  response.resolve({ projects: [{ id: "d", kind: "docs" }] });
  b.script().onload(); await opening;
  const docs = b.attachments[0];
  assert.equal((await docs.officeProjects()).projects[0].id, "d");
  b.host(); await b.office.mount({ ...ctx, tool: "sheets" });
  await b.attachments[1].officeProjects();
  assert.equal(calls, 1);
  docs.invalidateOfficeProjects();
  await b.attachments[1].officeProjects(); assert.equal(calls, 2);
  b.advance(30001);
  await b.office.mount(ctx); await tick();
  assert.equal(calls, 2, "returning to an initialized workspace makes no new list request");
  await docs.officeProjects(); assert.equal(calls, 3);
});

test("account changes and failed requests cannot reuse another account's list; failed editor loads can retry", async () => {
  const b = browser(); b.host();
  let calls = 0;
  const ctx = { userId: "a", tool: "docs", api: async () => { calls++; throw Error("offline"); } };
  const first = b.office.mount(ctx); await tick();
  b.script().onerror(); await first;
  assert.equal(b.attachments.length, 0);
  const second = b.office.mount({ ...ctx, api: async () => { calls++; return { projects: ["a"] }; } });
  b.script().onload(); await second;
  assert.deepEqual((await b.attachments[0].officeProjects()).projects, ["a"]);
  b.host(); await b.office.mount({ ...ctx, userId: "b", api: async () => ({ projects: ["b"] }) });
  assert.deepEqual((await b.attachments[1].officeProjects()).projects, ["b"]);
  assert.equal(calls, 2);
});

test("rapid tab changes attach only the latest workspace", async () => {
  const b = browser(); b.host();
  const ctx = { userId: "a", tool: "docs", api: async () => ({ projects: [] }) };
  const first = b.office.mount(ctx);
  b.host(); const second = b.office.mount({ ...ctx, tool: "sheets" });
  b.script().onload(); await Promise.all([first, second]);
  assert.deepEqual(b.attachments.map(ctx => ctx.tool), ["sheets"]);
});

function workspace(ctx, backup) {
  const source = editorSource.slice(editorSource.indexOf("class Workspace {"), editorSource.indexOf("export function hasWorkspace"));
  const Workspace = vm.runInNewContext(source + "\nWorkspace", {
    backup, ui: { text: x => x }, Model: { normalize: (_kind, model) => model },
    localStorage: { getItem: () => "d", setItem() {} }, clearTimeout,
  });
  const w = new Workspace(ctx, "docs");
  w.draw = () => {}; w.schedule = () => { w.scheduled = true; };
  w.newProject = () => { w.current = { id: "new" }; };
  return w;
}

test("draft recovery starts before the cloud list completes and retains conflict protection", async () => {
  const list = deferred(), draft = deferred();
  let reads = 0;
  const w = workspace({ userId: "a", officeProjects: () => list.promise,
    api: () => assert.fail("cloud content must not replace a recovered draft") }, () => { reads++; return draft.promise; });
  const opening = w.init();
  assert.equal(reads, 1); assert.equal(w.ready, false);
  list.resolve({ projects: [{ id: "d", kind: "docs", version: 2 }] });
  draft.resolve({ id: "d", kind: "docs", version: 1, model: { text: "unsaved" } });
  await opening;
  assert.equal(w.current.model.text, "unsaved");
  assert.equal(w.current.conflict, true); assert.equal(w.current.dirty, true);
  assert.equal(w.scheduled, undefined);
});

test("offline startup reuses the same draft read; missing drafts still open cloud content", async () => {
  let reads = 0;
  const w = workspace({ userId: "a", officeProjects: async () => { throw Error("offline"); } },
    async () => { reads++; return { id: "d", kind: "docs", model: { text: "unsaved" } }; });
  await w.init(); assert.equal(reads, 1); assert.equal(w.current.model.text, "unsaved");
  const cloud = workspace({ userId: "a", officeProjects: async () => ({ projects: [{ id: "d", kind: "docs" }] }),
    api: async url => { assert.equal(url, "/api/office/d"); return { project: { id: "d", model: { text: "saved" } } }; } }, async () => null);
  await cloud.init(); assert.equal(cloud.current.model.text, "saved"); assert.equal(cloud.current.dirty, false);
});

test("successful saves invalidate shared metadata, while failed saves retain the dirty draft", async () => {
  for (const fail of [false, true]) {
    let invalidations = 0;
    const w = workspace({ userId: "a", invalidateOfficeProjects: () => { invalidations++; },
      api: async (_url, options) => {
        assert.equal(options.method, "PUT");
        if (fail) throw Error("offline");
        return { project: { id: "d", version: 2 } };
      } }, async () => {});
    w.current = { id: "d", kind: "docs", model: {}, version: 1, dirty: true };
    w.storeBackup = async () => {};
    await w.save();
    assert.equal(invalidations, fail ? 0 : 1);
    assert.equal(w.current.dirty, fail);
    assert.equal(w.current.version, fail ? 1 : 2);
  }
});

test("an explicit library selection opens that file instead of the remembered file", async () => {
  const w = workspace({ userId: "a", officeEntry: { id: "chosen", key: "open-1" },
    officeProjects: async () => ({ projects: [{ id: "d", kind: "docs" }, { id: "chosen", kind: "docs" }] }),
    api: async url => { assert.equal(url, "/api/office/chosen"); return { project: { id: "chosen", model: {} } }; },
  }, async () => null);
  await w.init(); assert.equal(w.current.id, "chosen");
});

test("explicit new creates one blank draft without opening an old cloud file", async () => {
  const w = workspace({ userId: "a", officeEntry: { create: true, key: "new-1" },
    officeProjects: async () => ({ projects: [{ id: "d", kind: "docs" }] }),
    api: () => assert.fail("new must not fetch an old file"),
  }, async () => null);
  await w.init(); assert.equal(w.current.id, "new"); assert.equal(w.entryKey, "new-1");
});

test("a missing selected cloud file cannot silently turn into a new document", async () => {
  const w = workspace({ userId: "a", officeEntry: { id: "deleted", key: "open-1" },
    officeProjects: async () => ({ projects: [] }), api: async () => { throw Error("File not found"); },
  }, async () => null);
  await assert.rejects(w.init(), /File not found/); assert.equal(w.current, null);
});
