const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCalendarService, officialUrl, timetableScope } = require("../lib/academic-calendar");

const sourceUrl = "https://www.artsci.utoronto.ca/current/dates-deadlines/academic-dates";
function payload(change = {}) {
  const calendar = { year: 2026, season: "fall", label: "Fall teaching term", campus: "St. George", timeZone: "America/Toronto", scopeConfirmed: true, breaksConfirmed: true,
    teachingPeriods: [{ startDate: "2026-09-08", endDate: "2026-12-07", sourceUrl }], breaks: [{ startDate: "2026-10-26", endDate: "2026-10-30", sourceUrl }],
    sources: [{ url: sourceUrl, title: "Official dates" }], ...change };
  return { status: "completed", output: [{ type: "web_search_call", action: { sources: [{ url: sourceUrl }] } }, { type: "message", content: [{ type: "output_text", text: JSON.stringify(calendar) }] }] };
}
const input = { school: "uoft", termHint: { year: 2026, season: "fall", campus: "St. George" }, today: "2026-10-26", courseCodes: ["FOR200H1F"], model: "test-model" };

test("academic calendars require live university-domain evidence, preserve dates and cache by term/scope", async () => {
  let calls = 0;
  const service = createCalendarService({ now: () => new Date("2026-10-26T16:00:00Z"), request: async (body) => {
    calls++;
    assert.deepEqual(body.tools[0].filters.allowed_domains, ["utoronto.ca"]);
    assert.deepEqual(body.include, ["web_search_call.action.sources"]);
    assert.equal(body.store, false);
    assert.equal(body.tool_choice, "required");
    const searchInput = JSON.parse(body.input[1].content);
    assert.deepEqual(searchInput.courseCodes, ["FOR200H1F"]);
    assert.equal(searchInput.school, "University of Toronto");
    return payload();
  } });
  const first = await service.lookup(input);
  assert.equal(first.calendar.teachingPeriods[0].endDate, "2026-12-07");
  assert.equal(first.calendar.breaks.length, 1);
  assert.equal(first.calendar.verifiedAt, "2026-10-26T16:00:00.000Z");
  await service.lookup(input);
  assert.equal(calls, 1);
  await service.lookup({ ...input, termHint: { ...input.termHint, campus: "Scarborough" } });
  assert.equal(calls, 2);
});

test("missing or mismatched sources, scope, years, closures and incomplete responses fail closed without inventing dates", async () => {
  for (const response of [payload({ year: 2025 }), payload({ campus: "Scarborough" }), payload({ scopeConfirmed: false }), payload({ breaksConfirmed: false }), payload({ sources: [{ url: "https://utoronto.ca.evil.example/calendar" }] }),
    payload({ teachingPeriods: [{ startDate: "2026-09-08", endDate: "2026-12-07", sourceUrl: "https://www.artsci.utoronto.ca/not-consulted" }] }), { ...payload(), status: "incomplete" },
    { status: "completed", output_text: "null", output: [] }]) {
    const service = createCalendarService({ request: async () => response });
    const result = await service.lookup(input);
    assert.equal(result.calendar, null);
    assert.match(result.notice, /一次/);
  }
  assert.equal(officialUrl("https://utsc.utoronto.ca/dates", "utoronto.ca"), true);
  assert.equal(officialUrl("http://utoronto.ca/dates", "utoronto.ca"), false);
  assert.equal(officialUrl("https://utoronto.ca@evil.example", "utoronto.ca"), false);
});

test("unsupported schools do not trigger arbitrary internet requests and outages preserve a one-time manual fallback", async () => {
  let calls = 0;
  const service = createCalendarService({ request: async () => { calls++; throw new Error("Network unavailable"); } });
  assert.equal((await service.lookup({ ...input, school: "Unlisted school" })).calendar, null);
  assert.equal(calls, 0);
  assert.equal((await service.lookup(input)).calendar, null);
  assert.equal(calls, 1);
});

