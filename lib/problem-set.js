"use strict";
const { exerciseSections } = require("./study-coverage");
const { PDFDocument } = require("pdf-lib");
const plain = (text) => String(text || "").replace(/[\\`*_{}\[\]<>#]/g, "\\$&");
function questionsFrom(source) {
  const outline = exerciseSections(source.text);
  return outline.map((item) => {
    const { start, end, parts } = item, text = source.text.slice(start, end).trim();
    return { number: item.number, section: item.section, text, parts: parts.length ? parts : ["answer"], sourceId: source.id,
      pages: (source.sourcePages || []).filter((page) => page.start < end && page.end > start).map((page) => page.page),
      shared: (source.text.slice(0, outline[0].start) + "\n" + item.shared).slice(0, 10000), dependsOn: [], queries: [],
      visual: /graph|diagram|figure|table|plot|shown|图|表|坐标|曲线|积分|几何/i.test(text) };
  });
}
function wantsWholeSet(message = "", mode = "guided") {
  if (["exam", "assignment", "cheatsheet", "preview"].includes(mode)) return false;
  message = String(message).replace(/(?:不要|别|不能)只(?:讲|做|看|解)[^，。；;\n]*/g, "")
    .replace(/检查理解放在[^。\n]*之后/g, "");
  // A conservative gate: uncertain intent stays in conversational tutoring.
  if (/批改|评分|纠错|检查(?:我的|答案|解答)|\b(?:check|grade|mark)\b|只.*思路|先.*思路|思路.*(?:即可|就行)|without.*(?:solutions?|answers?)|(?:do not|don.t).*(?:solve|answer)|let me|try.*first|先.*(?:试一|作答|自己做)|只(?:要|讲|做|看|解)|第\s*[\d一二三四五六七八九十]+\s*(?:题|小问)|\b(?:question|problem|part|q)\s*\d|\bonly\b|提示|hint|互动|逐步问|一次一|一道一道|一题一题|等我|先让我|检查.*理解|问我|不要.*答案|别.*答案|先不.*答案|one.at.a.time|quiz me|wait.*(?:me|answer|response)|check.*understand|(?:出|生成)(?:几道|一些|\d+道|新)?(?:练习)?题|generate.*(?:exam|questions)|总结|归纳|概括|翻译|summari[sz]e|translate|多少|几道|how many|how much|\d+\s*(?:分钟|minutes?|mins?)/i.test(message)) return false;
  return /(?:解答|讲解|解题|做|教|带我|作答).*(?:整套|这套|全部|所有|题目|习题)|(?:整套|全部|所有|每道|逐题|按题号).*(?:题|讲解|解答)|\b(?:solve|explain|answer|work\s+through|walk.*through|teach)\b.*(?:\ball\b|\bevery\b|\bpaper\b|\bexam\b|\bproblem.set\b|\bquestions\b|\bproblems\b)/i.test(message);
}
function selectProblemSources(sources, message, fallback = sources) {
  const text = String(message).toLowerCase();
  const targets = sources.filter((source) => {
    const name = String(source.name || "").toLowerCase();
    if (!name) return false;
    let at = text.indexOf(name);
    while (at >= 0) {
      // Interpret filenames in their own clause. A reference ("based on notes")
      // must not replace the uploaded paper that the student wants solved.
      const prefix = text.slice(0, at).split(/[,，;；。\n]/).at(-1);
      const actions = [...prefix.matchAll(/解答|讲解|做完|解题|solve|answer|explain|work\s+through|walk\s+through/g)];
      const refs = [...prefix.matchAll(/参考|根据|使用|结合|参照|using|based\s+on|refer(?:ring)?\s+to|with\s+reference\s+to/g)];
      if (actions.length && (!refs.length || actions.at(-1).index > refs.at(-1).index)) return true;
      at = text.indexOf(name, at + name.length);
    }
    return false;
  });
  return targets.length ? targets : fallback;
}
function detectSet({ message = "", mode = "guided", sources = [] }) {
  if (!wantsWholeSet(message, mode)) return null;
  sources = selectProblemSources(sources, message);
  const questions = sources.flatMap(questionsFrom).map((question, index) => ({ ...question, id: `q${index + 1}` }));
  // Compute duplicates before mutating labels, so every duplicate is qualified.
  const counts = new Map();
  for (const question of questions) counts.set(question.number, (counts.get(question.number) || 0) + 1);
  for (const question of questions) if (counts.get(question.number) > 1) question.number = `${sources.find((source) => source.id === question.sourceId).name} · ${question.section || question.id} · ${question.number}`;
  const reviewSourceIds = sources.filter((source) => ["pdf", "image"].includes(source.kind) || !questions.some((question) => question.sourceId === source.id)).map((source) => source.id);
  if (questions.length >= 6 || reviewSourceIds.length && sources.some((source) => ["pdf", "image"].includes(source.kind))) {
    return { questions, sourceIds: sources.map((source) => source.id), reviewSourceIds };
  }
  return null;
}
function enrichPlan(detected, raw, sources) {
  const parsed = typeof raw === "string" ? JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) : raw;
  if (!Array.isArray(parsed?.questions) || parsed.questions.length > 300 || parsed.questions.some((item) => !item || typeof item !== "object")) throw new Error("Question inventory could not be verified.");
  if (new Set(parsed.questions.map((item) => item.id)).size !== parsed.questions.length) throw new Error("Duplicate question id.");
  const review = new Set(detected.reviewSourceIds || (!detected.questions.length ? detected.sourceIds : []));
  const checks = new Map();
  for (const id of review) {
    const entries = (parsed.sourceChecks || []).filter((entry) => entry?.sourceId === id);
    if (entries.length !== 1 || !["complete", "unreadable", "reference"].includes(entries[0].status)) throw new Error("Every source must be inspected.");
    if (entries[0].status !== "complete" && (typeof entries[0].reason !== "string" || !entries[0].reason.trim())) throw new Error("Unresolved sources need an explanation.");
    checks.set(id, entries[0]);
  }
  const partsOf = (parts) => {
    if (!Array.isArray(parts) || !parts.length || parts.length > 80 || parts.some((part) => typeof part !== "string" || !/^(?:answer|[a-z0-9]+(?:[.-][a-z0-9]+)*)$/i.test(part)) || new Set(parts).size !== parts.length) throw new Error("Invalid question parts.");
    return parts;
  };
  const questions = detected.questions.map((question) => {
    const extras = parsed.questions.filter((item) => item.id === question.id);
    if (extras.length > 1) throw new Error("Duplicate question id.");
    // Original question identities/text cannot be silently dropped or rewritten.
    // A full visual inspection can correct OCR subparts, using the same id.
    const extra = extras[0];
    if (extra?.sourceId && extra.sourceId !== question.sourceId) throw new Error("Question source cannot change.");
    if (review.has(question.sourceId) && !extra) throw new Error("A detected question is missing from the visual inventory.");
    const reviewedParts = review.has(question.sourceId) && extra?.parts ? partsOf(extra.parts) : question.parts;
    const parts = question.parts.length === 1 && question.parts[0] === "answer" ? reviewedParts : [...new Set([...question.parts, ...reviewedParts.filter((part) => part !== "answer")])];
    const source = sources.find((source) => source.id === question.sourceId);
    const pages = extra?.pages ?? [];
    if (!Array.isArray(pages) || pages.some((page) => !Number.isInteger(page) || page < 1 || page > (source.pages || 10000))) throw new Error("Invalid reviewed source pages.");
    return { ...question, parts, pages: [...new Set([...(question.pages || []), ...pages])] };
  });
  const ids = new Set(questions.map((question) => question.id));
  for (const item of parsed.questions) {
    if (ids.has(item.id)) continue;
    const source = sources.find((source) => source.id === item.sourceId);
    if (!source || !review.has(source.id) || !["complete", "unreadable"].includes(checks.get(source.id)?.status) || !/^q\d+$/.test(item.id || "") || typeof item.text !== "string" || !item.text.trim() || item.text.length > 30000) throw new Error("Unverified additional question.");
    const pages = item.pages || [];
    if (!Array.isArray(pages) || pages.some((page) => !Number.isInteger(page) || page < 1 || page > (source.pages || 10000)) || source.kind === "pdf" && !pages.length) throw new Error("Missing or invalid source pages.");
    questions.push({ id: item.id, number: String(item.number || item.id).slice(0, 160), text: item.text, parts: partsOf(item.parts), sourceId: source.id,
      pages, shared: String(item.shared || "").slice(0, 10000), visual: ["pdf", "image"].includes(source.kind) });
    ids.add(item.id);
  }
  for (const [sourceId, check] of checks) {
    const found = questions.filter((question) => question.sourceId === sourceId);
    if (check.status === "complete" && !found.length || check.status === "reference" && found.length) throw new Error("Source inventory is inconsistent.");
    if (check.status === "unreadable") {
      // Keep readable questions, plus a visible unresolved-source item. Never
      // equate answering the readable subset with completing the whole upload.
      let id = `q${questions.length + 1}`;
      while (ids.has(id)) id = `q${Number(id.slice(1)) + 1}`;
      ids.add(id);
      questions.push({ id, number: sources.find((source) => source.id === sourceId).name, sourceId, text: String(check.reason).slice(0, 1000), parts: ["answer"], pages: [], unreadable: true });
    }
  }
  if (!questions.length) throw new Error("No readable questions were found.");
  return questions.map((question) => {
    const extra = parsed.questions.find((item) => item.id === question.id) || {};
    return { ...question, queries: (Array.isArray(extra.queries) ? extra.queries : []).filter((query) => typeof query === "string" && query.length <= 160).slice(0, 4),
      dependsOn: (Array.isArray(extra.dependsOn) ? extra.dependsOn : []).filter((id) => ids.has(id) && id !== question.id) };
  });
}
function groupQuestions(questions) {
  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    if (/上一题|前一题|\b(?:previous|preceding)\s+question\b/i.test(question.text)) {
      const previous = questions.slice(0, i).findLast((item) => item.sourceId === question.sourceId);
      if (previous) question.dependsOn = [...new Set([...(question.dependsOn || []), previous.id])];
    }
  }
  const waiting = [...questions], sorted = [], seen = new Set();
  while (waiting.length) {
    const index = waiting.findIndex((question) => (question.dependsOn || []).every((id) => seen.has(id)));
    if (index < 0) throw new Error("Question dependency cycle needs review.");
    const [question] = waiting.splice(index, 1); sorted.push(question); seen.add(question.id);
  }
  const batches = [];
  for (const question of sorted) {
    const heavy = question.parts.length > 4 || /prove|proof|证明/i.test(question.text);
    let batch = batches.at(-1);
    if (!batch || batch.questionIds.length >= 5 || heavy || batch.heavy || (question.dependsOn || []).some((id) => batch.questionIds.includes(id))) {
      batch = { id: `b${batches.length + 1}`, questionIds: [], allIds: [], dependencies: [], status: "pending", attempts: 0, heavy }; batches.push(batch);
    }
    batch.questionIds.push(question.id); batch.allIds.push(question.id);
  }
  for (let index = 0; index < batches.length; index++) {
    const batch = batches[index];
    for (const question of questions.filter((question) => batch.questionIds.includes(question.id))) {
      for (const id of question.dependsOn || []) {
        const dependency = batches.find((other) => other.questionIds.includes(id));
        if (dependency && dependency.id !== batch.id && !batch.dependencies.includes(dependency.id)) batch.dependencies.push(dependency.id);
      }
    }
  }
  return batches;
}
function validateAnswers(raw, questions, evidence) {
  const payload = typeof raw === "string" ? JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) : raw;
  if (!Array.isArray(payload?.answers)) throw new Error("Incomplete batch answer.");
  const answers = [], failed = [];
  for (const question of questions) {
    const matches = payload.answers.filter((answer) => answer.id === question.id), answer = matches[0];
    const allowed = new Map((evidence[question.id] || []).map((source) => [source.ref, source]));
    if (matches.length !== 1 || !Array.isArray(answer?.parts)) { failed.push(question.id); continue; }
    const parts = [];
    for (const id of question.parts) {
      const values = answer.parts.filter((part) => String(part.id) === id), part = values[0];
      if (values.length !== 1 || !["done", "unreadable"].includes(part?.status) || !["source", "derived", "general"].includes(part?.basis) || typeof part.text !== "string" || !part.text.trim()) break;
      const refs = Array.isArray(part.sources) ? [...new Set(part.sources)] : [];
      if (refs.some((ref) => !allowed.has(ref)) || ["source", "derived"].includes(part.basis) && !refs.length) break;
      parts.push({ id, status: part.status, text: part.text, sources: refs.map((ref) => { const source = allowed.get(ref); return { ref, name: source.name, location: source.location, revision: source.revision, sourceId: source.sourceId }; }) });
    }
    if (parts.length !== question.parts.length) { failed.push(question.id); continue; }
    answers.push({ id: question.id, number: question.number, parts });
  }
  return { answers, failed };
}
function answerMarkdown(answer) {
  return answer.parts.map((part) => `### ${plain(answer.number)}${part.id === "answer" ? "" : `(${plain(part.id)})`}\n\n${part.text}\n\n${part.sources.map((source) => `（来源：${plain(source.name)}，${plain(source.location)}）`).join(" ")}${part.status === "unreadable" ? "\n\n此小问需要补充清晰题图或资料。" : ""}`).join("\n\n");
}
async function pdfPages(source, pageNumbers) {
  if (source.kind !== "pdf" || !source.dataUrl?.startsWith("data:application/pdf;base64,")) return source;
  const original = await PDFDocument.load(Buffer.from(source.dataUrl.split(",")[1], "base64"));
  const numbers = [...new Set(pageNumbers)].filter((page) => Number.isInteger(page) && page > 0 && page <= original.getPageCount()).sort((a, b) => a - b);
  if (!numbers.length) return null;
  const target = await PDFDocument.create();
  for (const page of await target.copyPages(original, numbers.map((number) => number - 1))) target.addPage(page);
  const bytes = await target.save();
  return { ...source, name: `${source.name} [original pages ${numbers.join(",")}].pdf`, dataUrl: `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`, pages: numbers.length, originalPages: numbers, text: "" };
}
module.exports = { selectProblemSources, wantsWholeSet, questionsFrom, detectSet, enrichPlan, groupQuestions, validateAnswers, answerMarkdown, pdfPages };
