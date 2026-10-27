const { randomUUID } = require("node:crypto");

function identity(value) {
  if (typeof value !== "string") return null;
  const name = String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!name || name.length > 100 || /^(?:unknown|n\/?a|tbd|none|course|课程|未识别(?:课程)?|未知(?:课程)?|未指定|未提供|暂无|无|待定|Schedule & Deadlines)$/i.test(name)
    || /^(?:LEC|TUT|LAB|PRA)[\s-]*\d+$/i.test(name)) return null;
  const codes = [...new Set((name.toUpperCase().match(/\b[A-Z]{2,6}[\s-]*\d{2,4}[A-Z0-9]*\b/g) || [])
    .filter((code) => !/^(LEC|TUT|LAB|PRA)[\s-]*\d/.test(code)).map((code) => code.replace(/[\s-]/g, "").replace(/([A-Z]\d)[FSY]$/, "$1")))];
  if (codes.length > 1) return null;
  if (!codes.length) return { key: `name:${name.toUpperCase()}`, name };
  const code = codes[0], base = code.match(/^[A-Z]+\d+/)[0];
  return { key: `code:${code}`, code, base, name: code };
}

function resolveCourse(value, courses, ambiguousBases = new Set()) {
  const key = identity(value);
  if (!key) return { course: null, identity: null };
  const candidates = courses.map((course) => ({ course, key: identity(course.name) })).filter((entry) => entry.key);
  const exact = candidates.find((entry) => entry.key.key === key.key);
  if (exact) return { course: exact.course, identity: key };
  if (key.code && ambiguousBases.has(key.base)) return { course: null, identity: key, ambiguous: key.code === key.base };
  // Reuse a manually abbreviated code only when the campus/full-code match
  // is unambiguous. Distinct complete codes remain distinct courses.
  const aliases = key.code ? candidates.filter((entry) => entry.key.base === key.base && (entry.key.code === entry.key.base || key.code === key.base)) : [];
  return { course: aliases.length === 1 ? aliases[0].course : null, identity: key, ambiguous: aliases.length > 1 };
}

function prepareCourses(userId, names, existing, term = "Current term", scopeNames = names) {
  const courses = existing.filter((course) => course.userId === userId), createdCourses = [], matched = new Map();
  const fullCodes = new Map();
  for (const label of [...scopeNames, ...courses.map((course) => course.name)]) {
    const key = identity(label);
    if (key?.code && key.code !== key.base) {
      if (!fullCodes.has(key.base)) fullCodes.set(key.base, new Set());
      fullCodes.get(key.base).add(key.code);
    }
  }
  const ambiguousBases = new Set([...fullCodes].filter(([, codes]) => codes.size > 1).map(([base]) => base));
  // Complete codes first: shorthand references can then reuse them, rather
  // than creating an extra course simply because the AI listed them first.
  const labels = [...names].sort((a, b) => Number(Boolean(identity(b)?.code && identity(b).code !== identity(b).base)) - Number(Boolean(identity(a)?.code && identity(a).code !== identity(a).base)));
  for (const name of labels) {
    const found = resolveCourse(name, courses, ambiguousBases);
    if (!found.identity || found.ambiguous) continue;
    let course = found.course;
    if (!course) {
      const timestamp = new Date().toISOString();
      course = { id: `course_${randomUUID()}`, userId, name: found.identity.name, term: String(term || "Current term").slice(0, 100), createdAt: timestamp, updatedAt: timestamp };
      courses.push(course); createdCourses.push(course);
    }
    matched.set(course.id, course);
  }
  return { courses: [...matched.values()], createdCourses };
}

module.exports = { identity, resolveCourse, prepareCourses };
