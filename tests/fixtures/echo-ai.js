"use strict";

if (process.env.NODE_ENV !== "test") throw new Error("AI echo transport is test-only.");

// Echo the real server request to verify its prompt without external AI calls.
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith("https://api.openai.com/v1/")) {
    throw new Error(`Unexpected external request in AI test: ${url}`);
  }
  if (String(url).endsWith("/audio/transcriptions")) {
    if (!(options.body instanceof FormData) || !options.body.get("file")?.size || options.body.get("model") !== "gpt-transcribe") throw new Error("Transcription must send multipart audio and the configured model.");
    return Response.json({ text: "明天下午三点到四点在图书馆复习。" });
  }
  const body = JSON.parse(options.body);
  if (body.messages?.[0]?.content.startsWith("StudyBridge problem-set")) {
    if (body.store !== false || !options.signal || body.stream) throw new Error("Problem-set workers must be bounded and private.");
    const last = body.messages[1].content;
    const input = JSON.parse(typeof last === "string" ? last : last.find((part) => part.type === "text").text);
    if (body.messages[0].content.startsWith("StudyBridge problem-set planning")) {
      return Response.json({ choices: [{ message: { content: JSON.stringify({ questions: input.questions.map(({ id }) => ({ id, queries: ["opportunity cost", "机会成本"], dependsOn: [] })) }) } }] });
    }
    if (!body.messages[0].content.includes("check all alternatives")) throw new Error("Problem-set answer requests must retain the academic accuracy instruction.");
    await require("node:timers/promises").setTimeout(Number(process.env.TEST_STUDY_DELAY || 250), undefined, { signal: options.signal });
    const answers = input.questions.map((question) => ({ id: question.id, parts: question.parts.map((id) => {
      const evidence = input.evidence[question.id];
      if (evidence.some((source) => /FOREIGN_(?:COURSE|CHAT)/.test(source.text))) throw new Error("Cross-scope evidence leaked.");
      return { id, status: "done", basis: evidence.length ? "derived" : "general", sources: evidence.length ? [evidence[0].ref] : [], text: `Method and working for ${question.id}(${id}). Final answer: opportunity cost. MATH_TASK_FIXTURE${process.env.TEST_STUDY_REPORT_MODEL === "true" ? ` MODEL=${body.model}` : ""}` };
    }) }));
    return Response.json({ choices: [{ message: { content: JSON.stringify({ answers }) } }] });
  }
  if (body.messages?.[0]?.content.startsWith("StudyBridge course-search-query-expansion/v1.")) {
    if (body.store !== false || body.stream || !options.signal || body.messages.length !== 2) throw new Error("Search expansion must be a bounded, non-stored, non-streaming request.");
    const question = JSON.parse(body.messages[1].content).question;
    if (question.includes("SEARCH_EXPANSION_FAIL")) return new Response("Unavailable", { status: 503 });
    return Response.json({ choices: [{ message: { content: JSON.stringify({ queries: ["opportunity cost", "alternative forgone", "机会成本"] }) } }] });
  }
  if (typeof body.input?.[0]?.content === "string" && body.input[0].content.startsWith("Find official academic teaching dates")) {
    const sourceUrl = "https://rotmancommerce.utoronto.ca/current-students/international-student-welcome-guide/important-dates-and-deadlines-for-rotman-commerce-international-students/";
    const calendar = { year: 2026, season: "fall", label: "2026 Fall teaching term", campus: "St. George / Arts & Science", timeZone: "America/Toronto", scopeConfirmed: true, breaksConfirmed: true,
      teachingPeriods: [{ startDate: "2026-09-08", endDate: "2026-12-07", sourceUrl }],
      breaks: [{ startDate: "2026-10-12", endDate: "2026-10-12", label: "Thanksgiving", sourceUrl }, { startDate: "2026-10-26", endDate: "2026-10-30", label: "Reading week", sourceUrl }], replacements: [], sources: [{ url: sourceUrl, title: "University official academic dates (test fixture)" }] };
    return new Response(JSON.stringify({ status: "completed", output: [{ type: "web_search_call", action: { sources: [{ url: sourceUrl }] } }, { type: "message", content: [{ type: "output_text", text: JSON.stringify(calendar) }] }] }), { status: 200 });
  }
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
  if (body.messages?.[0]?.content.startsWith("Turn the student's everyday language")) {
    const prompt = body.messages[0].content;
    const text = body.messages[1].content;
    const expectedModel = text.length > 900
      ? process.env.OPENAI_COMPLEX_MODEL || process.env.STUDYBRIDGE_COMPLEX_MODEL || "gpt-6.1-sol"
      : process.env.OPENAI_SIMPLE_MODEL || process.env.STUDYBRIDGE_SIMPLE_MODEL || process.env.OPENAI_MODEL || "gpt-6-luna";
    if (body.model !== expectedModel || body.store !== false) throw new Error("Schedule text must use the configured size-appropriate model without provider storage.");
    const today = prompt.match(/today (\d{4}-\d{2}-\d{2})/)[1];
    const selectedDate = prompt.match(/calendar day (\d{4}-\d{2}-\d{2})/)[1];
    const date = text.includes("明天") ? new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10) : selectedDate;
    content = text.includes("Liz") ? JSON.stringify({ items: [{ kind: "EVENT", title: "Liz的生日", date: "2026-11-02", evidence: text, startsAt: text.includes("中午") ? "2026-11-02T12:00" : text.includes("凌晨") ? "2026-11-02T00:00" : "", ambiguousTime: text.includes("中午") || text.includes("凌晨") ? "" : "12点" }] }) : text.includes("FORMAT_BAD") ? "invalid" : text.includes("每周") ? JSON.stringify({ items: [], clarification: "请补充重复安排的结束日期。" }) : JSON.stringify({ items: [
      { kind: "EVENT", title: "图书馆复习", startsAt: text.includes("没说时间") ? "" : `${date}T15:00`, endsAt: text.includes("没说时间") ? "" : `${date}T16:00`, location: "图书馆", notes: "带上 Lecture 3 笔记", evidence: text },
      ...(text.includes("作业") ? [{ kind: "DDL", title: "STA437 作业", course: "STA437", startsAt: `${date}T20:00`, evidence: "晚上八点交作业" }] : [])
    ] });
  }
  if (body.messages?.[0]?.content.startsWith("Extract only DDL")) {
    const input = body.messages[1].content;
    const source = typeof input === "string" ? input : input.filter((part) => part.type === "text").map((part) => part.text).join("\n");
    if (source.includes("weekly-timetable-fixture.png") && (!Array.isArray(input) || !input.some((part) => part.type === "image_url" && part.image_url.detail === "high"))) throw new Error("Timetable images must retain their original layout in high detail.");
    if (source.includes("weekly-timetable-fixture.pdf") && (!Array.isArray(input) || !input.some((part) => part.type === "file"))) throw new Error("Timetable PDFs must include original page visuals.");
    if (source.includes("MALFORMED_SCHEDULE")) content = "invalid JSON";
    else if (source.includes("syllabus-assessments-fixture")) {
      if (!body.messages[0].content.includes("prioritize every explicitly scheduled quiz") || !body.messages[0].content.includes("they are separate tasks")) throw new Error("Syllabus extraction must prioritize assessments without replacing their host lectures.");
      content = JSON.stringify([
        { kind: "LEC", title: "MAT101H1 Course lecture", course: "MAT 101H1", startsAt: "2026-11-02T10:00", evidence: "Lecture Monday Nov 2, 10:00" },
        { kind: "DDL", title: "Quiz 1", course: "MAT101H1", startsAt: "2026-11-02T10:00", evidence: "Quiz 1 during the November 2 lecture, 10:00" },
        { kind: "DDL", title: "Midterm exam", course: "MAT101H1", startsAt: "2026-11-04T18:00", evidence: "Midterm November 4, 18:00" },
        { kind: "DDL", title: "Assignment 1", course: "MAT101H1", startsAt: "2026-11-06T23:59", evidence: "Assignment 1 due November 6, 23:59" }
      ]);
    }
    else if (source.includes("weekly-no-calendar-fixture")) content = JSON.stringify({ items: [{ kind: "LEC", title: "QA801H1 LEC0101", course: "QA801H1", weekly: { weekdays: [1], startTime: "10:00", endTime: "11:00", startDate: "2026-11-02", endDate: "2026-11-09" } }] });
    else if (source.includes("review-validation-fixture")) content = JSON.stringify({ items: [1, 2, 3].map((number) => ({ kind: "DDL", title: `Quiz ${number}`, course: "QA803H1", date: `2027-04-0${number}`, startsAt: "", evidence: `Quiz ${number} on April ${number}, 2027; exact time not stated.` })) });
    else if (source.includes("portfolio-date-only-fixture")) content = JSON.stringify({ items: [{ kind: "DDL", title: "Portfolio", course: "MAT329Y1", startsAt: "", notes: "Due 2027-04-09; submission time not stated.", evidence: "Portfolios are due on April 9, 2027. Late portfolios will not be accepted after April 14, 2027." }] });
    else if (/weekly-(?:timetable|missing-day)-fixture/.test(source)) content = JSON.stringify({ termHint: { year: 2026, season: "fall", campus: "St. George", faculty: "Arts & Science" }, items: [
      { kind: "TUT", title: "FOR200H1F TUT0105", course: "FOR200H1F", weekly: { weekdays: source.includes("weekly-missing-day-fixture") ? [] : [1], startTime: "10:00", endTime: "11:00" }, location: "SS 2127", evidence: "Monday 10:00–11:00 FOR200H1F TUT0105 SS 2127" }
    ] });
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