test("verified calendars survive a new service instance and match only the same timetable scope", async (context) => {
  const fs = require("node:fs/promises");
  const path = require("node:path");
  const os = require("node:os");
  const { LocalStore } = require("../lib/local-store");
  const { StudyBridgeDatabase } = require("../lib/database");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-calendar-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  function archive() {
    const db = new StudyBridgeDatabase();
    db.dynamo = null;
    db.local = new LocalStore(path.join(directory, "calendar.json"));
    return { get: (key) => db.getAcademicCalendar(key), put: (key, value) => db.putAcademicCalendar(key, value) };
  }
  const first = createCalendarService({ archive: archive(), request: async () => payload() });
  const original = await first.lookup({ ...input, courseCodes: ["FOR200H1F", "MAT100H1F"] });
  const second = createCalendarService({ archive: archive(), request: async () => assert.fail("Archived lookup must stay offline") });
  const archived = await second.lookup({ ...input, courseCodes: ["MAT100H1F", "FOR200H1F"], allowSearch: false });
  assert.deepEqual(archived.calendar, original.calendar);
  assert.match(archived.notice, /存档/);
  assert.equal((await second.lookup({ ...input, allowSearch: false })).calendar, null);
});

test("preloaded undergraduate terms retain official closures and stay separate from special programs and winter sessions", async () => {
  const service = createCalendarService({ request: async () => assert.fail("Preloaded lookup must stay offline") });
  const base = { today: "2026-11-06", allowSearch: false };
  const waterloo = await service.lookup({ ...base, school: "waterloo", termHint: { year: 2027, season: "winter", faculty: "Undergraduate" } });
  assert.deepEqual(waterloo.calendar.replacements.map(({ date, weekday }) => [date, weekday]), [["2027-04-12", 5]]);
  const berkeley = await service.lookup({ ...base, school: "UC Berkeley", termHint: { year: 2026, season: "fall", faculty: "Undergraduate" } });
  assert.equal(berkeley.calendar.teachingPeriods[0].endDate, "2026-12-04");
  const hkust = { ...base, school: "香港科技大學", termHint: { year: 2027, season: "spring", faculty: "Undergraduate" } };
  assert.equal((await service.lookup(hkust)).calendar.timeZone, "Asia/Hong_Kong");
  for (const hint of [{ season: "winter" }, { faculty: "MBA" }, { campus: "Guangzhou" }, { season: "" }]) {
    assert.equal((await service.lookup({ ...hkust, termHint: { ...hkust.termHint, ...hint } })).calendar, null);
  }
});

test("scheduled prefetch skips recent records and stores newly verified terms without replacing good data on failure", async () => {
  const records = new Map();
  const archive = { get: async (key) => records.get(key), put: async (key, value) => records.set(key, value) };
  let now = new Date("2026-11-07T12:00:00Z");
  const requests = [];
  const sourceUrl = "https://uwaterloo.ca/important-dates/undergraduate";
  const request = async (body) => {
    const { school, term, courseCodes } = JSON.parse(body.input[1].content);
    requests.push({ school, ...term });
    assert.deepEqual(courseCodes, []);
    if (school !== "University of Waterloo" || term.year !== 2027 || term.season !== "fall" || now.getUTCFullYear() !== 2026) {
      throw new Error("Official dates unavailable");
    }
    return { output_text: JSON.stringify({
      ...term, timeZone: "America/Toronto", scopeConfirmed: true, breaksConfirmed: true,
      teachingPeriods: [{ startDate: "2027-09-08", endDate: "2027-12-07", sourceUrl }], sources: [{ url: sourceUrl }]
    }), output: [{ type: "web_search_call", action: { sources: [{ url: sourceUrl }] } }] };
  };
  const service = createCalendarService({ archive, request, now: () => now });
  await Promise.all([service.refresh("test-model"), service.refresh("test-model")]);
  assert.deepEqual(requests.filter((entry) => entry.school === "University of Waterloo").map(({ year, season }) => [year, season]), [[2027, "fall"]]);
  const term = { school: "waterloo", termHint: { year: 2027, season: "fall", faculty: "Undergraduate" }, today: "2027-09-01", allowSearch: false };
  const saved = await service.lookup(term);
  assert.equal(saved.calendar.teachingPeriods[0].startDate, "2027-09-08");
  now = new Date("2027-08-01T12:00:00Z");
  await service.refresh("test-model");
  assert.deepEqual(await service.lookup(term), saved);
});

