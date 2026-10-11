"use strict";

if (process.env.NODE_ENV !== "test") throw new Error("AI echo transport is test-only.");

// Echo the real server request to verify its prompt without external AI calls.
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith("https://api.openai.com/v1/")) {
    throw new Error(`Unexpected external request in AI test: ${url}`);
  }
  const body = JSON.parse(options.body);
  const content = JSON.stringify(body);
  const payload = String(url).endsWith("/responses")
    ? { output: [{ type: "message", content: [{ type: "output_text", text: content }] }] }
    : { choices: [{ message: { content } }] };
  return new Response(JSON.stringify(payload), { status: 200 });
};
