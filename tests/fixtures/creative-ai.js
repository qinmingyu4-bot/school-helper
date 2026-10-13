"use strict";
if (process.env.NODE_ENV !== "test") throw new Error("Creative fixture is test-only.");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith("https://api.openai.com/v1/")) throw new Error("Unexpected fixture request");
  if (options.method === "DELETE") return Response.json({ deleted: true });
  if (String(url).endsWith("/files")) return Response.json({ id: "file_fixture" });
  if (String(url).endsWith("/responses")) return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Fixture", annotations: [{ type: "container_file_citation", container_id: "cntr_fixture", file_id: "cfile_pdf", filename: "artifact.pdf" }, { type: "container_file_citation", container_id: "cntr_fixture", file_id: "cfile_png", filename: "preview.png" }] }] }] });
  if (String(url).includes("/containers/")) return new Response(String(url).includes("cfile_png") ? png : Buffer.from("%PDF-1.7\n%%EOF"));
  if (String(url).includes("/images/")) {
    if (JSON.parse(options.body).prompt.includes("SLOW")) await new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
    return Response.json({ data: [{ b64_json: png.toString("base64") }] });
  }
  throw new Error("Unexpected creative provider route");
};
