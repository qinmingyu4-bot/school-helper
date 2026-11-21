"use strict";

// Compare the same UTC buckets. The first ledger day is deliberately separate:
// the provider's daily totals cannot split the hours before/after installation.
function reconcileCosts(rows, official, since) {
  if (official?.status !== "available") return { status: "unavailable" };
  if (!Array.isArray(official.days)) return { status: "awaiting_daily_breakdown" };
  const startDay = since.slice(0, 10), known = new Set(["study", "schedule", "grades", "mailbox", "office", "community", "classmates", "academic-calendar", "product-help", "health-check"]);
  const local = new Map(), features = new Map();
  for (const row of rows) {
    if (!Number.isFinite(row.amountMicros)) continue;
    const day = row.startedAt.slice(0, 10);
    const bucket = local.get(day) || { attributed: 0, unclassified: 0 };
    const classified = known.has(row.source);
    bucket[classified ? "attributed" : "unclassified"] += row.amountMicros / 1e6;
    local.set(day, bucket);
  }
  const covered = new Set(official.days.map(d => d.day));
  for (const row of rows) {
    if (!known.has(row.source) || !covered.has(row.startedAt.slice(0,10))) continue;
    const key = `${row.source}:${row.model}:${row.trigger || "unspecified"}`;
    const value = features.get(key) || { source: row.source, model: row.model, trigger: row.trigger || "unspecified", requests: 0, amountUsd: 0, unknownRequests: 0, failedRequests: 0 };
    value.requests++; value.amountUsd += Number.isFinite(row.amountMicros) ? row.amountMicros / 1e6 : 0;
    value.unknownRequests += row.amountMicros == null ? 1 : 0;
    value.failedRequests += row.outcome === "failed" ? 1 : 0;
    features.set(key, value);
  }
  const result = { status: "available", attributedUsd: 0, historicalUsd: 0, transitionDifferenceUsd: 0, currentDifferenceUsd: 0, unclassifiedUsd: 0,
    outsideCoverageUsd: 0, transitionDay: startDay, from: official.from, through: official.through, daily: [], features: [...features.values()] };
  for (const day of official.days) {
    const bucket = local.get(day.day) || { attributed: 0, unclassified: 0 };
    const difference = day.amountUsd - bucket.attributed - bucket.unclassified;
    result.attributedUsd += bucket.attributed; result.unclassifiedUsd += bucket.unclassified;
    const category = day.day < startDay ? "historical" : day.day === startDay ? "transition" : "current";
    result[category === "historical" ? "historicalUsd" : category === "transition" ? "transitionDifferenceUsd" : "currentDifferenceUsd"] += difference;
    result.daily.push({ day: day.day, officialUsd: day.amountUsd, attributedUsd: bucket.attributed, unclassifiedUsd: bucket.unclassified, differenceUsd: difference, category });
  }
  for (const [day, bucket] of local) if (!covered.has(day)) result.outsideCoverageUsd += bucket.attributed + bucket.unclassified;
  // Keep signed differences: late provider reporting or pricing changes may make
  // local amounts higher. Clamping would falsely make the totals look reconciled.
  return result;
}
module.exports = { reconcileCosts };
