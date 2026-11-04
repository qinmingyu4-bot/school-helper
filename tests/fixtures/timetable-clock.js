"use strict";

// This HTTP fixture imports a November 2–9 timetable and checks both meetings.
// Keep its server before that teaching period, independent of the CI run date.
const NativeDate = Date;
const fixtureNow = NativeDate.UTC(2026, 10, 1, 12);
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [fixtureNow])); }
  static now() { return fixtureNow; }
};
