(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeGrades = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const finite = (value) => typeof value === "number" && Number.isFinite(value);
  const isGraded = (item) => item.status === "graded" && finite(item.score) && finite(item.max) && item.max > 0 && item.score >= 0 && item.score <= item.max;
  const round = (value) => Math.round((value + Number.EPSILON) * 1e8) / 1e8;
  const normalizeName = (value) => String(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

  function completeItems(category, createId) {
    const items = [...category.items];
    const names = new Set(items.map(item => normalizeName(item.name)));
    let number = items.length + 1;
    while (items.length < category.plannedCount) {
      let name = `${category.name} ${number++}`;
      while (names.has(normalizeName(name))) name = `${category.name} ${number++}`;
      names.add(normalizeName(name));
      items.push({ id: createId(), name, score: null, max: null, status: "pending" });
    }
    return items;
  }

  function validDropCount(count, plannedCount) {
    return count == null || Number.isInteger(count) && count >= 0 && count < 100
      && (!count || plannedCount == null || count < plannedCount);
  }

  const percentage = item => item.score / item.max * 100;
  const highest = (items, count, score = percentage) => [...items].sort((a, b) => score(b) - score(a)).slice(0, count);

  function categorySummary(category) {
    const active = category.items.filter((item) => item.status !== "excluded");
    const graded = active.filter(isGraded);
    const drop = category.dropLowest || 0;
    const keep = active.length - drop;
    const validDrop = validDropCount(category.dropLowest, category.plannedCount) && keep > 0;
    const issues = [];
    const issue = (code, extra = {}) => issues.push({ code, categoryId: category.id, categoryName: category.name, ...extra });
    if (!finite(category.weight) || category.weight < 0 || category.weight > 100) issue("weight");
    if (!Number.isInteger(category.plannedCount) || category.plannedCount < 1) issue("count");
    else if (category.plannedCount !== category.items.length) issue("countMismatch", { expected: category.plannedCount, actual: category.items.length });
    else if (!active.length) issue("empty");
    if (!["equal", "points"].includes(category.method)) issue("method");
    if (category.method === "points") {
      const missing = active.filter(item => !finite(item.max) || item.max <= 0);
      if (missing.length) issue("max", { count: missing.length, itemId: missing[0].id, itemName: missing[0].name });
    }
    if (String(category.specialRule || "").trim()) issue("special", { rule: category.specialRule });
    if (!validDrop && (drop || !validDropCount(category.dropLowest, category.plannedCount))) issue("dropCount");
    // With unequal maxima, points pooling and ranking by percentage can make
    // the forecast non-monotonic when a high-value item enters the top group.
    const unequalPoints = drop > 0 && category.method === "points"
      && new Set(active.map(item => item.max).filter(max => finite(max) && max > 0)).size > 1;
    if (unequalPoints) issue("dropPoints");
    const known = issues.length === 0;
    const counted = drop && known ? highest(graded, keep) : graded;
    const countedIds = new Set(counted.map(item => item.id));
    const dropped = new Set(graded.filter(item => !countedIds.has(item.id)).map(item => item.id));
    const maximum = active.reduce((sum, item) => sum + (finite(item.max) ? item.max : 0), 0);
    const weights = new Map(active.map(item => [item.id, known ? category.weight * (drop ? 1 / keep : category.method === "points" ? item.max / maximum : 1 / active.length) : null]));
    const average = !counted.length || unequalPoints || !["equal", "points"].includes(category.method) ? null : category.method === "points"
      ? counted.reduce((sum, item) => sum + item.score, 0) / counted.reduce((sum, item) => sum + item.max, 0) * 100
      : counted.reduce((sum, item) => sum + percentage(item), 0) / counted.length;
    const gradedWeight = known ? counted.reduce((sum, item) => sum + weights.get(item.id), 0) : null;
    const earned = known ? counted.reduce((sum, item) => sum + item.score / item.max * weights.get(item.id), 0) : null;
    return { known, issues, average, gradedWeight, earned, weights, dropped, keep, counted: counted.length, graded: graded.length, active: active.length };
  }

  function summarize(course) {
    const categories = course.categories.map((category) => ({ category, ...categorySummary(category) }));
    const validWeights = categories.length > 0 && categories.every(({ category }) => finite(category.weight) && category.weight >= 0 && category.weight <= 100);
    const totalWeight = validWeights ? round(categories.reduce((sum, { category }) => sum + category.weight, 0)) : null;
    const balanced = validWeights && Math.abs(totalWeight - 100) < .000001;
    const known = balanced && categories.every(item => item.known);
    // Unknown future assessment counts do not change already earned contributions.
    // Unknown rules for recorded scores still prevent a complete course total.
    const totalsKnown = balanced && categories.every(item => item.known || !item.graded && !String(item.category.specialRule || "").trim());
    const resolved = balanced ? categories.filter(item => item.known) : [];
    const gradedWeight = round(resolved.reduce((sum, item) => sum + item.gradedWeight, 0));
    const earned = totalsKnown || resolved.some(item => item.graded) ? round(resolved.reduce((sum, item) => sum + item.earned, 0)) : null;
    const issues = categories.flatMap(item => item.issues);
    if (validWeights && !balanced) issues.unshift({ code: "total", totalWeight });
    const pending = categories.filter(item => item.known).flatMap(({ category, weights }) => category.items.filter(item => item.status !== "excluded" && !isGraded(item)).map(item => ({ ...item, categoryId: category.id, categoryName: category.name, variableWeight: Boolean(category.dropLowest), weight: weights.get(item.id) })));
    return { known, totalsKnown, issues, categories, totalWeight, earned, gradedWeight,
      recorded: categories.reduce((sum, item) => sum + item.graded, 0),
      remaining: totalsKnown ? round(100 - gradedWeight) : null,
      average: totalsKnown && gradedWeight > 0 ? earned / gradedWeight * 100 : null, pending };
  }

  function scenario(summary, assumptions, focus, score) {
    const assumed = item => focus === "all" || item.id === focus ? score : assumptions[item.categoryId] ?? 85;
    const fixed = summary.pending.filter(item => !item.variableWeight)
      .reduce((sum, item) => sum + item.weight * assumed(item) / 100, 0);
    let total = fixed;
    for (const group of summary.categories) {
      if (!group.category.dropLowest) {
        total += group.earned;
        continue;
      }
      const scores = group.category.items.filter(isGraded).map(percentage);
      for (const item of summary.pending) if (item.categoryId === group.category.id) scores.push(assumed(item));
      const kept = highest(scores, group.keep, value => value);
      total += kept.reduce((sum, value) => sum + value, 0) * group.category.weight / (100 * group.keep);
    }
    return total;
  }

  function forecast(course, assumptions = {}, focus = "all", score = 80) {
    const summary = summarize(course);
    return summary.known ? round(scenario(summary, assumptions, focus, score)) : null;
  }

  function targetScore(summary, goal, assumptions, focus) {
    const selected = summary.pending.filter(item => focus === "all" || item.id === focus);
    const base = scenario(summary, assumptions, focus, 0);
    const maximum = scenario(summary, assumptions, focus, 100);
    const weight = maximum - base;
    const status = goal <= base + 1e-8 ? "achieved" : goal > maximum + 1e-8 ? "unreachable" : "reachable";
    if (!selected.some(item => item.weight > 0)) return { needed: null, weight, base, maximum, status };
    const variable = selected.some(item => item.variableWeight);
    let needed = weight > 0 ? (goal - base) / weight * 100 : null;
    if (variable) {
      if (status === "achieved") needed = 0;
      else if (status === "unreachable") needed = null;
      else {
        // Top-N scoring is monotonic but flat below the current cutoff.
        let low = 0, high = 100;
        for (let i = 0; i < 40; i++) {
          const middle = (low + high) / 2;
          if (scenario(summary, assumptions, focus, middle) < goal - 1e-9) low = middle;
          else high = middle;
        }
        needed = high;
      }
    }
    return { needed, weight, base, maximum, status };
  }

  function required(course, goal, assumptions = {}, focus = "all") {
    const summary = summarize(course);
    return summary.known ? targetScore(summary, goal, assumptions, focus) : null;
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
    const selected = summary.pending.some(item => (focus === "all" || item.id === focus) && item.weight > 0);
    if (!selected) return null;
    const total = inverse ? goal : round(scenario(summary, assumptions, focus, score));
    const need = targetScore(summary, total, assumptions, focus);
    const assessment = inverse ? Math.max(0, need.needed ?? 100) : score;
    const actual = round(scenario(summary, assumptions, focus, Math.min(100, assessment)));
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

  return { isGraded, categorySummary, summarize, forecast, required, linkedForecast, validateGrade, applyReviews, normalizeName, completeItems, validDropCount };
});
