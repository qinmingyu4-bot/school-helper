(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeGrades = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const finite = (value) => typeof value === "number" && Number.isFinite(value);
  const isGraded = (item) => item.status === "graded" && finite(item.score) && finite(item.max) && item.max > 0 && item.score >= 0 && item.score <= item.max;
  const round = (value) => Math.round((value + Number.EPSILON) * 1e8) / 1e8;

  function categorySummary(category) {
    const active = category.items.filter((item) => item.status !== "excluded");
    const graded = active.filter(isGraded);
    const known = Number.isInteger(category.plannedCount) && category.plannedCount === category.items.length && active.length > 0
      && finite(category.weight) && category.weight >= 0 && !String(category.specialRule || "").trim()
      && ["equal", "points"].includes(category.method)
      && (category.method === "equal" || active.every((item) => finite(item.max) && item.max > 0));
    const maximum = active.reduce((sum, item) => sum + (finite(item.max) ? item.max : 0), 0);
    const weights = new Map(active.map((item) => [item.id, known ? category.weight * (category.method === "points" ? item.max / maximum : 1 / active.length) : null]));
    const average = !graded.length ? null : category.method === "points"
      ? graded.reduce((sum, item) => sum + item.score, 0) / graded.reduce((sum, item) => sum + item.max, 0) * 100
      : graded.reduce((sum, item) => sum + item.score / item.max * 100, 0) / graded.length;
    const gradedWeight = known ? graded.reduce((sum, item) => sum + weights.get(item.id), 0) : null;
    const earned = known ? graded.reduce((sum, item) => sum + item.score / item.max * weights.get(item.id), 0) : null;
    return { known, average, gradedWeight, earned, weights, graded: graded.length, active: active.length };
  }

  function summarize(course) {
    const categories = course.categories.map((category) => ({ category, ...categorySummary(category) }));
    const totalWeight = round(course.categories.reduce((sum, category) => sum + category.weight, 0));
    const known = categories.length > 0 && Math.abs(totalWeight - 100) < .000001 && categories.every((item) => item.known);
    if (!known) return { known: false, categories, totalWeight, average: null, earned: null, gradedWeight: null, remaining: null, pending: [] };
    const earned = round(categories.reduce((sum, item) => sum + item.earned, 0));
    const gradedWeight = round(categories.reduce((sum, item) => sum + item.gradedWeight, 0));
    const pending = categories.flatMap(({ category, weights }) => category.items.filter((item) => item.status !== "excluded" && !isGraded(item)).map((item) => ({ ...item, categoryId: category.id, categoryName: category.name, weight: weights.get(item.id) })));
    return { known, categories, totalWeight, earned, gradedWeight, remaining: round(100 - gradedWeight), average: gradedWeight > 0 ? earned / gradedWeight * 100 : null, pending };
  }

  function forecast(course, assumptions = {}, focus = "all", score = 80) {
    const summary = summarize(course);
    if (!summary.known) return null;
    return round(summary.earned + summary.pending.reduce((sum, item) => sum + item.weight * (focus === "all" || item.id === focus ? score : assumptions[item.categoryId] ?? 85) / 100, 0));
  }

  function required(course, goal, assumptions = {}, focus = "all") {
    const summary = summarize(course);
    if (!summary.known) return null;
    const selected = summary.pending.filter((item) => focus === "all" || item.id === focus);
    const weight = selected.reduce((sum, item) => sum + item.weight, 0);
    const base = summary.earned + summary.pending.filter((item) => focus !== "all" && item.id !== focus).reduce((sum, item) => sum + item.weight * (assumptions[item.categoryId] ?? 85) / 100, 0);
    const needed = weight > 0 ? (goal - base) / weight * 100 : null;
    return { needed, weight, base, maximum: base + weight, status: goal <= base + 1e-8 ? "achieved" : weight <= 0 || needed > 100 + 1e-8 ? "unreachable" : "reachable" };
  }

  function validateGrade(score, max, status) {
    if (!["pending", "graded", "excluded"].includes(status)) return false;
    if (status !== "graded") return max === null || finite(max) && max > 0;
    return finite(score) && score >= 0 && finite(max) && max > 0 && score <= max;
  }

  function linkedForecast(course, { driver = "assessment", score = 80, goal = 85, assumptions = {}, focus = "all" } = {}) {
    const summary = summarize(course);
    if (!summary.known || !summary.pending.length) return null;
    const inverse = driver === "total";
    const value = inverse ? goal : score;
    if (!finite(value) || value < 0 || value > 100) return null;
    const total = inverse ? goal : forecast(course, assumptions, focus, score);
    const need = required(course, total, assumptions, focus);
    if (!need || need.weight <= 0) return null;
    const assessment = inverse ? Math.max(0, need.needed) : score;
    const actual = forecast(course, assumptions, focus, Math.min(100, assessment));
    return { score: assessment, total, actual, minimum: need.base, maximum: need.maximum, status: inverse ? need.status : "reachable" };
  }

  function applyReviews(course, rows) {
    const copy = JSON.parse(JSON.stringify(course));
    const selected = rows.filter((row) => row.selected);
    if (!selected.length) throw new Error("empty");
    const seen = new Set();
    for (const row of selected) {
      const category = copy.categories.find((item) => item.id === row.categoryId);
      const item = category?.items.find((entry) => entry.id === row.itemId);
      if (!item || item.status === "excluded" || seen.has(row.itemId)) throw new Error("target");
      if (!validateGrade(row.score, row.max, "graded")) throw new Error("grade");
      seen.add(row.itemId);
      Object.assign(item, { score: row.score, max: row.max, status: "graded", source: row.source || "screenshot" });
    }
    return copy;
  }

  return { isGraded, categorySummary, summarize, forecast, required, linkedForecast, validateGrade, applyReviews };
});
