"use strict";
module.exports.install = function () {
  if (process.env.NODE_ENV !== "test") throw new Error("Usage transport is test-only.");
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url) === "https://api.openai.com/v1/responses/input_tokens") return Response.json({ input_tokens: 100 });
    const response = await previous(url, options);
    if (!String(url).startsWith("https://api.openai.com/v1/") || !response.ok || response.headers.get("content-type")?.includes("text/event-stream") || !/\/(responses|completions|generations|edits|transcriptions)$/.test(String(url))) return response;
    const payload = await response.json();
    payload.usage ||= { input_tokens: 100, output_tokens: 50, input_tokens_details: { text_tokens: 100, image_tokens: 0 }, seconds: 2 };
    return Response.json(payload, { status: response.status });
  };
};
