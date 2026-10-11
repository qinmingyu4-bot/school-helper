const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const { readEvents } = require("../public/chat-stream");

function response(text, chunkSize = 1, onCancel = () => {}) {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new Response(new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(offset, offset += chunkSize));
    },
    cancel: onCancel
  }));
}

test("SSE preserves Chinese/emoji, split CRLF, multiline data and comments", async () => {
  const events = [];
  await readEvents(response(': heartbeat\r\nevent: delta\r\ndata: 中文😀\r\ndata: 第二行\r\n\r\nevent: done\rdata: {}\r\r'), (event) => events.push(event));
  assert.deepEqual(events, [{ event: "delta", data: "中文😀\n第二行" }, { event: "done", data: "{}" }]);
});

test("SSE ignores unfinished packets at EOF and resets unnamed event type", async () => {
  const events = [];
  await readEvents(response("event: delta\ndata: 1\n\ndata: 2\n\ndata: unfinished", 100), (event) => events.push(event));
  assert.deepEqual(events, [{ event: "delta", data: "1" }, { event: "message", data: "2" }]);
});

test("SSE stops and releases the transport on terminal events or callback failure", async () => {
  for (const fail of [false, true]) {
    let canceled = false;
    const source = response("data: 1\n\ndata: 2\n\n", 1, () => { canceled = true; });
    if (fail) await assert.rejects(readEvents(source, () => { throw new Error("bad packet"); }), /bad packet/);
    else await readEvents(source, () => false);
    assert.equal(canceled, true);
    assert.equal(source.body.locked, false);
  }
});

test("SSE bounds oversized pending packets", async () => {
  await assert.rejects(readEvents(response("data: " + "x".repeat(1024 * 1024 + 1), 65536), () => {}), /too large/);
});

test("browser and server use the same SSE reader", async () => {
  const browser = { TextDecoder };
  vm.runInNewContext(fs.readFileSync(require.resolve("../public/chat-stream"), "utf8"), browser);
  const events = [];
  await browser.StudyBridgeChatStream.readEvents(response("event: delta\ndata: 中文\n\n", 2), (event) => events.push(event));
  assert.equal(JSON.stringify(events), JSON.stringify([{ event: "delta", data: "中文" }]));
});
