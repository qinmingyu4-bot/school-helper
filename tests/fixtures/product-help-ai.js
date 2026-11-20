"use strict";
if (process.env.NODE_ENV !== "test") throw Error("Test only");
const original = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith("https://api.openai.com/")) return original(url, options);
  const body = JSON.parse(options.body);
  if (!body.messages[0].content.startsWith("Classify the latest request") || body.model !== "gpt-6-luna" || body.store !== false || !options.signal || body.max_completion_tokens !== 512) throw Error("Unexpected AI request");
  return Response.json({ choices: [{ finish_reason: "stop", message: { content: /homework/.test(body.messages.at(-1).content) ? "study" : "materials" } }] });
};
