const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs/promises");
const path = require("node:path");
const parse = require("pdf-parse/lib/pdf-parse");
const AdmZip = require("adm-zip");
const { renderSource, extractPdfLocations } = require("../lib/study-citations");
const { buildMaterialContext } = require("../lib/study-context");
const { pptxSourceParts } = require("../lib/study-office-locations");
const compact = (text) => String(text).replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

test("full and retrieved sources carry exact extracted-text positions without inventing pages", () => {
  const text = "Definition\nOpportunity cost\nWorked example\nA choice gives up the next best alternative.";
  const source = { name: "Lecture.txt", origin: "Course material", reference: "C1", text };
  const start = text.indexOf("Worked"), excerpt = text.slice(start);
  const rendered = renderSource(source, excerpt, "selected excerpt", start);
  assert.ok(rendered.includes("extracted-text lines 3-4"));
  assert.ok(rendered.includes(`characters ${start + 1}-${text.length}`));
  assert.ok(rendered.includes("no verified original page map"));
  assert.ok(rendered.includes(excerpt));
  const documents = [{ title: "Large.txt", text: "background\n".repeat(9000) + "CITATION_TARGET specific formula" }];
  const context = buildMaterialContext({ documents, message: "CITATION_TARGET", budget: 6000 });
  assert.ok(context.includes("CITATION_TARGET"));
  assert.ok(/Citation locator: extracted-text lines \d+-9001; characters/.test(context));
});

test("PDF excerpts retain physical page numbers across boundaries, excluding omitted pages", () => {
  const text = "Page one\nFirst fact\n\nPage two\nSecond fact\n\nPage three\nThird fact";
  const second = text.indexOf("Page two"), third = text.indexOf("Page three");
  const source = { name: "Notes.pdf", origin: "Course material", text, sourcePages: [
    { page: 1, start: 0, end: second - 2 }, { page: 2, start: second, end: third - 2 }, { page: 3, start: third, end: text.length }
  ] };
  const result = renderSource(source, text.slice(second + 5, third + 10), "excerpt", second + 5);
  assert.ok(!result.includes("Verified PDF page 1"));
  assert.ok(result.includes("Verified PDF page 2"));
  assert.ok(result.includes("Verified PDF page 3"));
  assert.ok(result.includes("Second fact"));
  for (const sourcePages of [[{ page: 7, start: 0, end: text.length + 1 }], [{ page: 2, start: 10, end: 20 }, { page: 1, start: 0, end: 9 }]]) {
    assert.ok(!renderSource({ ...source, sourcePages }, text).includes("Verified PDF page"));
  }
});

test("duplicate filenames remain distinguishable and old sources retain readable fallback locators", () => {
  const result = buildMaterialContext({ documents: [
    { title: "lecture.pdf", text: "Older notes" }, { title: "lecture.pdf", text: "Different notes" }
  ], attachments: [{ name: "lecture.pdf", kind: "pdf", text: "Uploaded in chat" }] });
  for (const reference of ["C1", "C2", "A1"]) assert.ok(result.includes(`source reference: ${reference}`));
  assert.ok(!result.includes("Verified PDF page"));
  assert.ok(result.includes("no verified original page map"));
});

test("real PDF extraction produces exact persisted text offsets for each physical page", async () => {
  const bytes = await fs.readFile(path.join(__dirname, "fixtures/cheatsheet-letter-double.pdf"));
  const result = await extractPdfLocations(parse, Uint8Array.from(bytes), compact);
  assert.equal(result.pages, 2);
  assert.deepEqual(result.sourcePages.map((page) => page.page), [1, 2]);
  for (const page of result.sourcePages) assert.ok(result.text.slice(page.start, page.end).trim().length > 0);
  const context = buildMaterialContext({ documents: [{ title: "Real.pdf", ...result }] });
  assert.ok(context.includes("Verified PDF page 1") && context.includes("Verified PDF page 2"));
});

test("blank PDF pages do not shift later physical page indices or create false readable evidence", async () => {
  const mock = async (bytes, options) => {
    for (const pageNumber of [1, 2, 3]) await options.pagerender({ pageNumber, getTextContent: async () => ({ items: pageNumber === 2 ? [] : [{ str: `Actual page ${pageNumber}`, transform: [1, 0, 0, 1, 0, 10] }] }) });
    return { numpages: 3, text: "" };
  };
  const result = await extractPdfLocations(mock, new Uint8Array(), compact);
  assert.deepEqual(result.sourcePages.map((page) => page.page), [1, 3]);
  assert.equal(result.text.slice(result.sourcePages[1].start, result.sourcePages[1].end), "Actual page 3");
});

test("PowerPoint citations follow actual presentation order and notes relationships", () => {
  const zip = new AdmZip();
  const add = (name, xml) => zip.addFile(name, Buffer.from(xml));
  add("ppt/presentation.xml", '<p:presentation xmlns:p="urn:p" xmlns:r="urn:r"><p:sldIdLst><p:sldId id="1" r:id="second"/><p:sldId id="2" r:id="first"/></p:sldIdLst></p:presentation>');
  add("ppt/_rels/presentation.xml.rels", '<Relationships xmlns="urn:rels"><Relationship Id="first" Type="urn:rel/slide" Target="slides/slide1.xml"/><Relationship Id="second" Type="urn:rel/slide" Target="slides/slide7.xml"/></Relationships>');
  add("ppt/slides/slide1.xml", "first-part"); add("ppt/slides/slide7.xml", "second-part");
  add("ppt/slides/_rels/slide7.xml.rels", '<Relationships xmlns="urn:rels"><Relationship Id="note" Type="urn:rel/notesSlide" Target="../notesSlides/notesSlide4.xml"/></Relationships>');
  add("ppt/notesSlides/notesSlide4.xml", "notes");
  assert.deepEqual(pptxSourceParts(zip), [
    { name: "ppt/slides/slide7.xml", label: "Verified presentation slide 1" },
    { name: "ppt/notesSlides/notesSlide4.xml", label: "Verified speaker notes for slide 1" },
    { name: "ppt/slides/slide1.xml", label: "Verified presentation slide 2" }
  ]);
  zip.deleteFile("ppt/presentation.xml");
  const fallback = pptxSourceParts(zip);
  assert.ok(fallback.every((part) => part.label.startsWith("PPTX")), "incomplete metadata cannot establish presentation numbering");
  assert.ok(fallback.some((part) => part.name.endsWith("notesSlide4.xml")));
});
