"use strict";

const { candidates, locate } = require("../public/study-formulas");
const { sourcePages } = require("./study-citations");
const { revision } = require("./study-index");

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const component = /^[\w.-]{1,100}$/;
const queryKeys = ["conversation", "question", "part", "ref"];

function link(job, answer, part, source) {
  const query = new URLSearchParams({
    conversation: job.conversationId, question: answer.id, part: part.id, ref: source.ref
  });
  return `/api/courses/${encodeURIComponent(job.courseId)}/study-source/${encodeURIComponent(job.id)}?${query}`;
}

function selection(params) {
  const values = Object.fromEntries(queryKeys.map((key) => [key, params.get(key)]));
  if (!Object.values(values).every((value) => typeof value === "string" && component.test(value)))
    throw fail(400, "出处定位无效。");
  return values;
}

function resolveCitation(saved, part, source) {
  if (!source) throw fail(404, "原始资料已删除或暂时不可用。");
  if (!saved.revision || revision(source) !== saved.revision)
    throw fail(409, "资料已更新，旧出处无法定位。");

  const text = source.text || "";
  const originalPages = sourcePages(source);
  // Older jobs saved their locator as text. Use it only with the original verified revision.
  const oldText = /^提取文本第 \d+–\d+ 行（字符 (\d+)–(\d+)）$/.exec(saved.location);
  const oldPages = /^PDF 第 ([\d、]+) 页$/.exec(saved.location);
  const start = saved.start ?? (oldText ? Number(oldText[1]) - 1 : undefined);
  const end = saved.end ?? (oldText ? Number(oldText[2]) : undefined);
  const located = Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= text.length;
  const citedPages = saved.pages || (oldPages?.[1] || "").split("、").map(Number);
  const pages = originalPages.filter(({ page }) => citedPages.includes(page));
  let excerpt = located ? text.slice(start, Math.min(end, start + 2400)) : "";
  if (!excerpt && pages.length) excerpt = text.slice(pages[0].start, Math.min(pages[0].end, pages[0].start + 1600));
  const formulas = candidates(part.text);
  const matched = locate(excerpt.split("\n"), formulas)?.formula;
  if (!excerpt && !pages.length) throw fail(404, "这条旧引用没有可核对的原文位置。");
  const formulaPage = matched && located
    ? pages.find((page) => locate(text.slice(Math.max(page.start, start), Math.min(page.end, end)).split("\n"), [matched]))?.page
    : null;
  return { name: source.name, location: saved.location, excerpt, formulas: located ? matched ? [matched] : [] : formulas,
    hasFormula: formulas.length > 0, pages: pages.map(({ page }) => page), initialPage: formulaPage || pages[0]?.page,
    pdf: source.kind === "pdf" && Boolean(source.materialId) && pages.length > 0 };
}

module.exports = { link, selection, resolveCitation };
