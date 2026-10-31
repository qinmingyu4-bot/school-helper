"use strict";
const { questionOutline } = require("./study-coverage");
const { isSimpleStudyQuestion } = require("./ai-routing");
const { PDFDocument } = require("pdf-lib");
const plain = (text) => String(text || "").replace(/[\\`*_{}\[\]<>#]/g, "\\$&");
function questionsFrom(source) {
  const outline = questionOutline(source.text), matches = [...String(source.text || "").matchAll(/(?:^|\n)[ \t]*(?:(?:Question|Problem|Q)\s*|第\s*)?(\d{1,3})\s*(?:[.)、．:：]|题[：:]?)[ \t]*(?=[A-Za-z0-9\u3400-\u9fff(（$\\−+])/gi)];
  if (!outline.length) return [];
  const first = matches.findIndex((match, index) => Number(match[1]) === outline[0].number && outline.every((item, i) => Number(matches[index + i]?.[1]) === item.number));
  if (first < 0) return [];
  return outline.map((item, index) => {
    const start = matches[first + index].index, end = matches[first + index + 1]?.index || source.text.length;
    const text = source.text.slice(start, end).trim(), parts = [...new Set([...text.matchAll(/[（(]\s*([a-z])\s*[)）]/gi)].map((match) => match[1].toLowerCase()))];
    return { number: item.number, text, parts: parts.length ? parts : ["answer"], sourceId: source.id,
      pages: (source.sourcePages || []).filter((page) => page.start < end && page.end > start).map((page) => page.page),
      shared: source.text.slice(0, matches[first].index).slice(0, 10000), dependsOn: [], queries: [],
      visual: /graph|diagram|figure|table|plot|shown|图|表|坐标|曲线|积分|几何/i.test(text) };
  });
}
function detectSet({ message = "", mode = "guided", sources = [] }) {
  if (["exam", "assignment", "cheatsheet", "preview"].includes(mode) || /只(?:要|讲|做|看|解)|第\s*\d+\s*(?:题|小问)|hints? only|one.at.a.time|quiz me|先让我|不要.*答案|出.*题|generate.*(?:exam|questions)|总结|归纳|概括|翻译|summari[sz]e|translate/i.test(message)) return null;
  const questions = sources.flatMap(questionsFrom).map((question, index) => ({ ...question, id: `q${index + 1}` }));
  for (const question of questions) if (questions.some((other) => other.id !== question.id && other.number === question.number)) question.number = `${sources.find((source) => source.id === question.sourceId).name} · ${question.number}`;
  if (questions.length >= 6) return { questions, sourceIds: [...new Set(questions.map((question) => question.sourceId))] };
  if (!questions.length && sources.some((source) => ["pdf", "image"].includes(source.kind)) && /整套|全部.*题|所有.*题|试卷|problem.set|all.*(?:questions|problems)|solve.*(?:paper|exam)/i.test(message)) return { questions: [], sourceIds: sources.map((source) => source.id) };
  return null;
}
function enrichPlan(detected, raw, sources) {
  const parsed = typeof raw === "string" ? JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) : raw;
  if (!Array.isArray(parsed?.questions)) throw new Error("Question inventory could not be verified.");
  let questions = detected.questions;
  if (!questions.length) {
    questions = parsed.questions.map((item, index) => {
      const source = sources.find((source) => source.id === item.sourceId);
      if (!source || typeof item.text !== "string" || !item.text.trim()) throw new Error("Unreadable question inventory.");
      return { id: `q${index + 1}`, number: item.number || index + 1, text: item.text, parts: Array.isArray(item.parts) && item.parts.length ? item.parts.map(String) : ["answer"],
        sourceId: source.id, pages: (item.pages || []).filter((page) => Number.isInteger(page) && page > 0 && page <= (source.pages || 10000)), shared: "", visual: true };
    });
    if (!questions.length) throw new Error("No readable questions were found.");
  }
  const ids = new Set(questions.map((question) => question.id));
  return questions.map((question) => {
    const extra = parsed.questions.find((item) => item.id === question.id) || {};
    return { ...question, queries: (Array.isArray(extra.queries) ? extra.queries : []).filter((query) => typeof query === "string" && query.length <= 160).slice(0, 4),
      dependsOn: (Array.isArray(extra.dependsOn) ? extra.dependsOn : []).filter((id) => ids.has(id) && id !== question.id) };
  });
}
function groupQuestions(questions, message = "") {
  const waiting = [...questions], sorted = [], seen = new Set();
  while (waiting.length) {
    const index = waiting.findIndex((question) => (question.dependsOn || []).every((id) => seen.has(id)));
    if (index < 0) throw new Error("Question dependency cycle needs review.");
    const [question] = waiting.splice(index, 1); sorted.push(question); seen.add(question.id);
  }
  const batches = []; let previousSimple;
  for (const question of sorted) {
    const heavy = question.parts.length > 4 || /prove|proof|证明/i.test(question.text);
    const simple = isSimpleStudyQuestion(question, message);
    let batch = batches.at(-1);
    if (!batch || batch.questionIds.length >= 5 || heavy || batch.heavy || simple !== previousSimple) {
      batch = { id: `b${batches.length + 1}`, questionIds: [], allIds: [], dependencies: [], status: "pending", attempts: 0, heavy }; batches.push(batch);
    }
    batch.questionIds.push(question.id); batch.allIds.push(question.id);
    previousSimple = simple;
  }
  for (let index = 0; index < batches.length; index++) {
    const batch = batches[index];
    for (const question of questions.filter((question) => batch.questionIds.includes(question.id))) {
      for (const id of question.dependsOn || []) {
        const dependency = batches.find((other) => other.questionIds.includes(id));
        if (dependency && dependency.id !== batch.id && !batch.dependencies.includes(dependency.id)) batch.dependencies.push(dependency.id);
      }
      if (/上一题|前一题|above|previous (?:question|part)|preceding/i.test(question.text) && index && !batch.dependencies.includes(batches[index - 1].id)) batch.dependencies.push(batches[index - 1].id);
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
module.exports = { questionsFrom, detectSet, enrichPlan, groupQuestions, validateAnswers, answerMarkdown, pdfPages };
