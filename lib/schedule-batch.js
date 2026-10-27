const { randomUUID } = require("node:crypto");
const schedule = require("../public/schedule-import");
const { resolveCourse } = require("./import-courses");

const BATCH_SIZE = 80;
const COURSE_NAME = "Schedule & Deadlines";
const PREFIX = "[SCHEDULE_ITEM]";

function normalizeBatch(body) {
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > BATCH_SIZE) throw new Error(`每批请选择 1–${BATCH_SIZE} 条安排。`);
  const string = (value, limit, field) => {
    if (value != null && typeof value !== "string" || String(value || "").length > limit) throw new Error(`${field}格式无效或过长。`);
    return String(value || "");
  };
  const source = string(body.source, 1000, "来源");
  return body.items.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row) || row.weekly) throw new Error("请先展开并核对每周课程。");
    const timeZone = string(row.timeZone || body.timeZone, 100, "时区");
    try { new Intl.DateTimeFormat("en", { timeZone }).format(); } catch { throw new Error("安排时区无效。"); }
    const instant = (value) => {
      if (schedule.validTime(value)) return schedule.toUtc(value, timeZone);
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:[0-5]\d(?:\.\d{3})?Z$/.test(value) && schedule.validTime(value.slice(0, 16))) return new Date(value).toISOString();
      throw new Error("请补全有效的日期和时间。");
    };
    const kind = schedule.kind(row.kind);
    const title = string(row.title, 160, "标题").trim();
    if (!kind || !title || !timeZone) throw new Error("请补全标题、类型和时区。");
    const startsAt = instant(row.startsAt), endsAt = row.endsAt ? instant(row.endsAt) : "";
    if (endsAt && endsAt <= startsAt) throw new Error("结束时间应晚于开始时间。");
    if (row.recurrence != null && (typeof row.recurrence !== "object" || Array.isArray(row.recurrence) || JSON.stringify(row.recurrence).length > 16000)) throw new Error("课程重复规则格式无效或过长。");
    return { title, kind, startsAt, endsAt, timeZone, completedAt: "", source,
      course: string(row.course, 100, "课程"), location: string(row.location, 2000, "地点"),
      notes: string(row.notes, 10000, "备注"), evidence: string(row.evidence, 10000, "原文"), warning: string(row.warning, 2000, "核对提示"),
      ...(row.recurrence ? { recurrence: row.recurrence } : {}) };
  });
}

function storedItems(courses, documents, userId) {
  const owned = new Map(courses.filter((course) => course.userId === userId).map((course) => [course.id, course]));
  return documents.flatMap((doc) => {
    const course = owned.get(doc.courseId);
    if (!course || doc.userId !== userId || !(doc.type === "Schedule" || String(doc.title).startsWith(PREFIX))) return [];
    try {
      const data = JSON.parse(doc.text);
      if (!data.title || !data.startsAt) return [];
      return [{ ...data, kind: data.kind || "DDL", course: data.course || (course.name === COURSE_NAME ? "" : course.name),
        docId: doc.id, id: doc.id, courseId: course.id }];
    } catch { return []; }
  });
}

function prepareBatch(userId, items, courses, documents) {
  const seen = schedule.duplicateIndex(storedItems(courses, documents, userId));
  const unique = items.filter((item) => { if (seen.has(item)) return false; seen.add(item); return true; });
  const timestamp = new Date().toISOString();
  let course = courses.find((item) => item.userId === userId && item.name === COURSE_NAME);
  const owned = courses.filter((item) => item.userId === userId);
  const targets = unique.map((item) => resolveCourse(item.course, owned).course);
  const newCourse = !course && targets.some((target) => !target);
  if (newCourse) course = { id: `course_${randomUUID()}`, userId, name: COURSE_NAME, term: "StudyBridge planner", createdAt: timestamp, updatedAt: timestamp };
  const records = unique.map((item, index) => ({ id: `doc_${randomUUID()}`, userId, courseId: (targets[index] || course).id,
    title: `${PREFIX} ${item.title}`, type: "Schedule", kind: "document", text: JSON.stringify(item), createdAt: timestamp, updatedAt: timestamp }));
  const usedCourses = [...new Map([...targets, course].filter(Boolean).map((item) => [item.id, item])).values()];
  return { course: course || null, courses: usedCourses, newCourse, records, saved: records.length, duplicates: items.length - records.length };
}

module.exports = { BATCH_SIZE, normalizeBatch, storedItems, prepareBatch };
