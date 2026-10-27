const assert = require("node:assert/strict");
const { test } = require("node:test");
const { searchSchools, findSchool } = require("../public/school-autocomplete");

test("school suggestions expand abbreviations and Chinese names to full school names", () => {
  for (const [query, expected] of [
    ["uoft", "University of Toronto"], ["U of T", "University of Toronto"],
    ["多伦多大学", "University of Toronto"], ["ubc", "University of British Columbia"],
    ["NYU", "New York University"], ["ucla", "University of California, Los Angeles"],
    ["mcmaster", "McMaster University"], ["seneca college", "Seneca Polytechnic"]
  ]) assert.equal(searchSchools(query)[0].name, expected);
});

test("school suggestions rank exact matches, limit results, and allow unknown schools", () => {
  assert.equal(searchSchools("University of Toronto")[0].name, "University of Toronto");
  assert.ok(searchSchools("university").length <= 8);
  assert.ok(searchSchools("多伦多").some((school) => school.name === "University of Toronto"));
  assert.deepEqual(searchSchools("   "), []);
  assert.deepEqual(searchSchools("My unlisted school"), []);
  assert.equal(findSchool("  UBC ").name, "University of British Columbia");
  assert.equal(findSchool("My unlisted school"), undefined);
});
