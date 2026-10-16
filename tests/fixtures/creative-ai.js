"use strict";
if (process.env.NODE_ENV !== "test") throw new Error("Creative fixture is test-only.");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
let printable = false;
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith("https://api.openai.com/v1/")) throw new Error("Unexpected fixture request");
  if (options.method === "DELETE") return Response.json({ deleted: true });
  if (String(url).endsWith("/files")) return Response.json({ id: "file_fixture" });
  if (String(url).endsWith("/responses")) {
    const body = JSON.parse(options.body);
    printable = body.input?.[0]?.content.includes("Mandatory cheatsheet print contract");
    const content = body.input?.[1]?.content;
    const text = Array.isArray(content) ? content.filter((item) => item.type === "input_text").map((item) => item.text).join("\n") : content || "";
    if (printable && text.includes("VERIFY_CHEATSHEET_CONTEXT")) { try {
      assert.ok(body.input[0].content.includes("English answer ON"));
      assert.ok(body.input[0].content.includes(text.includes("VERIFY_CHEATSHEET_REVISION") ? "Chinese explanation OFF" : "Chinese explanation ON"));
      assert.ok(body.input[0].content.includes("HTTP_STYLE_MARKER"));
      assert.ok(text.includes("HTTP_COURSE_EVIDENCE"));
      assert.ok(content.some((item) => item.type === "input_image" && item.image_url.startsWith("data:image/png;base64,")));
      if (text.includes("VERIFY_CHEATSHEET_REVISION")) assert.ok(body.tools[0].container.file_ids.length >= 2);
    } catch (error) { console.error("Creative fixture contract:", error.message); throw error; } }
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Fixture", annotations: [{ type: "container_file_citation", container_id: "cntr_fixture", file_id: "cfile_pdf", filename: "artifact.pdf" }, { type: "container_file_citation", container_id: "cntr_fixture", file_id: "cfile_png", filename: "preview.png" }] }] }] });
  }
  if (String(url).includes("/containers/")) return new Response(String(url).includes("cfile_png") ? png : printable ? fs.readFileSync(path.join(__dirname, "cheatsheet-a4.pdf")) : Buffer.from("%PDF-1.7\n%%EOF"));
  if (String(url).includes("/images/")) {
    if (JSON.parse(options.body).prompt.includes("SLOW")) await new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
    return Response.json({ data: [{ b64_json: png.toString("base64") }] });
  }
  throw new Error("Unexpected creative provider route");
};
