const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { copyText } = require("../public/clipboard");

function fallbackEnvironment(result = true) {
  const log = { copied: null, removed: false, focus: [], restoredRange: null };
  const originalRange = {};
  const selection = {
    rangeCount: 1,
    getRangeAt: () => ({ cloneRange: () => originalRange }),
    removeAllRanges() { log.restoredRange = null; },
    addRange(range) { log.restoredRange = range; }
  };
  const active = {
    selectionStart: 2, selectionEnd: 4, selectionDirection: "backward",
    focus(options) { log.focus.push(options); },
    setSelectionRange(...range) { log.selection = range; }
  };
  let field;
  const document = {
    activeElement: active,
    getSelection: () => selection,
    body: { appendChild(element) { assert.equal(element, field); log.appended = true; } },
    createElement(tag) {
      assert.equal(tag, "textarea");
      field = {
        style: {}, setAttribute() {}, focus() {},
        select() { log.selected = true; },
        setSelectionRange(start, end) { assert.deepEqual([start, end], [0, field.value.length]); },
        remove() { log.removed = true; }
      };
      return field;
    },
    execCommand(command) {
      assert.equal(command, "copy");
      assert.equal(log.selected, true);
      assert.equal(field.readOnly, true);
      if (result instanceof Error) throw result;
      if (result) log.copied = field.value;
      return result;
    }
  };
  return { environment: { document }, log, originalRange };
}

test("modern clipboard copies exact text without creating temporary DOM nodes", async () => {
  let copied;
  await copyText("SB-Exact-123 中文\n", { navigator: { clipboard: { writeText: async (text) => { copied = text; } } } });
  assert.equal(copied, "SB-Exact-123 中文\n");
});

test("HTTP/no-Clipboard-API fallback copies exact text and restores selection/focus", async () => {
  const { environment, log, originalRange } = fallbackEnvironment();
  await copyText("SB-U-1234-5678", environment);
  assert.equal(log.copied, "SB-U-1234-5678");
  assert.equal(log.removed, true);
  assert.deepEqual(log.selection, [2, 4, "backward"]);
  assert.deepEqual(log.focus, [{ preventScroll: true }]);
  assert.equal(log.restoredRange, originalRange);
});

test("denied or non-callable modern clipboard access falls back to selection copy", async () => {
  for (const clipboard of [{ writeText: async () => { throw new Error("NotAllowedError"); } }, {}]) {
    const { environment, log } = fallbackEnvironment();
    environment.navigator = { clipboard };
    await copyText("SB-DENIED", environment);
    assert.equal(log.copied, "SB-DENIED");
  }
});

test("rejected/throwing fallback never reports success and still restores the editor", async () => {
  for (const result of [false, new Error("Policy denied")]) {
    const { environment, log, originalRange } = fallbackEnvironment(result);
    await assert.rejects(copyText("SB-REJECTED", environment), /复制失败/);
    assert.equal(log.copied, null);
    assert.equal(log.removed, true);
    assert.deepEqual(log.selection, [2, 4, "backward"]);
    assert.equal(log.restoredRange, originalRange);
  }
});

test("unsupported browsers get an actionable error rather than a false success", async () => {
  await assert.rejects(copyText("SB-NO-API", {}), /手动复制/);
});

test("browser bundle exposes the same tested copy helper", async () => {
  let copied;
  const browser = { navigator: { clipboard: { writeText: async (text) => { copied = text; } } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/clipboard.js"), "utf8"), browser);
  await browser.StudyBridgeClipboard.copyText("SB-BROWSER");
  assert.equal(copied, "SB-BROWSER");
});
