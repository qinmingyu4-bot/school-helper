"use strict";
const { randomUUID } = require("node:crypto");
const G = require("../public/grade-planner-model");
const percentages = text => Array.from(text.matchAll(/(?:^|[^\d.,+-])(\d+(?:[.,]\d+)?|[.,]\d+)\s*(?:%|percent\b)/gi), match => Number(match[1].replace(",", ".")));
const normalized = text => String(text || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

// A citation can contain a whole grading table. Bind percentages to the named
// category rather than requiring every percentage in the citation to be equal.
function supportsWeight(category, quote, categories = [category]) {
  const text = normalized(quote);
  const labels = categories.map(c => normalized(c.name)).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!text || !labels.length) return false;
  const escaped = labels.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const matches = Array.from(text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])(?:${escaped})(?![\\p{L}\\p{N}])`, "gu")));
  const name = normalized(category.name);
  if (!matches.some(match => match[0] === name)) return false;
  const before = percentages(text.slice(0, matches[0].index)).length > 0;
  const values = [];
  for (let i = 0; i < matches.length; i++) {
    if (matches[i][0] !== name) continue;
    const from = before ? (i ? matches[i - 1].index + matches[i - 1][0].length : 0) : matches[i].index + name.length;
    const to = before ? matches[i].index : (matches[i + 1]?.index ?? text.length);
    values.push(...percentages(text.slice(from, to)));
  }
  return values.length > 0 && values.every(value => value === category.weight);
}

function mergeClearRules(existing, incoming) {
  const conflicts = [];
  const conflict = (name, field) => conflicts.push({ name, field });
  const previous = new Map();
  for (const category of existing) {
    const key = G.normalizeName(category.name);
    if (previous.has(key)) conflict(category.name, "category");
    previous.set(key, category);
  }
  const categories = incoming.map(category => {
    const old = previous.get(G.normalizeName(category.name));
    if (!old) return { ...category, id: randomUUID(), items: G.completeItems(category, randomUUID) };
    previous.delete(G.normalizeName(category.name));
    for (const field of ["weight", "plannedCount", "method"]) {
      if (old[field] != null && old[field] !== "unknown" && category[field] != null && category[field] !== "unknown" && old[field] !== category[field]) conflict(old.name, field);
    }
    if (old.specialRule) conflict(old.name, "specialRule");
    const merged = { ...old, ...category, id: old.id,
      plannedCount: category.plannedCount ?? old.plannedCount,
      method: category.method === "unknown" ? old.method : category.method,
      gradeLinks: [...(old.gradeLinks || []).filter(link => link.origin === "manual"), ...(category.gradeLinks || []).filter(link => link.origin !== "manual")].slice(0, 5),
      items: old.items.map(item => ({ ...item })) };
    const names = new Set();
    for (const item of merged.items) {
      const name = G.normalizeName(item.name);
      if (names.has(name)) conflict(old.name, "items");
      names.add(name);
    }
    for (const item of category.items) {
      const target = merged.items.find(value => G.normalizeName(value.name) === G.normalizeName(item.name))
        || (merged.plannedCount === 1 && merged.items.length === 1 && category.items.length === 1 ? merged.items[0] : null);
      if (target) {
        if (item.max != null && target.max != null && target.max !== item.max) conflict(old.name, "max");
        if (target.max == null) target.max = item.max;
      } else {
        merged.items.push({ ...item, id: randomUUID(), score: null, status: "pending" });
      }
    }
    if (merged.items.length > 100 || merged.plannedCount !== null && merged.items.length > merged.plannedCount) conflict(old.name, "items");
    merged.items = G.completeItems(merged, randomUUID);
    return merged;
  });
  for (const old of previous.values()) conflict(old.name, "category");
  return { categories, conflicts };
}
module.exports = { supportsWeight, mergeClearRules };
