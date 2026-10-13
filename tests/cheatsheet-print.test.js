const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const print = require("../public/cheatsheet-print");
const { validatePrintablePdf } = require("../lib/cheatsheet-pdf");
const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", name));

test("browser/server share bounded print settings and physical sheet/page mapping", () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(require.resolve("../public/cheatsheet-print"), "utf8"), context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.StudyBridgeCheatsheetPrint.plan({}))), print.plan({}));
  assert.equal(print.plan({ sides: "double", sheets: 2 }).pages, 4);
  assert.equal(print.plan({ paper: "Letter", orientation: "landscape" }).width, 792);
  assert.match(print.instruction({}), /no text smaller than 9 pt/);
  for (const input of [true, [], { paper: "fake" }, { fontSize: 4 }, { fontSize: 9.1 }, { sheets: 10 }, { monochrome: "false" }, { marginMm: 0 }]) assert.throws(() => print.normalize(input));
});

test("print checks accept selectable A4 and double-sided landscape Letter PDFs", async () => {
  assert.equal((await validatePrintablePdf(fixture("cheatsheet-a4.pdf"), {})).pages, 1);
  assert.equal((await validatePrintablePdf(fixture("cheatsheet-embedded-font.pdf"), {})).pages, 1);
  const result = await validatePrintablePdf(fixture("cheatsheet-letter-double.pdf"), { paper: "Letter", orientation: "landscape", sides: "double" });
  assert.equal(result.pages, 2);
});

test("print checks reject wrong page counts, dimensions, small fonts, overflow and color", async () => {
  for (const [name, settings] of [["cheatsheet-a4.pdf", { sides: "double" }], ["cheatsheet-letter-double.pdf", {}], ["cheatsheet-small.pdf", {}], ["cheatsheet-overflow.pdf", {}], ["cheatsheet-color.pdf", {}]]) {
    await assert.rejects(validatePrintablePdf(fixture(name), settings), (error) => error.code === "PRINT_LAYOUT_INVALID");
  }
  assert.equal((await validatePrintablePdf(fixture("cheatsheet-color.pdf"), { monochrome: false })).pages, 1);
});
