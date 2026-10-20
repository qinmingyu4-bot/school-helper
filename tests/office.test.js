const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const AdmZip = require("adm-zip");
const M = require("../public/office-model");
const { calculator, renameFormulaSheet } = require("../lib/office-formulas");
const { exportOffice } = require("../lib/office-export");
const { importOffice } = require("../lib/office-import");
const { createOfficeService } = require("../lib/office-service");
const { StudyBridgeDatabase } = require("../lib/database");

test("spreadsheet formulas recalculate ranges, cross-sheet references, conditionals, errors and cycles without executing code", () => {
  const model = M.fresh("sheets"),
    cells = model.sheets[0].cells;
  for (const [address, value] of Object.entries({
    A1: "10",
    A2: "20",
    A3: "=SUM(A1:A2)",
    B1: '=IF(A3>25,"pass","fail")',
    B2: "=AVERAGE(A1:A2)",
    B3: "=1/0",
    C1: "=C2",
    C2: "=C1",
    D1: "=Missing!A1",
    D2: "=process.exit()",
    E1: "=ROUND(4.567,2)",
    E2: "=SUM(A:A)",
  }))
    cells[address] = { value };
  model.sheets.push({
    id: "second",
    name: "Costs 2026",
    rows: 40,
    cols: 12,
    cells: { A1: { value: "='Sheet1'!$A$3*2" } },
  });
  let calc = calculator(model);
  assert.equal(calc.display("Sheet1", "A3"), 30);
  assert.equal(calc.display("Sheet1", "B1"), "pass");
  assert.equal(calc.display("Sheet1", "B2"), 15);
  assert.equal(calc.display("Sheet1", "B3"), "#DIV/0!");
  assert.match(calc.display("Sheet1", "C1"), /^#/);
  assert.equal(calc.display("Sheet1", "D1"), "#REF!");
  assert.match(calc.display("Sheet1", "D2"), /^#/);
  assert.equal(calc.display("Costs 2026", "A1"), 60);
  assert.equal(calc.display("Sheet1", "E1"), 4.57);
  assert.equal(calc.display("Sheet1", "E2"), 60);
  cells.A1.value = "15";
  calc = calculator(model);
  assert.equal(calc.display("Costs 2026", "A1"), 70);
  assert.equal(
    renameFormulaSheet('=IF(A1="Sheet1!A1",Sheet1!A1,0)', "Sheet1", "New Name"),
    "=IF(A1=\"Sheet1!A1\",'New Name'!A1,0)",
  );
});

test("editor models reject executable content, unsafe images, duplicate names, invalid cell references and oversized state", () => {
  const docs = M.fresh("docs");
  docs.content.content = [{ type: "script", text: "bad" }];
  assert.throws(() => M.normalize("docs", docs));
  docs.content.content = [
    { type: "image", attrs: { src: "https://example.test/track.png" } },
  ];
  assert.throws(() => M.normalize("docs", docs));
  const sheets = M.fresh("sheets");
  sheets.sheets.push({ ...sheets.sheets[0], id: "two" });
  assert.throws(() => M.normalize("sheets", sheets));
  const bad = M.fresh("sheets");
  bad.sheets[0].cells.ZZ4000 = { value: "x" };
  assert.throws(() => M.normalize("sheets", bad));
  const slides = M.fresh("slides");
  slides.slides[0].elements[0].x = 200;
  const fixed = M.normalize("slides", slides);
  assert(fixed.slides[0].elements[0].x + fixed.slides[0].elements[0].w <= 100);
  assert.throws(() => M.normalize("slides", { slides: [] }));
});

test("native Office exports preserve Word formatting, editable slide elements and transitions, and Excel formulas with results", async () => {
  const docs = M.fresh("docs");
  docs.content.content = [
    {
      type: "paragraph",
      attrs: { lineHeight: "2", textAlign: "center" },
      content: [
        {
          type: "text",
          text: "My essay 中文",
          marks: [
            { type: "bold" },
            {
              type: "textStyle",
              attrs: {
                fontFamily: "Arial",
                fontSize: "18pt",
                color: "#123456",
              },
            },
          ],
        },
      ],
    },
  ];
  const word = new AdmZip((await exportOffice("docs", docs)).bytes).readAsText(
    "word/document.xml",
  );
  assert.match(word, /My essay 中文/);
  assert.match(word, /w:line="480"/);
  assert.match(word, /w:sz w:val="36"/);
  assert.match(word, /w:ascii="Arial"/);
  assert.match(word, /w:val="center"/);
  const deck = M.fresh("slides");
  deck.slides[0].transition = "push";
  deck.slides[0].elements[0].text = "Editable title";
  deck.slides[0].elements.push({
    id: "picture",
    type: "image",
    x: 10,
    y: 10,
    w: 20,
    h: 20,
    src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9kAAAAASUVORK5CYII=",
  });
  const ppt = new AdmZip((await exportOffice("slides", deck)).bytes),
    slide = ppt.readAsText("ppt/slides/slide1.xml");
  assert.match(slide, /Editable title/);
  assert.match(slide, /<p:sp>/);
  assert.match(slide, /<p:pic>/);
  assert.match(slide, /<p:push dir="l"/);
  const sheet = M.fresh("sheets");
  for (const [a, value] of Object.entries({
    A1: "10",
    A2: "20",
    A3: "=SUM(A1:A2)",
  }))
    sheet.sheets[0].cells[a] = { value };
  const excel = new AdmZip(
    (await exportOffice("sheets", sheet)).bytes,
  ).readAsText("xl/worksheets/sheet1.xml");
  assert.match(excel, /<f>SUM\(A1:A2\)<\/f><v>30<\/v>/);
});

test("cloud editor projects persist per user, reject stale updates and preserve an existing version after failed saves", async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "studybridge-office-unit-"),
  );
  const db = new StudyBridgeDatabase();
  db.dynamo = null;
  db.local.file = path.join(directory, "db.json");
  t.after(async () => {
    assert(
      path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep),
    );
    await fs.rm(directory, { recursive: true, force: true });
  });
  const service = createOfficeService(db),
    id = "office_test-one";
  const saved = await service.save("alice", id, {
    kind: "docs",
    name: "Essay",
    version: 0,
    model: M.fresh("docs"),
  });
  assert.equal(saved.version, 1);
  assert.equal((await service.list("bob")).length, 0);
  await assert.rejects(service.get("bob", id), (e) => e.statusCode === 404);
  await assert.rejects(
    service.save("alice", id, {
      kind: "docs",
      version: 0,
      model: M.fresh("docs"),
    }),
    (e) => e.statusCode === 409,
  );
  const project = await service.get("alice", id);
  project.model.content.content[0] = {
    type: "paragraph",
    content: [{ type: "text", text: "Persisted writing" }],
  };
  await service.save("alice", id, { ...project, version: 1 });
  const [first, second] = await Promise.allSettled([
    service.save("alice", id, { ...project, version: 2 }),
    service.save("alice", id, { ...project, version: 2 }),
  ]);
  assert.equal(
    [first, second].filter((r) => r.status === "fulfilled").length,
    1,
  );
  const reopened = await service.get("alice", id);
  assert.equal(reopened.version, 3);
  assert.equal(
    reopened.model.content.content[0].content[0].text,
    "Persisted writing",
  );
});

