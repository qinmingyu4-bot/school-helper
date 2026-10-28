(function (scope) {
  "use strict";
  const schedule = typeof module === "object" && module.exports ? require("./schedule-import") : scope.StudyBridgeScheduleImport;
  function courseKey(value) {
    const name = String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();
    if (!name || name === "SCHEDULE & DEADLINES") return "";
    const codes = [...new Set((name.match(/\b[A-Z]{2,6}[\s-]*\d{2,4}[A-Z0-9]*\b/g) || [])
      .filter((code) => !/^(LEC|TUT|LAB|PRA)[\s-]*\d/.test(code))
      .map((code) => code.replace(/[\s-]/g, "").replace(/([A-Z]\d)[FSY]$/, "$1")))];
    return codes.length === 1 ? `code:${codes[0]}` : `name:${name}`;
  }
  function groups(items) {
    const result = new Map();
    const fullCodes = new Map();
    for (const item of items) {
      const key = courseKey(item.course), base = key.match(/^code:([A-Z]+\d+)([A-Z].*)$/)?.[1];
      if (base) {
        if (!fullCodes.has(base)) fullCodes.set(base, new Set());
        fullCodes.get(base).add(key);
      }
    }
    for (const item of items) {
      let key = courseKey(item.course);
      const aliases = fullCodes.get(key.match(/^code:([A-Z]+\d+)$/)?.[1]);
      if (aliases?.size === 1) key = [...aliases][0];
      if (!key) continue;
      if (!result.has(key)) result.set(key, { key, name: item.course, items: [] });
      result.get(key).items.push(item);
    }
    return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  function instant(item) {
    try { return Date.parse(schedule.validTime(item.startsAt) && item.timeZone ? schedule.toUtc(item.startsAt, item.timeZone) : item.startsAt); }
    catch { return NaN; }
  }
  function select(items, { scope = "future", kind = "all", now = Date.now() } = {}) {
    return items.filter((item) => (scope === "all" || instant(item) >= now) && (kind === "all" || schedule.kind(item.kind) === kind));
  }
  function localParts(value, timeZone) {
    if (schedule.validTime(value)) return { date: value.slice(0, 10), time: value.slice(11, 16) };
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  }
  function validatePatch(patch) {
    const limits = { title: 160, date: 10, startTime: 5, endTime: 5, location: 2000, notes: 10000 };
    if (!patch || typeof patch !== "object" || Array.isArray(patch) || !Object.keys(patch).length) throw new Error("请勾选至少一个要修改的字段。");
    for (const [key, value] of Object.entries(patch)) {
      if (!Object.hasOwn(limits, key) || typeof value !== "string" || value.length > limits[key]) throw new Error("修改字段无效或过长。");
      if (key === "title" && !value.trim()) throw new Error("标题不能为空。");
      if (key === "date" && !schedule.validDate(value)) throw new Error("请选择有效日期。");
      if ((key === "startTime" || key === "endTime" && value) && !schedule.validClock(value)) throw new Error("请填写有效时间。");
    }
    return patch;
  }
  function applyPatch(item, patch) {
    validatePatch(patch);
    const result = { ...item };
    for (const key of ["title", "location", "notes"]) if (Object.hasOwn(patch, key)) result[key] = key === "title" ? patch[key].trim() : patch[key];
    if (["date", "startTime", "endTime"].some((key) => Object.hasOwn(patch, key))) {
      const timeZone = item.timeZone || "UTC";
      const start = localParts(item.startsAt, timeZone);
      const end = item.endsAt ? localParts(item.endsAt, timeZone) : null;
      const date = patch.date || start.date;
      result.startsAt = schedule.toUtc(`${date}T${patch.startTime || start.time}`, timeZone);
      const endTime = Object.hasOwn(patch, "endTime") ? patch.endTime : end?.time;
      const days = end ? Math.round((Date.parse(end.date) - Date.parse(start.date)) / 86400000) : 0;
      const endDate = new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
      result.endsAt = endTime ? schedule.toUtc(`${endDate}T${endTime}`, timeZone) : "";
      if (result.endsAt && result.endsAt <= result.startsAt) throw new Error(`“${item.title}”的结束时间应晚于开始时间，请同时修改起止时间。`);
      // Occurrences have already been expanded. Old extraction rules no longer describe an edited meeting.
      delete result.recurrence;
    }
    return result;
  }
  const api = { courseKey, groups, select, localParts, validatePatch, applyPatch };
  if (typeof module === "object" && module.exports) module.exports = api;
  else scope.StudyBridgeScheduleManagement = api;
})(typeof window !== "undefined" ? window : globalThis);
