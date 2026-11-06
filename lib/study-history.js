"use strict";

function buildRecentStudyHistory(history = [], message = "", budget = 40000) {
  const target = String(message).match(/(?:第\s*|\b(?:question|problem|q)\s*)(\d{1,3})(?:\s*题)?(?:\s*[（(]([a-z0-9]+)[)）])?/i);
  const entries = new Map();
  let used = 0;
  const add = (index, content, limit) => {
    if (entries.has(index) || budget - used < 100) return;
    const allowance = Math.min(limit, budget - used - 80);
    if (content.length > allowance) {
      const marker = "\n[Earlier response excerpt; omitted text is not available. Ask for the exact missing step rather than reconstructing it.]\n";
      const length = Math.max(0, allowance - marker.length);
      content = content.slice(0, Math.floor(length * 0.7)) + marker + content.slice(-Math.floor(length * 0.3));
    }
    const item = history[index];
    const value = `${item.role}${item.interrupted ? " (interrupted, incomplete)" : ""}: ${content}`;
    if (used + value.length + 1 <= budget) { entries.set(index, value); used += value.length + 1; }
  };
  // Locate requested numbered work BEFORE truncation, including replies older
  // than the ordinary chat window. The database history is already scoped.
  if (target) for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== "assistant") continue;
    const content = String(history[i].content || "");
    const headings = [...content.matchAll(/^(#{1,6})[ \t]+([^\n]*)/gm)];
    const pattern = new RegExp(`(?:^|[\\s·])${target[1]}(?:[（(]${target[2] || "[a-z0-9]+"}[)）]|(?=\\s|$|[.:：]))`, "i");
    const matching = headings.flatMap((heading, index) => {
      if (!pattern.test(heading[2])) return [];
      const end = headings.slice(index + 1).find((next) => next[1].length <= heading[1].length)?.index ?? content.length;
      return [content.slice(heading.index, end)];
    });
    if (matching.length) { add(i, "[Requested earlier problem sections]\n" + matching.join("\n"), 24000); break; }
  }
  // Preserve the most recent worked explanation, not only its opening/ending.
  for (let i = history.length - 1; i >= Math.max(0, history.length - 16); i--) {
    add(i, String(history[i].content || ""), history[i].role === "assistant" ? 24000 : 4000);
  }
  return [...entries].sort(([a], [b]) => a - b).map(([, value]) => value).join("\n");
}

module.exports = { buildRecentStudyHistory };
