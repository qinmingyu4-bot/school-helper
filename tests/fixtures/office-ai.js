const assert = require("node:assert/strict");
const original = global.fetch;
const summarized = new Set();
const seenInvalidSlide = new Set();
global.fetch = async (url, options) => {
  if (String(url).startsWith("https://api.openai.com/v1/chat/completions")) {
    const body = JSON.parse(options.body);
    const system = String(body.messages[0].content);
    const isSlides = system.includes("manual slides editor") || system.includes("EXISTING presentation");
    const user = String(body.messages.at(-1).content);
    if (system.startsWith("Summarize a saved conversation")) {
      if (body.store !== false || summarized.has(user)) throw new Error("Unexpected duplicate or stored summary request.");
      summarized.add(user);
      const { transcript } = JSON.parse(user);
      const questions = transcript.filter((message) => message.role === "user").map((message) => message.text);
      const content = questions.includes("Invalid summary fixture") ? "This is not valid JSON" : JSON.stringify({
        title: "Study recap",
        sections: [{ heading: "What we covered", paragraphs: ["An editable recap."], points: questions }],
      });
      return Response.json({ choices: [{ message: { content }, finish_reason: "stop" }] });
    }
    const source = system.includes('"changes"') ? JSON.parse(user.split("Current editing context:\n")[1]) : null;
    const simple = isSlides && source?.slides.length === 1 && !user.includes("推导");
    const allowRepair = simple && user.includes("INVALID_FIRST_PATCH");
    const repair = seenInvalidSlide.delete(user);
    assert.equal(body.model, isSlides && (!simple || repair) ? "gpt-6.2-sol" : "gpt-6-luna");
    if (allowRepair && !repair) {
      seenInvalidSlide.add(user);
      return Response.json({ choices: [{ message: { content: '{"changes":[{"slideId":"outside","set":{"notes":"Invalid"}}]}' } }] });
    }
    const content = source
      ? JSON.stringify({ changes: source.slides ? source.slides.flatMap((slide) => slide.elements.filter((el) => el.type === "text").map((el) => ({ slideId: slide.id, elementId: el.id, set: { text: "Revised: " + el.text } }))) : source.sheets.flatMap((sheet) => Object.keys(sheet.cells).slice(0, 2).map((cell) => ({ sheetId: sheet.id, cell, set: { value: "42", style: { bold: true } } }))) })
      : system.includes('"edits"')
      ? JSON.stringify({ edits: JSON.parse(user.split("Current editing context:\n")[1]).blocks.map((block) => ({ id: block.id, text: "Revised: " + block.text })) })
      : system.includes("manual slides editor")
      ? JSON.stringify({
          slides: [
            {
              title: "AI introduction",
              body: "Editable point one\nEditable point two",
            },
          ],
        })
      : system.includes("manual sheets editor")
        ? "=SUM(A1:A2)"
        : "A clearer version of the student's argument.";
    return new Response(
      JSON.stringify({ choices: [{ message: { content } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  return original(url, options);
};

require("./usage-transport").install();
