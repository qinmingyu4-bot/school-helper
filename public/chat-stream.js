(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StudyBridgeChatStream = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // One UTF-8/SSE reader for the browser connection and both upstream AI APIs.
  async function readEvents(response, onEvent) {
    if (!response.body) throw new Error("The event stream has no body.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let event = "message";
    let data = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        let match;
        while ((match = /[\r\n]/.exec(buffer))) {
          const index = match.index;
          if (!done && buffer[index] === "\r" && index === buffer.length - 1) break;
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + (buffer[index] === "\r" && buffer[index + 1] === "\n" ? 2 : 1));
          if (!line) {
            if (data.length && await onEvent({ event, data: data.join("\n") }) === false) return;
            event = "message";
            data = [];
            size = 0;
          } else if (!line.startsWith(":")) {
            const colon = line.indexOf(":");
            const field = colon < 0 ? line : line.slice(0, colon);
            const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
            if (field === "event") event = value;
            if (field === "data") { data.push(value); size += value.length; }
          }
          if (size > 1024 * 1024) throw new Error("Event stream packet is too large.");
        }
        if (buffer.length + size > 1024 * 1024) throw new Error("Event stream packet is too large.");
        if (done) break;
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  return { readEvents };
});
