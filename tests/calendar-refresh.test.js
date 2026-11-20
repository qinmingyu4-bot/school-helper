const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createCalendarService } = require('../lib/academic-calendar');
const { createCalendarSources, hash } = require('../lib/calendar-sources');
const { StudyBridgeDatabase } = require('../lib/database');
const { memoryDynamo } = require('./helpers/community-dynamo');
const url = 'https://www.artsci.utoronto.ca/current/dates-deadlines/academic-dates';
const quote = 'Fall 2026 classes begin September 8 and end December 7.';
const evidence = `University of Toronto St. George Arts & Science regular undergraduate academic dates. ${quote} All no-class holidays have been included.`;
const input = { school: 'uoft', termHint: { year: 2026, season: 'fall', campus: 'St. George', faculty: 'Arts & Science' }, today: '2026-11-20', model: 'sol' };
function payload(change = {}, search = false) {
  const value = { ...input.termHint, timeZone: 'America/Toronto', label: 'Fall 2026', ambiguous: false,
    scopeConfirmed: true, breaksConfirmed: true, teachingPeriods: [{ startDate: '2026-09-08', endDate: '2026-12-07', sourceUrl: url, evidence: quote }],
    breaks: [], replacements: [], sources: [{ url, title: 'Official academic dates' }], ...change };
  return { output_text: JSON.stringify(value), output: search ? [{ type: 'web_search_call', action: { sources: [{ url }] } }] : [] };
}
async function fixture(t, dynamo) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-calendar-refresh-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = dynamo ? memoryDynamo().store : null;
  const database = () => { const db = new StudyBridgeDatabase(); db.local.file = path.join(directory, 'db.json'); db.dynamo = store; return db; };
  const archive = (db) => ({ get: (k) => db.getAcademicCalendar(k), put: (k, v) => db.putAcademicCalendar(k, v), changeState: (k, fn) => db.changeCalendarRefresh(k, fn) });
  return { database, archive };
}
for (const dynamo of [false, true]) test(`${dynamo ? 'DynamoDB' : 'local'} demand-only checks survive restart, reuse the term and revalidate changes explicitly`, async (t) => {
  const { database, archive } = await fixture(t, dynamo);
  let time = Date.parse('2026-11-20T12:00:00Z'), text = evidence, calls = 0;
  const options = { now: () => new Date(time), simpleModel: 'luna', sources: { read: async (source) => {
    if (source !== url) throw Error('Other school');
    return { url: source, finalUrl: source, text, digest: hash(text) };
  } }, request: async (body) => {
    const { school, term } = JSON.parse(body.input[1].content);
    if (school !== 'University of Toronto' || term.campus !== 'St. George' || term.year !== 2026 || term.season !== 'fall') throw Error('Other term');
    calls++;
    assert.equal(body.model, 'luna'); assert.equal(body.tools, undefined);
    return payload();
  } };
  let service = createCalendarService({ ...options, archive: archive(database()) });
  const initial = await service.lookup(input);
  assert.ok(initial.calendar); assert.equal(calls, 1);
  service = createCalendarService({ ...options, archive: archive(database()) });
  await service.refresh('sol'); assert.equal(calls, 1, 'A restart does not skip the durable next-check time');
  time += 13 * 3600000;
  await service.lookup({ ...input, revalidate: true }); assert.equal(calls, 1, 'Unchanged pages do not trigger a model');
  const checked = await service.lookup(input);
  assert.equal(checked.calendar.verifiedAt, initial.calendar.verifiedAt);
  assert.notEqual(checked.calendar.checkedAt, initial.calendar.checkedAt);
  text += ' Updated official notice.'; time += 13 * 3600000;
  await service.refresh('sol'); assert.equal(calls, 1, 'Time passing never schedules discovery');
  await service.lookup({ ...input, revalidate: true }); assert.equal(calls, 2);
});

for (const dynamo of [false, true]) test(`${dynamo ? 'DynamoDB' : 'local'} failed lookups back off durably and concurrent workers claim once`, async (t) => {
  const { database, archive } = await fixture(t, dynamo), db = database();
  let time = Date.parse('2026-11-20T12:00:00Z'), calls = 0;
  const options = { now: () => new Date(time), request: async () => { calls++; throw Error('provider unavailable'); } };
  const a = createCalendarService({ ...options, archive: archive(db) });
  const b = createCalendarService({ ...options, archive: archive(dynamo ? database() : db) });
  await Promise.all([a.lookup(input), b.lookup(input)]); assert.equal(calls, 1);
  const restart = createCalendarService({ ...options, archive: archive(database()) });
  await restart.lookup(input); assert.equal(calls, 1);
  time += 6 * 3600000;
  await restart.lookup(input); assert.equal(calls, 2);
  time += 6 * 3600000;
  await restart.lookup(input); assert.equal(calls, 2, 'Second failure doubles cooldown');
  time += 6 * 3600000;
  await restart.lookup(input); assert.equal(calls, 3);
});

