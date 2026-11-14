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
  function select(items, { scope = "future", kind = "all", now = Date.now() } = {}) {
    return items.filter((item) => (scope === "all" || schedule.instant(item) >= now) && (kind === "all" || schedule.kind(item.kind) === kind));
  }
  function localParts(value, timeZone) {
    const local = schedule.wallTime(value, timeZone);
    if (!local) throw new Error("日期或时间无效。");
    return { date: local.slice(0, 10), time: local.slice(11) };
  }

  const daily = typeof module === "object" && module.exports ? require("./daily-checklist") : scope.StudyBridgeDailyChecklist;
  function validatePatch(patch) {
    const limits = { title: 160, date: 10, startTime: 5, endTime: 5, location: 2000, notes: 10000 };
    if (!patch || typeof patch !== "object" || Array.isArray(patch) || !Object.keys(patch).length) throw new Error("请勾选至少一个要修改的字段。");
    daily.validate(patch);
    for (const [key, value] of Object.entries(patch)) {
      if (["plannedDate", "goalProgress", "completed"].includes(key)) continue;
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
    if (Object.hasOwn(patch, "plannedDate")) {
      if (!daily.isTask(item)) throw new Error("Only tasks can have a planned date.");
      result.plannedDate = patch.plannedDate;
      if (item.untimed && patch.plannedDate) result.startsAt = `${patch.plannedDate}T23:59`;
    }
    if (Object.hasOwn(patch, "goalProgress")) {
      daily.validate({ goalTarget: item.goalTarget || 0, goalProgress: patch.goalProgress });
      result.goalProgress = patch.goalProgress;
      result.completedAt = item.goalTarget && result.goalProgress === item.goalTarget ? (item.completedAt || new Date().toISOString()) : "";
    }
    if (Object.hasOwn(patch, "completed")) {
      if (schedule.completion(item).classMeeting) throw new Error("Class meetings use their scheduled end time.");
      result.completedAt = patch.completed ? (item.completedAt || new Date().toISOString()) : "";
      if (item.goalTarget) result.goalProgress = patch.completed ? item.goalTarget : 0;
    }
    for (const key of ["title", "location", "notes"]) if (Object.hasOwn(patch, key)) result[key] = key === "title" ? patch[key].trim() : patch[key];
    if (["date", "startTime", "endTime"].some((key) => Object.hasOwn(patch, key))) {
      const timeZone = item.timeZone || "UTC";
      const start = localParts(item.startsAt, timeZone);
      const end = item.endsAt ? localParts(item.endsAt, timeZone) : null;
      const date = patch.date || start.date;
      result.startsAt = `${date}T${item.untimed ? "23:59" : patch.startTime || start.time}`;
      if (item.untimed) result.plannedDate = date;
      const endTime = item.untimed ? "" : Object.hasOwn(patch, "endTime") ? patch.endTime : end?.time;
      const days = end ? Math.round((Date.parse(end.date) - Date.parse(start.date)) / 86400000) : 0;
      const endDate = new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
      result.endsAt = endTime ? `${endDate}T${endTime}` : "";
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
