const original = global.fetch;
global.fetch = async (url, options) => {
  if (String(url).startsWith("https://api.openai.com/v1/chat/completions")) {
    const body = JSON.parse(options.body);
    const system = String(body.messages[0].content);
    const content = system.includes("manual slides editor")
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
