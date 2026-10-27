(function (scope) {
  "use strict";
  const kinds = { ddl: "DDL", deadline: "DDL", lec: "LEC", lecture: "LEC", class: "LEC", tut: "TUT", tutorial: "TUT", event: "EVENT", personal: "EVENT", appointment: "EVENT" };
  function kind(value) { const key = String(value || "").toLowerCase(); return Object.hasOwn(kinds, key) ? kinds[key] : ""; }
  function validTime(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(value || ""))) return false;
    const [year, month, day, hour, minute] = value.match(/\d+/g).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
    return year >= 2000 && year <= 2200 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && hour < 24 && minute < 60;
  }
  function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && validTime(`${value}T12:00`); }
  function validClock(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || "")); }
  function draftDateTime(item) {
    return { date: validTime(item.startsAt) ? item.startsAt.slice(0, 10) : validDate(item.date) ? item.date : "",
      time: validTime(item.startsAt) ? item.startsAt.slice(11) : validClock(item.time) ? item.time : "" };
  }
  function withDatePart(item, field, value) {
    const parts = { ...draftDateTime(item), [field]: value };
    return { ...item, ...parts, startsAt: validDate(parts.date) && validClock(parts.time) ? `${parts.date}T${parts.time}` : "" };
  }
  function explicitDraftDate(row) {
    const supplied = String(row.date || row.startsAt || "").slice(0, 10);
    if (validDate(supplied)) return supplied;
    if (kind(row.kind) !== "DDL") return "";
    // Recover a primary due date from this item's own evidence, never a late-acceptance date or an inferred year.
    const text = `${row.evidence || ""}\n${row.notes || ""}`;
    const dates = new Set();
    for (const match of text.matchAll(/\bdue(?:\s+date)?(?:\s+is)?(?:\s+on)?\s*:?\s*(\d{4}-\d{2}-\d{2})\b/gi)) if (validDate(match[1])) dates.add(match[1]);
    const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    for (const match of text.matchAll(/\bdue(?:\s+date)?(?:\s+is)?(?:\s+on)?\s*:?\s*([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})\b/gi)) {
      const month = months.indexOf(match[1].toLowerCase()) + 1;
      const date = `${match[3]}-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
      if (validDate(date)) dates.add(date);
    }
    return dates.size === 1 ? [...dates][0] : "";
  }
  function validWeekly(weekly) {
    return weekly && Array.isArray(weekly.weekdays) && weekly.weekdays.length > 0 && weekly.weekdays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      && validClock(weekly.startTime) && (!weekly.endTime || validClock(weekly.endTime) && weekly.endTime > weekly.startTime);
  }
  function parseExtraction(text) {
    const cleaned = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const payload = JSON.parse(cleaned);
    const rows = Array.isArray(payload) ? payload : payload?.items;
    if (!Array.isArray(rows) || rows.length > 200) throw new Error("AI 返回格式不正确或超过 200 条，请分批上传。");
    const items = rows.map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row) || !kind(row.kind)) throw new Error("AI 返回了无法识别的类型，请重新提取。");
      const string = (key, limit) => String(row[key] || "").trim().slice(0, limit);
      const rawStart = string("startsAt", 30);
      const date = explicitDraftDate(row);
      const time = validTime(rawStart) ? rawStart.slice(11) : validClock(row.time) ? row.time : "";
      const startsAt = validTime(rawStart) ? rawStart : date && time ? `${date}T${time}` : "";
      const endsAt = string("endsAt", 30);
      const invalidEnd = endsAt && (!validTime(endsAt) || validTime(startsAt) && endsAt <= startsAt);
      const weekly = ["LEC", "TUT"].includes(kind(row.kind)) && row.weekly && typeof row.weekly === "object" ? {
        weekdays: [...new Set(Array.isArray(row.weekly.weekdays) ? row.weekly.weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : [])],
        startTime: String(row.weekly.startTime || "").slice(0, 5), endTime: String(row.weekly.endTime || "").slice(0, 5),
        startDate: validDate(row.weekly.startDate) ? row.weekly.startDate : "", endDate: validDate(row.weekly.endDate) ? row.weekly.endDate : ""
      } : null;
      return { kind: kind(row.kind), title: string("title", 160), course: string("course", 80), startsAt: validTime(startsAt) ? startsAt : "", ...(!startsAt && (date || time) ? { date, time } : {}), ...(endsAt ? { endsAt: validTime(endsAt) ? endsAt : "" } : {}), location: string("location", 160), notes: string("notes", 600), evidence: string("evidence", 600), warning: string("warning", 600) || (weekly ? validWeekly(weekly) ? "" : "星期或上课时间未识别完整，请仅补充缺失信息。" : date && !time ? "日期已识别，请补充具体时间后确认。" : !validTime(startsAt) ? "日期或时间不完整，请补全后确认。" : invalidEnd ? "结束时间无效或早于开始时间，请核对。" : ""), ...(weekly ? { weekly } : {}), selected: true };
    });
    const hint = !Array.isArray(payload) && payload.termHint || {};
    return { items, termHint: { year: Number.isInteger(hint.year) && hint.year >= 2000 && hint.year <= 2200 ? hint.year : null,
      season: ["fall", "winter", "summer", "full-year"].includes(hint.season) ? hint.season : "",
      campus: String(hint.campus || "").trim().slice(0, 100), faculty: String(hint.faculty || "").trim().slice(0, 100) } };
  }
  function parse(text) { return parseExtraction(text).items; }
  function normalizeCalendar(calendar) {
    if (!calendar || !Array.isArray(calendar.teachingPeriods) || !calendar.teachingPeriods.length || calendar.teachingPeriods.length > 4) throw new Error("请先确认一次本学期的授课起止日期。");
    const ranges = (rows, limit) => {
      if (!Array.isArray(rows) || rows.length > limit) throw new Error("校历日期范围无效。");
      return rows.map((range) => {
        if (!validDate(range.startDate) || !validDate(range.endDate) || range.startDate > range.endDate) throw new Error("校历起止日期无效。");
        return { ...range, label: String(range.label || "").slice(0, 120) };
      });
    };
    const teachingPeriods = ranges(calendar.teachingPeriods, 4).sort((first, second) => first.startDate.localeCompare(second.startDate));
    if (Math.max(...teachingPeriods.map((period) => Date.parse(period.endDate))) - Date.parse(teachingPeriods[0].startDate) > 370 * 86400000) throw new Error("校历跨度超过一个学年，请分学期导入。");
    const breaks = ranges(calendar.breaks || [], 128);
    const replacements = calendar.replacements || [];
    if (!Array.isArray(replacements) || replacements.length > 40 || replacements.some((item) => !validDate(item.date) || !Number.isInteger(item.weekday) || item.weekday < 0 || item.weekday > 6)) throw new Error("调课日期无效。");
    if (!calendar.timeZone) throw new Error("请确认学校所在时区。");
    try { new Intl.DateTimeFormat("en", { timeZone: calendar.timeZone }).format(); }
    catch { throw new Error("学校时区无效，请使用 America/Toronto 等完整时区名称。"); }
    return { ...calendar, teachingPeriods, breaks, replacements };
  }
  function todayInZone(timeZone, date = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function nonTeachingRanges(calendar) {
    const normalized = normalizeCalendar(calendar);
    const gaps = [...normalized.breaks];
    let previousEnd = normalized.teachingPeriods[0].endDate;
    for (const period of normalized.teachingPeriods.slice(1)) {
      const startDate = new Date(Date.parse(previousEnd) + 86400000).toISOString().slice(0, 10);
      const endDate = new Date(Date.parse(period.startDate) - 86400000).toISOString().slice(0, 10);
      if (startDate <= endDate) gaps.push({ startDate, endDate, label: "非授课区间" });
      if (period.endDate > previousEnd) previousEnd = period.endDate;
    }
    return gaps;
  }
  function toUtc(value, timeZone) {
    if (!validTime(value)) throw new Error("日期或时间无效。");
    const desired = Date.parse(`${value}:00Z`);
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    let timestamp = desired;
    for (let attempt = 0; attempt < 4; attempt++) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
      const actual = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
      if (actual === value) return new Date(timestamp).toISOString();
      timestamp += desired - Date.parse(`${actual}:00Z`);
    }
    throw new Error("该时间处于夏令时切换的不存在时段，请核对。");
  }
  function expandWeekly(items, calendar, { fromDate = "", limit = 1500 } = {}) {
    const result = [];
    const normalized = items.some((item) => item.weekly) ? normalizeCalendar(calendar) : null;
    if (fromDate && !validDate(fromDate)) throw new Error("导入起始日期无效。");
    for (const item of items) {
      if (!item.weekly) { result.push({ ...item }); continue; }
      if (!validWeekly(item.weekly)) throw new Error(`${item.title}：请补全星期和上课时间。`);
      const seen = new Set();
      for (const period of normalized.teachingPeriods) {
        for (let timestamp = Date.parse(period.startDate); timestamp <= Date.parse(period.endDate); timestamp += 86400000) {
          const day = new Date(timestamp).toISOString().slice(0, 10);
          if (seen.has(day) || fromDate && day < fromDate || item.weekly.startDate && day < item.weekly.startDate || item.weekly.endDate && day > item.weekly.endDate) continue;
          if (normalized.breaks.some((pause) => pause.startDate <= day && day <= pause.endDate)) continue;
          const weekday = normalized.replacements.find((replacement) => replacement.date === day)?.weekday ?? new Date(timestamp).getUTCDay();
          if (!item.weekly.weekdays.includes(weekday)) continue;
          seen.add(day);
          result.push({ ...item, weekly: undefined, startsAt: `${day}T${item.weekly.startTime}`, ...(item.weekly.endTime ? { endsAt: `${day}T${item.weekly.endTime}` } : {}), timeZone: normalized.timeZone,
            recurrence: { frequency: "weekly", weekdays: item.weekly.weekdays, calendar: normalized.label || "", sources: normalized.sources || [] } });
          if (result.length > limit) throw new Error("导入超过 1500 次课程，请分学期导入。");
        }
      }
    }
    return result;
  }
  function fingerprint(item) { return [kind(item.kind) || item.kind, String(item.title || "").trim().toLowerCase(), String(item.course || "").trim().toLowerCase(), new Date(item.timeZone && validTime(item.startsAt) ? toUtc(item.startsAt, item.timeZone) : item.startsAt).getTime()].join("|"); }
  function duplicateIndex(existing = []) {
    const exact = new Set();
    const meetings = new Map();
    const normalize = (value) => String(value || "").normalize("NFKC").trim().toUpperCase().replace(/\s+/g, " ");
    const courseKey = (item) => {
      const codes = (value) => (normalize(value).match(/\b[A-Z]{2,6}[\s-]*\d{2,4}[A-Z0-9]*\b/g) || []).filter((code) => !/^(LEC|TUT|LAB|PRA)[\s-]*\d/.test(code));
      const code = codes(item.course)[0] || codes(item.title)[0];
      if (code) return code.replace(/[\s-]/g, "").replace(/([A-Z]\d)[FSY]$/, "$1");
      const name = normalize(item.course);
      return name && name !== "SCHEDULE & DEADLINES" ? `name:${name}` : "";
    };
    const keys = (item) => {
      let instant;
      try { instant = new Date(item.timeZone && validTime(item.startsAt) ? toUtc(item.startsAt, item.timeZone) : item.startsAt).getTime(); }
      catch { return null; }
      if (!Number.isFinite(instant)) return null;
      const itemKind = kind(item.kind) || item.kind;
      const course = courseKey(item);
      const section = normalize(item.title).match(/\b(LEC|TUT)[\s:-]*(\d{1,4})\b/);
      return { exact: JSON.stringify([itemKind, normalize(item.title), course || (normalize(item.course) === "SCHEDULE & DEADLINES" ? "" : normalize(item.course)), instant]), meeting: ["LEC", "TUT"].includes(itemKind) && course ? JSON.stringify([itemKind, course, instant]) : "", section: section ? `${section[1]}${section[2].padStart(4, "0")}` : "" };
    };
    const has = (item) => {
      const key = keys(item);
      if (!key) return false;
      if (exact.has(key.exact)) return true;
      const sections = key.meeting && meetings.get(key.meeting);
      return Boolean(sections && (!key.section || sections.has("") || sections.has(key.section)));
    };
    const add = (item) => {
      const key = keys(item);
      if (!key) return;
      exact.add(key.exact);
      if (key.meeting) {
        if (!meetings.has(key.meeting)) meetings.set(key.meeting, new Set());
        meetings.get(key.meeting).add(key.section);
      }
    };
    existing.forEach(add);
    return { has, add };
  }
  function deduplicate(items, existing = []) {
    const index = duplicateIndex(existing);
    const unique = [], duplicates = [];
    for (const item of items) {
      if (index.has(item)) duplicates.push(item);
      else { unique.push(item); index.add(item); }
    }
    return { items: unique, duplicates };
  }
  function reviewDuplicates(items, existing, { calendar = null, fromDate = "", timeZone = "", preserveSelection = false } = {}) {
    const saved = duplicateIndex(existing);
    const index = duplicateIndex(existing);
    let duplicateCount = 0;
    const drafts = items.map((item) => {
      let occurrences;
      if (item.weekly) {
        if (!calendar || !validWeekly(item.weekly)) occurrences = [];
        else occurrences = expandWeekly([item], calendar, { fromDate });
      } else occurrences = [{ ...item, timeZone: item.timeZone || timeZone }];
      let newCount = 0, existingCount = 0, batchCount = 0;
      for (const occurrence of occurrences) {
        if (saved.has(occurrence)) existingCount++;
        else if (index.has(occurrence)) batchCount++;
        else { newCount++; index.add(occurrence); }
      }
      duplicateCount += existingCount + batchCount;
      const duplicate = existingCount + batchCount > 0 && newCount === 0;
      return { ...item, duplicateReview: { duplicate, existingCount, batchCount, newCount },
        selected: preserveSelection && item.selectionTouched ? item.selected : !duplicate };
    });
    return { items: drafts, duplicateCount };
  }
  function duplicateNotice(item) {
    const review = item.duplicateReview;
    if (!review || !review.existingCount && !review.batchCount) return "";
    if (review.duplicate) return `${review.existingCount ? "日历中已有" : "本次导入中已有"} · 默认不勾选，可手动勾选；保存时仍会检查重复`;
    return `其中 ${review.existingCount + review.batchCount} 次安排已有，仅添加 ${review.newCount} 次新增安排`;
  }
  function completion(item, now = Date.now()) {
    const classMeeting = ["LEC", "TUT"].includes(kind(item.kind));
    const result = { classMeeting, automatic: false, completedAt: item.completedAt || "" };
    if (!classMeeting || result.completedAt) return result;
    const instant = (value) => {
      try { return Date.parse(item.timeZone && validTime(value) ? toUtc(value, item.timeZone) : value); }
      catch { return NaN; }
    };
    const start = instant(item.startsAt);
    const end = instant(item.endsAt);
    const finish = Number.isFinite(end) && end > start ? end : start;
    if (Number.isFinite(start) && finish <= Number(new Date(now))) return { classMeeting, automatic: true, completedAt: new Date(finish).toISOString() };
    return result;
  }
  const api = { duplicateNotice, draftDateTime, withDatePart, kind, validTime, validDate, validClock, validWeekly, parse, parseExtraction, normalizeCalendar, nonTeachingRanges, todayInZone, toUtc, expandWeekly, fingerprint, duplicateIndex, deduplicate, reviewDuplicates, completion };
  if (typeof module === "object" && module.exports) module.exports = api;
  else scope.StudyBridgeScheduleImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