test("Toronto winter archives separate campuses, faculties and optional makeup dates without searching", async () => {
  const service = createCalendarService({ request: async () => assert.fail("Known term must use the archive") });
  const events = [];
  const request = { school: "uoft", today: "2026-11-06", onProgress: (phase) => events.push(phase), termHint: { year: 2027, season: "winter", campus: "St. George", faculty: "Faculty of Arts and Science" } };
  for (const courseCodes of [["MAT137H1"], ["CSC108H1", "STA130H1"]]) {
    const { calendar, notice } = await service.lookup({ ...request, courseCodes });
    assert.equal(calendar.teachingPeriods[0].endDate, "2027-04-09");
    assert.match(notice, /教师自行决定/);
    const meetings = require("../public/schedule-import").expandWeekly([{ kind: "LEC", title: "Lecture", weekly: { weekdays: [5], startTime: "10:00", endTime: "11:00" } }], calendar, { fromDate: "2027-01-01" });
    assert.equal(meetings.length, 11);
    assert.ok(meetings.every((item) => !/2027-(02-19|03-26|04-12)/.test(item.startsAt)));
  }
  assert.deepEqual(events, ["calendar-cache", "calendar-cached", "calendar-cache", "calendar-cached"]);
  const utsc = await service.lookup({ ...request, termHint: { ...request.termHint, campus: "UTSC", faculty: "Undergraduate" } });
  assert.equal(utsc.calendar.teachingPeriods[0].endDate, "2027-04-12");
  assert.equal(utsc.calendar.replacements[0].weekday, 5);
  for (const hint of [{ campus: "UTM" }, { campus: "" }, { faculty: "Engineering" }, { faculty: "" }, { year: 2026 }]) {
    assert.equal((await service.lookup({ ...request, allowSearch: false, termHint: { ...request.termHint, ...hint } })).calendar, null);
  }
});

test("known university scopes share newly verified archives across course sets and restarts", async () => {
  const records = new Map();
  const archive = { get: async (key) => records.get(key), put: async (key, calendar) => records.set(key, calendar) };
  const request = { ...input, termHint: { ...input.termHint, faculty: "Arts & Science" } };
  const phases = [];
  const service = createCalendarService({ archive, request: async () => payload({ faculty: "Arts & Science" }) });
  const original = await service.lookup({ ...request, onProgress: (phase) => phases.push(phase) });
  assert.deepEqual(phases, ["calendar-cache", "calendar-search"]);
  assert.equal(records.size, 1);
  const restarted = createCalendarService({ archive, request: async () => assert.fail("Verified scope should be reused") });
  assert.deepEqual((await restarted.lookup({ ...request, courseCodes: ["CSC108H1"] })).calendar, original.calendar);
  assert.equal((await restarted.lookup({ ...request, allowSearch: false, termHint: { ...request.termHint, campus: "UTM" } })).calendar, null);
});

test("timetable scope uses source campus before profile and rejects mixed or conflicting Toronto campuses", () => {
  const profile = { campus: "St. George", faculty: "Arts & Science" };
  assert.equal(timetableScope("uoft", {}, ["MAT137H1S"], profile).campus, "St. George");
  assert.equal(timetableScope("uoft", {}, [], profile).faculty, "Arts & Science");
  const utsc = timetableScope("uoft", { campus: "UTSC" }, ["MATA31H3"], profile);
  assert.equal(utsc.campus, "UTSC");
  assert.equal(utsc.faculty, undefined);
  assert.equal(timetableScope("uoft", {}, ["MATA31H3", "MAT137H1"], profile).campus, "Multiple campuses");
  assert.equal(timetableScope("uoft", { campus: "St. George" }, ["MATA31H3"], profile).campus, "Conflicting campus evidence");
});

test("calendar failures record safe categories without leaking provider or timetable content", async () => {
  const messages = [];
  const service = createCalendarService({ onError: (message) => messages.push(message), request: async () => { throw new Error("PRIVATE_PROVIDER_RESPONSE"); } });
  assert.equal((await service.lookup(input)).calendar, null);
  assert.deepEqual(messages, ["Academic calendar lookup failed (request-or-verification-failed)."]);
});
