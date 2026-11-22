const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createStudyChatSummary } = require("../lib/study-chat-summary");

test("long chat summaries include early and recent history within a bounded prompt", async () => {
  const history = Array.from({ length: 300 }, (_, index) => ({
    role: index % 2 ? "assistant" : "user",
    content: `Message ${index}: ` + "😀".repeat(800) + ` end ${index}`,
    interrupted: index === 299,
  }));
  let input, saved;
  const summarize = createStudyChatSummary({
    db: {
      listMessages: async () => history,
      getOfficeProject: async () => null,
      getConversation: async () => ({ id: "default" }),
      getCourse: async () => ({ id: "course" }),
    },
    office: { save: async (_userId, _id, body) => { saved = body; } },
    generate: async ([, message]) => {
      input = JSON.parse(message.content);
      return JSON.stringify({ title: "Long chat", sections: [{ points: ["Main idea"] }] });
    },
  });
  await summarize({ userId: "owner", course: { id: "course", name: "Economics" }, conversation: { id: "default" }, language: "en" });
  assert.equal(input.partial, true);
  assert.equal(input.transcript.length, 250);
  assert.match(input.transcript[0].text, /^Message 0: .* end 0$/u);
  assert.match(input.transcript.at(-1).text, /^Message 299: .* end 299$/u);
  assert(input.transcript.at(-1).interrupted);
  assert(input.transcript.every(({ text, excerpt }) => excerpt && text.isWellFormed()));
  assert(input.transcript.reduce((total, { text }) => total + text.length, 0) <= 80000);
  assert.match(saved.model.content.content[1].content[0].text, /uses excerpts/);
});
