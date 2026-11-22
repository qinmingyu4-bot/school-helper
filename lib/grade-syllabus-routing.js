"use strict";

const { normalizeName } = require("../public/grade-planner-model");
const { matchQuote } = require("./grade-preview-recognition");

const complexRule = [
  /\b(?:missed|make[ -]?up|deferred)\s+(?:quiz(?:zes)?|exam|midterm|final|test|assessment|lab|assignment)\b|\b(?:absence|absen[ct]|accommodat)\w*\b.{0,75}\b(?:weight|grade|points?|marks?|score|dropp?ed|excluded|quiz|exam|assessment)\w*\b/i,
  /\b(?:reweight|redistribut|transfer|reallocat|substitut)\w*\b.{0,85}\b(?:weight|grade|final|midterm|percent|points)\b|\b(?:weight|grade|percent|points)\b.{0,85}\b(?:reweight|redistribut|transfer|reallocat|substitut)\w*\b/i,
  /\b(?:alternative|alternate|optional|different)\s+(?:grading|weight|formula|scheme|assessment)\w*\b|\balternative\s+(?:[A-Z]|\d+|plan)\b|\b(?:higher|better|greater) of\b|\bbonus\s+(?:credit|marks?|points?|percentage)\b|\bextra credit\b|\bgrad(?:e|es|ing)\s+(?:are\s+)?curv\w*\b/i,
  /\b(?:(?:must|need to) pass|minimum\s+(?:mark|grade|score|final)|caps?\s+(?:the|your)?\s*(?:course|overall|final)?\s*grade|course grade.{0,40}capp?ed|grading (?:tables|schemes) conflict)\b/i,
  /(?:缺考|缺席|缓考|补考|评分方案.{0,10}(?:替代|冲突)|(?:权重|占比).{0,18}(?:转移|转给|重分配|调整)|(?:转移|转给|重分配).{0,18}(?:权重|占比)|额外加分|加分项|总评.{0,16}(?:封顶|上限)|(?:期末|总评).{0,18}(?:必须及格|最低.{0,6}及格|及格门槛))/i
];
const dropCue = /\blowest\b.{0,90}\b(?:drop|discard|exclud|omit|ignore|disregard|count)\w*\b|\b(?:drop|discard|exclud|omit|ignore|disregard)\w*\b.{0,90}\blowest\b|\b(?:best|highest|top)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b.{0,70}\b(?:count|out of|of the|quiz|score|mark|grade|lab|test|assignment)\w*\b|\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:best|highest|top)\b.{0,70}\bcount\w*\b|(?:剔除|去掉|舍弃|不计入).{0,16}最低|最低.{0,16}(?:剔除|去掉|舍弃|不计入)|(?:中取|取|保留).{0,10}(?:最高|最好)/i;
const noDrop = /^(?:no\b.{0,60}\b(?:dropp?ed|drop|exclud\w*)\b|.{0,60}\b(?:not|never)\s+(?:be\s+)?(?:dropped|discarded|excluded)\b|.{0,30}(?:不剔除|不舍弃|全部计入|均计入))\s*[.!?]?$/i;
const continuationCondition = /^(?:this(?: rule)? (?:does not apply|applies)|the (?:drop|exclusion) (?:applies|is allowed)|only (?:if|when|for)|except |此规则|该规则|仅在|只有)/i;
const conditionalDrop = /\b(?:if|unless|except|provided\s+(?:that|all)|subject\s+to|conditional\s+on)\b|(?:除非|缺考|缺席|如果|若|只有.{0,30}才|条件)/i;
const assessmentName = /(?:assignments?|coursework|homework|quiz(?:zes)?|midterms?|finals?|exams?|labs?|projects?|participation|presentations?|tests?|作业|小测|期中|期末|实验|项目|参与)/i;
const weightRow = /^([\p{L}][\p{L}\p{N}\s&()/'’.-]{0,75}?)\s*(?:[:：–—=|\-]\s*|\s+)(\d{1,3}(?:\.\d+)?)\s*(?:%|percent)\s*[.!]?$/iu;

// Inspect the original text independently of model output, including conditions
// that might be omitted from a model's quotation or placed after the grade table.
function inspectSyllabus(sources = []) {
  const texts = sources.filter(source => !source.native && /[\p{L}]/u.test(source.text || "")).map(source => source.text.normalize("NFKC"));
  const incomplete = !texts.length || texts.length !== sources.length;
  const clauses = texts.flatMap(text => text.split(/[\r\n;；。]+|(?<=[.!?])\s+/u)).map(text => text.trim()).filter(Boolean);
  const isDrop = text => dropCue.test(text) && !noDrop.test(text);
  const drops = clauses.filter(isDrop);
  const plainNoDrop = new Set(clauses.filter(text => noDrop.test(text) && !conditionalDrop.test(text)).map(normalizeName));
  const weights = new Map();
  for (const line of texts.flatMap(text => text.split(/[\r\n;；·•]+/u))) {
    const match = weightRow.exec(line.trim());
    if (!match || !assessmentName.test(match[1]) || Number(match[2]) > 100) continue;
    const name = normalizeName(match[1]);
    const values = weights.get(name) || new Set();
    values.add(Number(match[2]));
    weights.set(name, values);
  }
  const review = incomplete || texts.some(text => complexRule.some(pattern => pattern.test(text.replace(/\s+/g, " "))))
    || drops.some(text => conditionalDrop.test(text))
    || clauses.some((text, index) => continuationCondition.test(text) && isDrop(clauses[index - 1] || ""))
    || [...weights.values()].some(values => values.size > 1);
  return {
    review,
    preferSol: review || sources.some(source => source.excerpted || source.text.length > 24000),
    normalizeNoDropNotes(categories) {
      for (const category of categories) {
        // An independently verified, standalone no-drop sentence is ordinary.
        if (!category.dropLowest && category.specialRule && plainNoDrop.has(normalizeName(category.specialRule))) category.specialRule = "";
      }
    },
    matches(categories) {
      const proposed = new Map(categories.map(category => [normalizeName(category.name), category.weight]));
      const citations = categories.filter(category => category.dropLowest && category.dropEvidence);
      // Require a verified citation for every visible drop instruction, even if
      // the model returned a complete-looking table and omitted that instruction.
      return [...weights].every(([name, values]) => proposed.has(name) && values.has(proposed.get(name)))
        && drops.every(text => {
          const clause = normalizeName(text);
          const named = categories.filter(category => {
            const name = normalizeName(category.name).replace(/(?:zes|s)$/, "");
            return name.length > 1 && clause.includes(name);
          });
          return citations.some(category => {
            if (named.length === 1 && named[0] !== category) return false;
            const quote = category.dropEvidence.normalize("NFKC");
            return matchQuote(text, quote) || matchQuote(quote, text);
          });
        });
    }
  };
}

module.exports = { inspectSyllabus };
