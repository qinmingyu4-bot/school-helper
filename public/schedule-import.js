(function (scope) {
  "use strict";
  const kinds = { ddl: "DDL", deadline: "DDL", lec: "LEC", lecture: "LEC", class: "LEC", tut: "TUT", tutorial: "TUT" };
  function kind(value) { const key = String(value || "").toLowerCase(); return Object.hasOwn(kinds, key) ? kinds[key] : ""; }
  function validTime(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(value || ""))) return false;
    const [year, month, day, hour, minute] = value.match(/\d+/g).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
    return year >= 2000 && year <= 2200 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && hour < 24 && minute < 60;
  }
  function parse(text) {
    const cleaned = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const rows = JSON.parse(cleaned);
    if (!Array.isArray(rows) || rows.length > 200) throw new Error("AI 返回格式不正确或超过 200 条，请分批上传。");
    return rows.map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row) || !kind(row.kind)) throw new Error("AI 返回了无法识别的类型，请重新提取。");
      const string = (key, limit) => String(row[key] || "").trim().slice(0, limit);
      const startsAt = string("startsAt", 30);
      return { kind: kind(row.kind), title: string("title", 160), course: string("course", 80), startsAt: validTime(startsAt) ? startsAt : "", location: string("location", 160), notes: string("notes", 600), evidence: string("evidence", 600), warning: string("warning", 600) || (!validTime(startsAt) ? "日期或时间不完整，请补全后确认。" : ""), selected: true };
    });
  }
  function fingerprint(item) { return [kind(item.kind) || item.kind, String(item.title || "").trim().toLowerCase(), String(item.course || "").trim().toLowerCase(), new Date(item.startsAt).getTime()].join("|"); }
  const api = { kind, validTime, parse, fingerprint };
  if (typeof module === "object" && module.exports) module.exports = api;
  else scope.StudyBridgeScheduleImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
