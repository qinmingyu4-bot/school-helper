const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCalendarService, officialUrl } = require("../lib/academic-calendar");

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
