const { test } = require("node:test");
const assert = require("node:assert/strict");
const { inputContext, inputMessages, parseInput, ambiguousClock } = require("../lib/schedule-input");
const { audioUpload, transcribeAudio } = require("../lib/schedule-transcription");
const { createRecorder } = require("../public/schedule-voice");
const importer = require("../public/schedule-import");

test("ambiguous birthday clocks retain their source and offer noon/midnight on the stated date", () => {
  for (const clock of ["12点", "十二点", "12:30", "十二点半"]) {
    const source = `11月2号${clock}是我的朋友Liz的生日`;
    const [draft] = parseInput(JSON.stringify({ items: [{ kind: "EVENT", title: "Liz的生日", date: "2026-11-02", evidence: source }] }), "America/Toronto").items;
    assert.equal(draft.startsAt, "");
    assert.equal(draft.date, "2026-11-02");
    assert.equal(draft.timeAmbiguity.text, clock);
    assert.deepEqual(draft.timeAmbiguity.options, clock.includes("30") || clock.includes("半") ? ["12:30", "00:30"] : ["12:00", "00:00"]);
    assert.match(importer.draftIssues(draft)[0].message, /请选择时段/);
    for (const time of draft.timeAmbiguity.options) {
      const chosen = importer.withDatePart(draft, "time", time);
      assert.equal(chosen.startsAt, `2026-11-02T${time}`);
      assert.equal(chosen.warning, "");
      assert.deepEqual(importer.draftIssues(chosen), []);
      assert.match(importer.withDatePart(chosen, "time", "").warning, /请选择/);
    }
  }
});

test("clear dayparts stay intact and ambiguous recovery cannot borrow another plan's clock", () => {
  for (const source of ["中午12点生日", "凌晨12点生日", "下午三点", "12 pm birthday", "13点读书", "23点读书", "三点到四点", "十三点", "22:30", "十二点十五分", "12点一刻"]) assert.equal(ambiguousClock(source), null, source);
  assert.deepEqual(ambiguousClock("三点读书").options, ["03:00", "15:00"]);
  const rows = [{ kind: "EVENT", title: "生日", date: "2026-11-02" }];
  const single = parseInput(JSON.stringify({ items: rows }), "UTC", "11月2号12点生日");
  assert.equal(single.items[0].timeAmbiguity.text, "12点");
  const multiple = parseInput(JSON.stringify({ items: [...rows, { ...rows[0], title: "读书" }] }), "UTC", "11月2号12点生日，晚上八点读书");
  assert.ok(multiple.items.every((item) => !item.timeAmbiguity));
  for (const [source, time] of [["中午12点生日", "12:00"], ["凌晨12点生日", "00:00"]]) {
    const result = parseInput(JSON.stringify({ items: [{ ...rows[0], startsAt: `2026-11-02T${time}`, evidence: source }] }), "UTC");
    assert.equal(result.items[0].startsAt, `2026-11-02T${time}`);
    assert.equal(result.items[0].timeAmbiguity, undefined);
  }
  const guessed = parseInput(JSON.stringify({ items: [{ ...rows[0], startsAt: "2026-11-02T12:00", evidence: "11月2号12点生日" }] }), "UTC");
  assert.equal(guessed.items[0].startsAt, "");
});

test("ordinary-language context distinguishes the real local today from the selected calendar day", () => {
  const context = inputContext({ text: "明天下午三点读书", selectedDate: "2026-12-01", timeZone: "America/Toronto" }, new Date("2026-10-27T01:00Z"));
  assert.equal(context.today, "2026-10-26");
  assert.equal(context.selectedDate, "2026-12-01");
  const prompt = inputMessages(context);
  assert.match(prompt[0].content, /today 2026-10-26/);
  assert.match(prompt[0].content, /selected calendar day 2026-12-01/);
  assert.equal(prompt[1].content, context.text);
  for (const body of [{ text: "" }, { text: "x".repeat(6001) }, { text: "plan", timeZone: "bad/zone" }, { text: "plan", selectedDate: "2026-02-30" }]) assert.throws(() => inputContext(body));
});

test("personal plans and deadlines retain end times, notes and incomplete fields without writes", () => {
  const result = parseInput(JSON.stringify({ items: [
    { kind: "EVENT", title: "Discussion", startsAt: "2026-11-02T15:00", endsAt: "2026-11-02T16:00", notes: "Bring Lecture 3 notes" },
    { kind: "DDL", title: "Assignment", startsAt: "2026-11-03T20:00" },
    { kind: "EVENT", title: "Read", startsAt: "" }
  ] }), "America/Toronto");
  assert.equal(result.items[0].endsAt, "2026-11-02T16:00");
  assert.equal(result.items[0].notes, "Bring Lecture 3 notes");
  assert.equal(result.items[0].timeZone, "America/Toronto");
  assert.equal(result.items[2].startsAt, "");
  assert.equal(importer.duplicateIndex([{ ...result.items[0], course: "Schedule & Deadlines", startsAt: "2026-11-02T20:00:00.000Z" }]).has(result.items[0]), true);
  assert.ok(result.items[2].warning);
  assert.throws(() => parseInput('{"items":[{"kind":"EVENT","weekly":{}}]}', "UTC"));
  assert.throws(() => parseInput(JSON.stringify({ items: Array(31).fill({ kind: "EVENT" }) }), "UTC"));
  assert.throws(() => parseInput("invalid", "UTC"));
  assert.equal(parseInput('{"items":[],"clarification":"请补充重复结束日期"}', "UTC").clarification, "请补充重复结束日期");
});