test("Office import round trips editable writing, slide text/transitions/images and spreadsheet formulas", async () => {
  const docs = M.fresh("docs");
  docs.content.content = [
    {
      type: "paragraph",
      attrs: { lineHeight: "2" },
      content: [
        {
          type: "text",
          text: "My imported essay 中文",
          marks: [
            { type: "bold" },
            {
              type: "textStyle",
              attrs: { fontFamily: "Arial", fontSize: "18pt" },
            },
          ],
        },
      ],
    },
  ];
  const slides = M.fresh("slides");
  slides.slides[0].elements[0].text = "My imported slide";
  slides.slides[0].transition = "wipe";
  const sheets = M.fresh("sheets");
  sheets.sheets[0].cells = {
    A1: { value: "42" },
    A2: { value: "=A1*2" },
    B1: { value: "'00123" },
  };
  for (const [kind, model] of Object.entries({ docs, slides, sheets })) {
    const file = await exportOffice(kind, model),
      result = await importOffice(
        kind,
        "My file." + file.extension,
        "data:" + file.mime + ";base64," + file.bytes.toString("base64"),
      );
    assert.equal(result.name, "My file");
    assert(result.warnings.length > 0);
    if (kind === "docs") {
      const rich = JSON.stringify(result.model.content);
      assert.match(rich, /My imported essay 中文/);
      assert.match(rich, /18pt/);
      assert.match(rich, /bold/);
    }
    if (kind === "slides") {
      assert.equal(
        result.model.slides[0].elements[0].text,
        "My imported slide",
      );
      assert.equal(result.model.slides[0].transition, "wipe");
    }
    if (kind === "sheets") {
      assert.equal(result.model.sheets[0].cells.A2.value, "=A1*2");
      assert.equal(calculator(result.model).display("Sheet1", "A2"), 84);
      assert.equal(calculator(result.model).display("Sheet1", "B1"), "00123");
    }
  }
  const zip = new AdmZip();
  zip.addFile(
    "word/document.xml",
    Buffer.from(
      '<!DOCTYPE doc [<!ENTITY data SYSTEM "file:///private">]><w:document/>',
    ),
  );
  await assert.rejects(
    importOffice(
      "docs",
      "test.docx",
      "data:application/octet-stream;base64," +
        zip.toBuffer().toString("base64"),
    ),
    /DTD/,
  );
});