test('ambiguous, unsupported or complex dates escalate once; fabricated source evidence is rejected', async () => {
  for (const kind of ['ambiguous', 'bad-source', 'bad-date', 'no-quote', 'replacement', 'complex-page', 'scope']) {
    const models = [];
    const change = { ambiguous: { ambiguous: true }, 'bad-source': { sources: [{ url: 'https://evil.test' }] },
      'bad-date': { teachingPeriods: [{ startDate: '2026-02-30', endDate: '2026-12-07', sourceUrl: url, evidence: quote }] },
      'no-quote': { teachingPeriods: [{ startDate: '2026-09-08', endDate: '2026-12-07', sourceUrl: url, evidence: 'invented evidence sentence' }] },
      replacement: { replacements: [{ date: '2026-12-07', weekday: 5, sourceUrl: url }] }, scope: { campus: 'Scarborough' } }[kind] || {};
    const service = createCalendarService({ simpleModel: 'luna', sources: { read: async () => ({ url, finalUrl: url, text: evidence + (kind === 'complex-page' ? ' Mandatory make-up day.' : ''), digest: kind }) },
      request: async (body) => { models.push(body.model); return body.model === 'luna' ? payload(change) : payload({}, true); } });
    assert.ok((await service.lookup(input)).calendar, kind);
    assert.deepEqual(models, kind === 'complex-page' ? ['sol'] : ['luna', 'sol'], kind);
  }
});

test('storage failures and provider outages do not amplify paid requests', async () => {
  let calls = 0;
  const request = async () => { calls++; throw Object.assign(Error('unavailable'), { statusCode: 429 }); };
  const failedStore = createCalendarService({ archive: { get: async () => null, changeState: async () => { throw Error('storage'); } }, request });
  assert.equal((await failedStore.lookup(input)).calendar, null); assert.equal(calls, 0);
  const service = createCalendarService({ sources: { read: async () => ({ url, finalUrl: url, text: evidence, digest: 'same' }) }, request });
  assert.equal((await service.lookup(input)).calendar, null); assert.equal(calls, 1, 'No Sol retry after a rate limit');
});

test('startup and scheduled compatibility entry points never query calendars', async () => {
  let calls = 0;
  const service = createCalendarService({ request: async () => { calls++; throw Error('unexpected'); } });
  service.start('sol'); await service.refresh('sol'); service.stop();
  assert.equal(calls,0);
});

test('official source reader reuses parsed pages, handles PDFs, and rejects off-domain redirects and oversized evidence', async () => {
  let calls = 0, time = 0, parses = 0;
  const sources = createCalendarSources({ now: () => time, request: async () => { calls++; return new Response(`<nav>Ignore navigation</nav><main>${evidence}</main>`, { headers: { 'content-type': 'text/html' } }); } });
  const [a, b] = await Promise.all([sources.read(url, 'utoronto.ca'), sources.read(url, 'utoronto.ca')]);
  assert.equal(calls, 1); assert.equal(a.digest, b.digest); assert.doesNotMatch(a.text, /navigation/);
  time += 16 * 60000; await sources.read(url, 'utoronto.ca'); assert.equal(calls, 2);
  const pdf = createCalendarSources({ request: async () => new Response('%PDF-fixture', { headers: { 'content-type': 'application/pdf' } }), parsePdf: async () => { parses++; return { text: evidence }; } });
  await pdf.read(url, 'utoronto.ca'); await pdf.read(url, 'utoronto.ca'); assert.equal(parses, 1);
  const redirect = createCalendarSources({ request: async () => new Response(null, { status: 302, headers: { location: 'https://evil.test/' } }) });
  await assert.rejects(redirect.read(url, 'utoronto.ca'), /official domain/);
  await assert.rejects(redirect.read('https://utoronto.ca:8443/test', 'utoronto.ca'), /Invalid/);
  const oversized = createCalendarSources({ request: async () => new Response('x'.repeat(60001), { headers: { 'content-type': 'text/plain' } }) });
  await assert.rejects(oversized.read(url, 'utoronto.ca'), /deeper reading/);
});

test('a changed PDF link or changed PDF bytes invalidate source digests even if visible date text is the same', async () => {
  let time = 0, revision = 1;
  const html = createCalendarSources({ now: () => time, request: async () => new Response(`<main>${evidence}<a href="/calendar-${revision}.pdf">Calendar</a></main>`, { headers: { 'content-type': 'text/html' } }) });
  const old = await html.read(url, 'utoronto.ca'); revision++; time += 16 * 60000;
  assert.notEqual((await html.read(url, 'utoronto.ca')).digest, old.digest);
  const pdf = createCalendarSources({ now: () => time, request: async () => new Response(`%PDF-layout-${revision}`, { headers: { 'content-type': 'application/pdf' } }), parsePdf: async () => ({ text: evidence }) });
  const oldPdf = await pdf.read(url, 'utoronto.ca'); revision++; time += 16 * 60000;
  assert.notEqual((await pdf.read(url, 'utoronto.ca')).digest, oldPdf.digest);
});

test('a worker reads another worker\'s refreshed shared calendar instead of retaining stale process cache', async (t) => {
  const { database, archive } = await fixture(t, true);
  const db = database(), store = archive(db);
  let key; const put = store.put;
  store.put = (savedKey, value) => { key = savedKey; return put(savedKey, value); };
  const service = createCalendarService({ archive: store, request: async () => payload({}, true) });
  const first = await service.lookup(input);
  await db.putAcademicCalendar(key, { ...first.calendar, label: 'Updated official calendar' });
  assert.equal((await service.lookup(input)).calendar.label, 'Updated official calendar');
});
