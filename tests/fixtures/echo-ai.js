"use strict";

if (process.env.NODE_ENV !== "test") throw new Error("AI echo transport is test-only.");

// Echo the real server request to verify its prompt without external AI calls.
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith("https://api.openai.com/v1/")) {
    throw new Error(`Unexpected external request in AI test: ${url}`);
  }
  const body = JSON.parse(options.body);
  if (!body.stream && JSON.stringify(body.messages || body.input).includes("NONSTREAM_INCOMPLETE")) {
    const incomplete = String(url).endsWith("/responses") ? { status: "incomplete", output_text: "Unfinished provider answer" }
      : { choices: [{ finish_reason: "length", message: { content: "Unfinished provider answer" } }] };
    return new Response(JSON.stringify(incomplete), { status: 200 });
  }
  if (body.stream) {
    const responses = String(url).endsWith("/responses");
    const last = (body.messages || body.input).at(-1).content;
    const question = typeof last === "string" ? last : JSON.stringify(last);
    if (responses && question.includes("STREAM_EARLY_FAIL")) return new Response('{"error":"web_search unavailable"}', { status: 400 });
    const answer = "逐步输出中文😀。\n\n" + JSON.stringify(body);
    const encode = (payload) => `data: ${JSON.stringify(payload)}\r\n\r\n`;
    const frames = responses ? [
      { type: "response.created" },
      { type: "response.reasoning_summary_text.delta", delta: "PRIVATE_REASONING_MUST_NOT_APPEAR" },
      { type: "response.web_search_call.searching" },
      { type: "response.web_search_call.completed" }
    ] : [{ choices: [{ delta: { role: "assistant" } }] }];
    const parts = Array.from(answer);
    for (let i = 0; i < parts.length; i += 100) {
      const text = parts.slice(i, i + 100).join("");
      frames.push(responses ? { type: "response.output_text.delta", delta: text } : { choices: [{ delta: { content: text } }] });
      if (question.includes("STREAM_FAIL_AFTER")) {
        frames.push(responses ? { type: "response.failed", response: { error: { message: "INTERNAL_PROVIDER_DETAIL" } } } : { error: { message: "INTERNAL_PROVIDER_DETAIL" } });
        break;
      }
      if (question.includes("STREAM_TRUNCATED") || question.includes("STREAM_ABORT")) break;
    }
    if (!["STREAM_FAIL_AFTER", "STREAM_TRUNCATED", "STREAM_ABORT"].some((marker) => question.includes(marker))) {
      frames.push(responses ? { type: "response.completed", response: { output_text: answer } } : { choices: [{ delta: {}, finish_reason: "stop" }] });
    }
    let index = 0;
    let aborted = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        options.signal?.addEventListener("abort", () => { aborted = true; controller.error(options.signal.reason); }, { once: true });
      },
      async pull(controller) {
        await new Promise((resolve) => setTimeout(resolve, question.includes("STREAM_SLOW") ? 40 : 5));
        if (aborted) return;
        if (index < frames.length) controller.enqueue(encoder.encode(encode(frames[index++])));
        else if (question.includes("STREAM_ABORT")) await new Promise((resolve) => options.signal.addEventListener("abort", resolve, { once: true }));
        else controller.close();
      }
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream" } });
  }
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
