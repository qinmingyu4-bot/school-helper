"use strict";
const original = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith("https://api.openai.com/")) return original(url, options);
  const body = JSON.parse(options.body);
  if (String(url).endsWith("/input_tokens")) return Response.json({ input_tokens:100 });
  const output = body.instructions?.includes('"rows"')
    ? { rows: [{ name: "Homework 1", categoryName: "Homework", score: 18, max: 20, evidence: "Homework 1 18 / 20" }] }
    : { categories: [{ name: "Homework", weight: 40, method: "equal", plannedCount: 2, items: [], evidence: "Homework 40%", specialRule: "" }, { name: "Final", weight: 60, method: "equal", plannedCount: 1, items: [{ name: "Final exam", max: 100 }], evidence: "Final 60%", specialRule: "" }] };
  return new Response(JSON.stringify({ model: body.model, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }], usage: { input_tokens: 100, output_tokens: 100 } }), { status: 200, headers: { "content-type": "application/json" } });
};