test("DynamoDB editor storage uses version-checked manifests with complete private material chunks", async () => {
  const db = new StudyBridgeDatabase(),
    rows = new Map();
  db.dynamo = {
    get: async (pk, sk) => structuredClone(rows.get(pk + "/" + sk) || null),
    query: async (pk, prefix) =>
      [...rows.entries()]
        .filter(([key]) => key.startsWith(pk + "/" + prefix))
        .map(([, value]) => structuredClone(value)),
    put: async (pk, sk, type, data) => {
      rows.set(pk + "/" + sk, structuredClone(data));
    },
    delete: async (pk, sk) => {
      rows.delete(pk + "/" + sk);
    },
    transactPut: async (records) => {
      for (const record of records) {
        const key = record.pk + "/" + record.sk,
          existing = rows.get(key);
        if (
          (record.createOnly && existing) ||
          (record.expectedData &&
            JSON.stringify(existing) !== JSON.stringify(record.expectedData))
        )
          throw Error("TransactionCanceledException");
      }
      for (const record of records)
        rows.set(record.pk + "/" + record.sk, structuredClone(record.data));
    },
  };
  const service = createOfficeService(db),
    model = M.fresh("docs");
  model.content.content = [
    {
      type: "paragraph",
      content: [{ type: "text", text: "x".repeat(150000) }],
    },
  ];
  await service.save("alice", "office_dynamo", {
    kind: "docs",
    name: "Long essay",
    version: 0,
    model,
  });
  assert.equal(
    (await service.get("alice", "office_dynamo")).model.content.content[0]
      .content[0].text.length,
    150000,
  );
  assert.equal((await service.list("bob")).length, 0);
  const body = { kind: "docs", name: "Long essay", version: 1, model };
  const results = await Promise.allSettled([
    service.save("alice", "office_dynamo", body),
    service.save("alice", "office_dynamo", body),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    results.find((r) => r.status === "rejected").reason.statusCode,
    409,
  );
  assert.equal((await service.get("alice", "office_dynamo")).version, 2);
});
