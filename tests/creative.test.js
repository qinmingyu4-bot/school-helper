const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const AdmZip = require("adm-zip");
const { StudyBridgeDatabase } = require("../lib/database");
const { createCreativeService } = require("../lib/creative-service");
const { safeName, validateFile, sourceFiles } = require("../lib/creative-files");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
const pdf = Buffer.from("%PDF-1.7\n%%EOF");
function office(format, macro = false) {
  const zip = new AdmZip();
  zip.addFile("[Content_Types].xml", Buffer.from(macro ? "macroEnabled" : "<Types/>"));
  const required = { docx: "word/document.xml", xlsx: "xl/workbook.xml", pptx: "ppt/presentation.xml" }[format];
  zip.addFile(required, Buffer.from("<document>Fixture</document>"));
  if (format === "xlsx") zip.addFile("xl/worksheets/sheet1.xml", Buffer.from("<worksheet/>"));
  if (format === "pptx") zip.addFile("ppt/slides/slide1.xml", Buffer.from("<slide/>"));
  return zip.toBuffer();
}

async function setup(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-creative-"));
  const previous = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, STUDYBRIDGE_VIDEO_ENABLED: process.env.STUDYBRIDGE_VIDEO_ENABLED, LOCAL_DB_FILE: process.env.LOCAL_DB_FILE };
  process.env.OPENAI_API_KEY = "creative-test-key";
  process.env.LOCAL_DB_FILE = path.join(directory, "db.json");
  delete process.env.STUDYBRIDGE_VIDEO_ENABLED;
  const db = new StudyBridgeDatabase(); db.dynamo = null;
  const calls = [], payloads = new Map();
  let responseCount = 0;
  let wait = options.wait || false;
  const request = async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.headers.Authorization, "Bearer creative-test-key");
    const route = url.replace("https://api.openai.com/v1/", "");
    if (wait && init.method === "POST") await new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    });
    if (init.method === "DELETE") return Response.json({ deleted: true });
    if (route === "files") return Response.json({ id: "file_source" });
    if (route === "responses") {
      responseCount++;
      const body = JSON.parse(init.body);
      assert.equal(body.model, "test-document-model");
      assert.equal(body.tools[0].type, "code_interpreter");
      assert.equal(body.store, false);
      const format = body.input[1].content.match(/Required primary format: (\w+)/)[1];
      const generatedPdf = options.printPdf ? await fs.readFile(path.join(__dirname, "fixtures", options.repairFirst && responseCount === 1 ? "cheatsheet-small.pdf" : options.printPdf)) : pdf;
      const files = [{ filename: `artifact.${format}`, bytes: format === "pdf" ? generatedPdf : office(format) }, { filename: "preview.pdf", bytes: generatedPdf }, { filename: "preview-1.png", bytes: png }];
      if (options.incomplete) files.splice(1);
      const annotations = files.map((file, i) => { const file_id = `cfile_${i}`; payloads.set(file_id, file.bytes); return { type: "container_file_citation", container_id: "cntr_test", file_id, filename: file.filename }; });
      return Response.json({ status: "completed", output: [{ type: "code_interpreter_call", container_id: "cntr_test" }, { type: "message", content: [{ type: "output_text", text: "Generated fixture. [File](sandbox:/mnt/data/artifact.docx)", annotations }] }] });
    }
    if (route.startsWith("containers/")) return new Response(payloads.get(route.split("/")[3]));
    if (route === "images/generations" || route === "images/edits") return Response.json({ data: [{ b64_json: options.badImage ? Buffer.from("<svg/>").toString("base64") : png.toString("base64") }] });
    if (route === "videos") return Response.json({ id: "video_fixture", status: "completed" });
    if (route === "videos/video_fixture/content") return new Response(Buffer.from("0000ftypisom0000"));
    throw new Error(`Unexpected provider route ${route}`);
  };
  const service = createCreativeService({ db, request, documentModel: () => "test-document-model", contextFor: async (userId, courseId) => {
    if (courseId !== "owned") throw Object.assign(new Error("Course not found"), { statusCode: 404 });
    return "OWNED_CONTEXT";
  } });
  t.after(async () => {
    wait = false;
    for (const job of await db.listCreativeJobs("alice")) if (["preparing", "generating", "checking"].includes(job.status)) await service.cancel("alice", job.id);
    await new Promise((resolve) => setTimeout(resolve, 30));
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { service, db, calls };
}
async function done(service, job) {
  for (let i = 0; i < 200; i++) {
    const current = await service.get("alice", job.id);
    if (!["preparing", "generating", "checking"].includes(current.status)) return current;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Fixture job did not finish");
}

test("creative files sanitize names and reject mismatched, macro and malformed binaries", () => {
  assert.equal(safeName("../../\"evil.docx"), "_evil.docx");
  assert.equal(validateFile("image.png", png).mime, "image/png");
  assert.throws(() => validateFile("image.png", Buffer.from("<svg/>")));
  assert.throws(() => validateFile("report.pdf", Buffer.from("not a PDF")));
  assert.throws(() => validateFile("report.docx", office("docx", true)));
  assert.throws(() => sourceFiles([{ fileName: "script.js", fileData: "data:text/javascript;base64,YQ==" }]));
  assert.throws(() => sourceFiles(Array(5).fill({})));
});

test("all document formats deliver checked files and previews with durable account-isolated downloads", async (t) => {
  const { service, db, calls } = await setup(t);
  for (const format of ["docx", "pdf", "xlsx", "pptx"]) {
    const job = await service.create({ id: "alice" }, { kind: "document", format, prompt: "Create a concise study guide", courseId: "owned" });
    const result = await done(service, job);
    assert.equal(result.status, "ready");
    assert.equal(result.checked, true);
    assert.ok(result.files.some((file) => file.extension === format));
    assert.ok(result.files.some((file) => file.extension === "png"));
    const primary = result.files.find((file) => file.extension === format);
    assert.ok((await service.file("alice", job.id, primary.id)).bytes.length);
    await assert.rejects(service.file("bob", job.id, primary.id), (failure) => failure.statusCode === 404);
    assert.equal(await service.get("bob", job.id), null);
  }
  assert.equal((await service.list("alice")).length, 4);
  assert.deepEqual(await service.list("bob"), []);
  assert.equal((await db.listCourses("alice")).length, 0);
  assert.ok(calls.some((call) => call.init.method === "DELETE" && call.url.includes("containers/cntr_test")));
  const reopened = createCreativeService({ db: new StudyBridgeDatabase(), request: () => { throw new Error("No provider needed"); }, documentModel: () => "", contextFor: async () => "" });
  const saved = (await reopened.list("alice"))[0];
  assert.equal(saved.status, "ready");
  assert.ok((await reopened.file("alice", saved.id, saved.files[0].id)).bytes.length);
});

test("document revisions upload the prior editable file and preserve the previous version", async (t) => {
  const { service, calls } = await setup(t);
  const first = await done(service, await service.create({ id: "alice" }, { kind: "document", prompt: "First draft" }));
  const revision = await done(service, await service.create({ id: "alice" }, { kind: "document", prompt: "Make it shorter", parentId: first.id }));
  assert.equal(revision.status, "ready");
  assert.equal(revision.parentId, first.id);
  assert.equal(revision.request, "Make it shorter");
  const upload = calls.find((call) => call.url.endsWith("/files") && call.init.method === "POST");
  assert.equal(upload.init.body.get("file").name, "artifact.docx");
  assert.equal((await service.get("alice", first.id)).status, "ready");
  await assert.rejects(service.create({ id: "bob" }, { kind: "document", prompt: "Steal prior file", parentId: first.id }), (failure) => failure.statusCode === 404);
});

test("image generation and edits use real image bytes and keep source images private", async (t) => {
  const { service, calls } = await setup(t);
  const first = await done(service, await service.create({ id: "alice" }, { kind: "image", prompt: "Create a diagram", size: "1536x1024", quality: "high" }));
  const revision = await done(service, await service.create({ id: "alice" }, { kind: "image", prompt: "Change the background", parentId: first.id }));
  assert.equal(first.status, "ready"); assert.equal(revision.status, "ready");
  const edit = calls.find((call) => call.url.endsWith("images/edits"));
  assert.equal(JSON.parse(edit.init.body).images[0].image_url, `data:image/png;base64,${png.toString("base64")}`);
  assert.deepEqual((await service.file("alice", revision.id, revision.files[0].id)).bytes, png);
});

test("video is gated before provider calls; prepared route can deliver a video when explicitly enabled", async (t) => {
  const { service, calls } = await setup(t);
  assert.equal(service.capabilities().video, false);
  await assert.rejects(service.create({ id: "alice" }, { kind: "video", prompt: "A scene" }), (failure) => failure.statusCode === 403);
  assert.equal(calls.length, 0);
  process.env.STUDYBRIDGE_VIDEO_ENABLED = "true";
  const video = await done(service, await service.create({ id: "alice" }, { kind: "video", prompt: "A scene" }));
  assert.equal(video.status, "ready"); assert.equal(video.files[0].extension, "mp4");
});

test("cancellation bounds concurrent work and never publishes partial files", async (t) => {
  const { service } = await setup(t, { wait: true });
  const job = await service.create({ id: "alice" }, { kind: "image", prompt: "Wait" });
  await assert.rejects(service.create({ id: "alice" }, { kind: "image", prompt: "Duplicate" }), (failure) => failure.statusCode === 429);
  await assert.rejects(service.cancel("bob", job.id), (failure) => failure.statusCode === 404);
  await new Promise((resolve) => setTimeout(resolve, 20));
  await service.cancel("alice", job.id);
  const result = await done(service, job);
  assert.equal(result.status, "canceled"); assert.deepEqual(result.files, []);
});

test("missing deliverables and invalid image output fail instead of returning a text-only success", async (t) => {
  const { service } = await setup(t, { incomplete: true, badImage: true });
  const doc = await done(service, await service.create({ id: "alice" }, { kind: "document", prompt: "A report" }));
  assert.equal(doc.status, "failed"); assert.deepEqual(doc.files, []);
  const image = await done(service, await service.create({ id: "alice" }, { kind: "image", prompt: "An image" }));
  assert.equal(image.status, "failed"); assert.deepEqual(image.files, []);
});

test("restart clears stale pending jobs; delete removes stored files and isolates owners", async (t) => {
  const { service, db } = await setup(t);
  await db.saveCreativeJob({ id: "stale", userId: "alice", status: "generating", files: [], createdAt: new Date().toISOString() });
  assert.equal((await service.get("alice", "stale")).status, "failed");
  const job = await done(service, await service.create({ id: "alice" }, { kind: "image", prompt: "A diagram" }));
  await assert.rejects(service.remove("bob", job.id), (failure) => failure.statusCode === 404);
  await service.remove("alice", job.id);
  assert.equal(await service.get("alice", job.id), null);
  assert.equal(await db.readCreativeFile("alice", job.id, job.files[0].id), null);
});

test("generation quota survives deleted jobs and rejects concurrent excess requests", async (t) => {
  const { db } = await setup(t);
  const results = await Promise.allSettled(Array.from({ length: 15 }, () => db.claimCreativeQuota("alice")));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 10);
  assert.ok(results.filter((result) => result.status === "rejected").every((result) => result.reason.statusCode === 429));
  const reopened = new StudyBridgeDatabase(); reopened.dynamo = null;
  await assert.rejects(reopened.claimCreativeQuota("alice"), (failure) => failure.statusCode === 429);
  await reopened.claimCreativeQuota("bob");
});

test("DynamoDB creative records and files isolate users and delete only the requested job", async () => {
  const db = new StudyBridgeDatabase(), rows = new Map();
  db.dynamo = {
    put: async (pk, sk, type, data) => { rows.set(`${pk}|${sk}`, structuredClone(data)); return data; },
    get: async (pk, sk) => rows.get(`${pk}|${sk}`) || null,
    query: async (pk, prefix) => [...rows.entries()].filter(([key]) => key.startsWith(`${pk}|${prefix}`)).map(([, value]) => structuredClone(value)),
    delete: async (pk, sk) => rows.delete(`${pk}|${sk}`),
    transactPut: async (records) => { for (const record of records) rows.set(`${record.pk}|${record.sk}`, record.data); }
  };
  await db.saveCreativeJob({ id: "one", userId: "alice", status: "ready", createdAt: new Date().toISOString() });
  await db.saveCreativeJob({ id: "one", userId: "bob", status: "ready", createdAt: new Date().toISOString() });
  await db.saveCreativeFile("alice", "one", "file", png);
  await db.saveCreativeFile("alice", "two", "file", png);
  await db.saveCreativeFile("bob", "one", "file", png);
  await db.claimCreativeQuota("alice");
  assert.equal((await db.listCreativeJobs("alice")).length, 1);
  assert.deepEqual(await db.readCreativeFile("alice", "one", "file"), png);
  await db.deleteCreativeJob("alice", "one");
  assert.equal(await db.getCreativeJob("alice", "one"), null);
  assert.equal((await db.getCreativeJob("bob", "one")).userId, "bob");
  assert.deepEqual(await db.readCreativeFile("bob", "one", "file"), png);
  assert.deepEqual(await db.readCreativeFile("alice", "two", "file"), png);
  assert.equal(rows.get("USER#alice|CREATIVE_QUOTA").timestamps.length, 1);
});

test("course cheatsheet jobs enforce PDF settings, retain context and repair print failures once", async (t) => {
  const { service, calls } = await setup(t, { printPdf: "cheatsheet-a4.pdf", repairFirst: true });
  await assert.rejects(service.create({ id: "alice" }, { kind: "document", format: "docx", prompt: "Cheat", courseId: "owned", cheatsheet: {} }));
  await assert.rejects(service.create({ id: "alice" }, { kind: "document", format: "pdf", prompt: "Cheat", cheatsheet: {} }));
  const job = await done(service, await service.create({ id: "alice" }, { kind: "document", format: "pdf", prompt: "Only formulas", courseId: "owned", cheatsheet: {} }));
  assert.equal(job.status, "ready");
  assert.equal(job.printCheck.pages, 1);
  assert.equal(job.cheatsheet.columns, 2);
  const responses = calls.filter((call) => call.url.endsWith("/responses"));
  assert.equal(responses.length, 2);
  assert.match(JSON.parse(responses[0].init.body).input[0].content, /Mandatory cheatsheet print contract/);
  assert.match(JSON.parse(responses[1].init.body).input[1].content, /Correct the previous print-validation failure/);
});
