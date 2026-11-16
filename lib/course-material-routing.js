'use strict';
const { identity } = require('./import-courses');
function codes(value) {
  const text = String(value || '').normalize('NFKC').toUpperCase().replace(/_/g, ' ');
  return [...new Set((text.match(/\b[A-Z]{2,6}[ -]*\d{2,4}(?:[A-Z]\d[FSY]?|[A-Z])?\b/g) || [])
    .map(value => identity(value)?.code).filter(code => code && !/^(?:WEEK|UNIT|PART|CHAP|CHAPTER|SLIDE|NOTES|LESSON|YEAR|AT|ON|PAGE|FALL|WINTER|SPRING|SUMMER|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|MARCH|APRIL|JUNE|JULY|AUGUST)\d/.test(code)))];
}
function resolve(courses, fileName, text) {
  const available = courses.filter(c => c.chatType !== 'general' && c.name !== 'Schedule & Deadlines');
  // A filename's explicit code is the student's strongest filing signal. Otherwise
  // use the opening extracted text; ambiguous codes/terms always need a choice.
  const fromName = codes(fileName), detectedCodes = fromName.length ? fromName : codes(String(text || '').slice(0, 4000));
  const candidates = new Set();
  let unmatched = false;
  for (const code of detectedCodes) {
    const key = identity(code);
    const exact = available.filter(c => identity(c.name)?.code === code);
    const aliases = exact.length ? exact : available.filter(c => {
      const candidate = identity(c.name);
      return candidate?.base === key.base && (candidate.code === candidate.base || key.code === key.base);
    });
    if (!aliases.length) unmatched = true;
    aliases.forEach(c => candidates.add(c.id));
  }
  const courseIds = [...candidates];
  return { courseId: !unmatched && courseIds.length === 1 ? courseIds[0] : null, courseIds, detectedCodes,
    reason: !detectedCodes.length ? 'missing-code' : unmatched ? 'unknown-code' : courseIds.length > 1 ? 'ambiguous' : 'matched' };
}
module.exports = { codes, resolve };