const wav = Buffer.from("524946461400000057415645666d742000000000", "hex");
test("voice uploads validate bytes and limits and send a named multipart audio file", async () => {
  const file = audioUpload({ fileData: `data:audio/wav;base64,${wav.toString("base64")}` });
  assert.equal(file.type, "audio/wav");
  assert.throws(() => audioUpload({ fileData: "" }));
  assert.throws(() => audioUpload({ fileData: Buffer.from("not audio").toString("base64") }));
  assert.throws(() => audioUpload({ fileData: "A".repeat(12 * 1024 * 1024) }));
  let calls = 0;
  const text = await transcribeAudio(file, { apiKey: "test-key", request: async (url, options) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(options.body.get("model"), "gpt-transcribe");
    assert.equal(options.body.get("file").name, "schedule-recording.wav");
    assert.deepEqual(Buffer.from(await options.body.get("file").arrayBuffer()), wav);
    return Response.json({ text: "明天下午三点读书。" });
  } });
  assert.equal(text, "明天下午三点读书。"); assert.equal(calls, 1);
  await assert.rejects(transcribeAudio(file, { apiKey: "test", request: async () => Response.json({ text: "" }) }));
  await assert.rejects(transcribeAudio(file, { apiKey: "test", request: async () => Response.json({}, { status: 503 }) }));
});

function recorderHarness(overrides = {}) {
  const states = [], audio = [], instances = [], timers = new Map();
  let stops = 0;
  const stream = { getTracks: () => [{ stop: () => { stops++; } }] };
  class Recorder {
    static isTypeSupported(type) { return type === "audio/mp4"; }
    constructor(_stream, options) { this.mimeType = options.mimeType; this.state = "inactive"; instances.push(this); }
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; queueMicrotask(() => { this.ondataavailable({ data: new Blob(["audio"]) }); this.onstop(); }); }
  }
  const controller = createRecorder({ mediaDevices: { getUserMedia: async () => stream }, Recorder, secure: true,
    timers: { setTimeout: (callback, delay) => { timers.set(delay, callback); return delay; }, clearTimeout: (key) => timers.delete(key) },
    onState: (value) => states.push(value), onAudio: (value) => audio.push(value), ...overrides });
  return { controller, states, audio, instances, timers, stream, stops: () => stops };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("recording negotiates Safari-style MP4, stops tracks and emits audio only after stop", async () => {
  const harness = recorderHarness();
  await harness.controller.start();
  assert.equal(harness.controller.phase, "recording");
  assert.equal(harness.instances[0].mimeType, "audio/mp4");
  assert.equal(harness.audio.length, 0);
  harness.controller.stop(); await settle();
  assert.equal(harness.audio.length, 1);
  assert.equal(harness.stops(), 1);
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.controller.phase, "idle");
});

test("cancellation and navigation discard audio and release late microphone permission results", async () => {
  const harness = recorderHarness();
  await harness.controller.start(); harness.controller.cancel(); await settle();
  assert.equal(harness.audio.length, 0); assert.equal(harness.stops(), 1);
  let grant;
  const late = recorderHarness({ mediaDevices: { getUserMedia: () => new Promise((resolve) => { grant = resolve; }) } });
  const pending = late.controller.start(); late.controller.cancel(); grant(late.stream); await pending;
  assert.equal(late.stops(), 1); assert.equal(late.instances.length, 0);
});

test("recording length, size, permission errors and insecure pages have bounded, cleanup-safe outcomes", async () => {
  const timed = recorderHarness(); await timed.controller.start(); timed.timers.get(120000)(); await settle();
  assert.equal(timed.audio.length, 1); assert.equal(timed.stops(), 1);
  const large = recorderHarness(); await large.controller.start(); large.instances[0].ondataavailable({ data: { size: 8 * 1024 * 1024 + 1 } }); await settle();
  assert.equal(large.audio.length, 0); assert.equal(large.stops(), 1);
  const denied = recorderHarness({ mediaDevices: { getUserMedia: async () => { throw Object.assign(new Error(), { name: "NotAllowedError" }); } } });
  await denied.controller.start(); assert.match(denied.states.at(-1).message, /权限/);
  const insecure = recorderHarness({ secure: false }); await insecure.controller.start();
  assert.equal(insecure.controller.supported, false); assert.equal(insecure.instances.length, 0);
  assert.match(insecure.states.at(-1).message, /导入语音/);
});
