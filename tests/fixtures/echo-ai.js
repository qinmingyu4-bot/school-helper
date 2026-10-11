"use strict";

if (process.env.NODE_ENV !== "test") throw new Error("AI echo transport is test-only.");

// Echo the real server request to verify its prompt without external AI calls.
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith("https://api.openai.com/v1/")) {
    throw new Error(`Unexpected external request in AI test: ${url}`);
  }
  const body = JSON.parse(options.body);
  let content = JSON.stringify(body);
  if (body.messages?.[0]?.content.startsWith("Extract only DDL")) {
    const source = body.messages[1].content;
    if (source.includes("MALFORMED_SCHEDULE")) content = "invalid JSON";
    else content = JSON.stringify([
      { kind: "DDL", title: "Essay", course: "MAT101", startsAt: "2026-11-12T23:59", evidence: "Essay due Nov 12, 2026 at 23:59" },
      { kind: "LEC", title: "Lecture", startsAt: "2026-11-13T10:00" },
      { kind: "TUT", title: "Tutorial", startsAt: "", warning: "Time missing" }
    ]);
  }
  const payload = String(url).endsWith("/responses")
    ? { output: [{ type: "message", content: [{ type: "output_text", text: content }] }] }
    : { choices: [{ message: { content } }] };
  return new Response(JSON.stringify(payload), { status: 200 });
};
