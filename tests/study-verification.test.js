const { test } = require("node:test");
const assert = require("node:assert/strict");
const { verifyQuiz } = require("../lib/study-verification");
const questions = [{ prompt: "What is 2 + 2?", choices: ["4", "5", "6", "7"], answerIndex: 0, explanations: ["2 + 2 = 4", "Not 5", "Not 6", "Not 7"], source: { quote: "Adding two pairs gives four." } }];
const check = { id: 0, correctIndices: [0], grounded: true, explanations: ["Independent calculation: 2 + 2 = 4", "Adding two pairs is not five", "Adding two pairs is not six", "Adding two pairs is not seven"] };

test("quiz reviewer independently solves the question without the proposed answer index", async () => {
  await verifyQuiz(async (messages) => {
    const input = JSON.parse(messages[1].content);
    assert.equal(Object.hasOwn(input.questions[0], "answerIndex"), false);
    assert.equal(Object.hasOwn(input.questions[0], "explanations"), false);
    assert.equal(input.questions[0].choices[0], "4");
    assert.deepEqual(input.context, [{ text: "Adding two pairs gives four." }]);
    return JSON.stringify({ checks: [check] });
  }, questions, [{ text: "Adding two pairs gives four." }]);
  assert.deepEqual(questions[0].explanations, check.explanations);
});
test("wrong, ambiguous, unsupported, incomplete and malformed reviews are rejected", async () => {
  for (const checks of [[], [check, check], [{ ...check, id: 1 }], [{ ...check, correctIndices: [1] }], [{ ...check, correctIndices: [0, 1] }], [{ ...check, grounded: false }], [{ ...check, explanations: ["wrong shape"] }]]) {
    await assert.rejects(verifyQuiz(async () => JSON.stringify({ checks }), questions, []));
  }
  await assert.rejects(verifyQuiz(async () => "invalid", questions, []));
  await assert.rejects(verifyQuiz(async () => { throw Error("Provider timeout"); }, questions, []));
});
