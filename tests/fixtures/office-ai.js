const original = global.fetch;
global.fetch = async (url, options) => {
  if (String(url).startsWith("https://api.openai.com/v1/chat/completions")) {
    const body = JSON.parse(options.body);
    const system = String(body.messages[0].content);
    const user = String(body.messages.at(-1).content);
    const source = system.includes('"changes"') ? JSON.parse(user.split("Current editing context:\n")[1]) : null;
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
