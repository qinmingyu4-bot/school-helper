"use strict";
if (process.env.NODE_ENV !== "test") throw new Error("Learning-loop fixture is test-only.");
require("./echo-ai");
const previous = globalThis.fetch;
let serial = 0;
globalThis.fetch = async (url, options) => {
  const body = JSON.parse(options?.body || "{}");
  if (!String(url).startsWith("https://api.openai.com/v1/") || !body.messages?.[0]?.content.match(/^StudyBridge (?:learning-loop|quiz-review)/)) return previous(url, options);
  if (body.store !== false || !options.signal || body.stream) throw new Error("Learning generation must be bounded and private.");
  const context = JSON.parse(body.messages[1].content);
  if (body.messages[0].content.startsWith("StudyBridge quiz-review/v1")) {
    if (context.questions.some((question) => (Object.hasOwn(question, "answerIndex") || Object.hasOwn(question, "explanations")))) throw new Error("Review must independently choose the answer.");
    return Response.json({ choices: [{ message: { content: JSON.stringify({ checks: context.questions.map(({ id }) => ({ id, correctIndices: [0], grounded: true, explanations: ["A p-value assumes the null is true, then assesses the observed data or more extreme data.", "It is not the probability the null is true.", "It does not establish certainty.", "It is not an effect size."] })) }) } }] });
  }
  const quote = "A p-value is calculated assuming the null hypothesis is true.";
  const value = body.messages[0].content.includes("topics/v1") ? { topics: [{ title: "Understanding p-values", documentId: context[0].documentId, quote }] }
    : { questions: Array.from({ length: 3 }, (_, index) => ({ prompt: `Practice ${++serial}: interpret a p-value (${index + 1})`, choices: ["Assume the null is true", "The null is probably true", "The alternative is certainly true", "The effect must be large"], answerIndex: 0,
      explanations: ["A p-value assumes the null is true, then assesses the observed data or more extreme data.", "It is not the probability the null is true.", "It does not establish certainty.", "It is not an effect size."], documentId: context.context[0].documentId, quote })) };
  return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
};
