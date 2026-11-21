"use strict";

const { PDFDocument } = require("pdf-lib");
const { SOL_MODEL, PREVIOUS_SOL_MODEL } = require("../lib/ai-models");
const { cost } = require("../lib/ai-usage");
const { groundingInstruction } = require("../lib/study-grounding");
const { contentRevisionChanges, contentRevisionSource, revisionGuidance } = require("../lib/office-content-revision");
const { readEvents } = require("../public/chat-stream");

const models = [PREVIOUS_SOL_MODEL, SOL_MODEL];
const entriesMatch = (actual, expected) => Object.entries(expected).every(([key, value]) => actual?.[key] === value);
const parse = (text) => JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));

async function fixtures() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([380, 250]);
  page.drawText("Velocity vs. time", { x: 52, y: 215 });
  page.drawLine({ start: { x: 56, y: 50 }, end: { x: 326, y: 50 }, thickness: 1 });
  page.drawLine({ start: { x: 56, y: 50 }, end: { x: 56, y: 179 }, thickness: 1 });
  page.drawLine({ start: { x: 56, y: 90 }, end: { x: 276, y: 170 }, thickness: 3 });
  page.drawText("t (s)", { x: 308, y: 30 });
  page.drawText("v (m/s)", { x: 14, y: 189 });
  for (const [x, y, label] of [[44, 35, "0"], [270, 35, "4"], [35, 84, "2"], [35, 164, "6"]]) {
    page.drawText(label, { x, y, size: 11 });
  }
  page.drawLine({ start: { x: 276, y: 50 }, end: { x: 276, y: 170 }, dashArray: [3, 3] });
  page.drawLine({ start: { x: 56, y: 170 }, end: { x: 276, y: 170 }, dashArray: [3, 3] });
  const file = { type: "input_file", filename: "velocity.pdf", file_data: await pdf.saveAsBase64({ dataUri: true }) };

  const slide = (id, text, editable) => ({
    id, editable, notes: "", background: "#ffffff", transition: "none", duration: 0.5,
    elements: [{ id: "e0", type: "text", text, x: 5, y: 10, w: 80, h: 20,
      font: "Arial", size: 28, color: "#222222", bold: true, align: "left" }]
  });
  const source = contentRevisionSource("slides", { slides: [
    slide("s0", "Lab results", true), slide("s1", "Raw measurements", false)
  ] });
  return [
    {
      id: "chinese-worked-math", instruction: groundingInstruction,
      prompt: "离散型随机变量 X 的取值 0、1、3 的概率分别是 0.2、0.5、0.3。计算 (a) E[X]、(b) Var(X)、(c) P(X≥1)、(d) E[2X+1]。用简体中文给出可复算过程。返回 JSON {mean,variance,probability,transformedMean,working}，前四项为数字，working 为中文解题过程。",
      grade: (data) => entriesMatch(data, { mean: 1.4, variance: 1.24, probability: 0.8, transformedMean: 3.8 })
        && typeof data.working === "string" && /[\u4e00-\u9fff]/.test(data.working)
    },
    {
      id: "pdf-graph-four-parts", instruction: groundingInstruction,
      prompt: "Read the attached velocity–time graph. Find (a) initial velocity in m/s, (b) final velocity in m/s, (c) acceleration in m/s², and (d) signed displacement over the plotted interval in m. Return JSON {initial,final,acceleration,displacement,working} with four numeric results and a brief worked explanation citing the PDF page.",
      file,
      grade: (data) => entriesMatch(data, { initial: 2, final: 6, acceleration: 1, displacement: 16 })
        && typeof data.working === "string" && /page\s+1\b/i.test(data.working)
    },
    {
      id: "slides-scoped-edit", instruction: revisionGuidance.slides,
      prompt: `Change only the first slide title to “Trial 2 Results” and its background to #f4f4f4. Leave the second slide and formatting alone.\nCurrent editing context:\n${JSON.stringify(source)}`,
      grade: (data) => {
        const changes = contentRevisionChanges("slides", data, source);
        return changes.length === 2 && changes.every((item) => item.slideId === "s0" && Object.keys(item.set).length === 1)
          && changes.some((item) => item.elementId === "e0" && item.set.text === "Trial 2 Results")
          && changes.some((item) => item.elementId === undefined && item.set.background?.toLowerCase() === "#f4f4f4");
      }
    }
  ];
}

async function run(model, sample, apiKey) {
  const input = [{ role: "system", content: sample.instruction }, { role: "user", content: [
    { type: "input_text", text: sample.prompt }, ...(sample.file ? [sample.file] : [])
  ] }];
  const start = performance.now();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", signal: AbortSignal.timeout(120000),
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model, input, store: false, stream: true, service_tier: "default", max_output_tokens: 2500 })
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`API HTTP ${response.status} for ${model} on ${sample.id}`);
  }
  let firstTextMs = null, output = "", terminal;
  await readEvents(response, ({ data }) => {
    const event = JSON.parse(data);
    if (event.type === "response.output_text.delta" && event.delta) {
      firstTextMs ??= Math.round(performance.now() - start);
      output += event.delta;
    }
    if (["response.completed", "response.incomplete", "response.failed", "error"].includes(event.type)) {
      terminal = event.response;
      return false;
    }
  });
  const elapsedMs = Math.round(performance.now() - start);
  const micros = cost(model, terminal);
  let passed = false;
  if (terminal?.status === "completed") {
    try { passed = sample.grade(parse(output)); } catch { /* Invalid output fails the fixture. */ }
  }
  return { model, case: sample.id, passed, firstTextMs, elapsedMs, status: terminal?.status || "interrupted",
    usage: terminal?.usage || null, estimatedUsd: micros === null ? null : micros / 1e6, output };
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for the live Sol comparison.");
  for (const [index, sample] of (await fixtures()).entries()) {
    const order = index % 2 ? models.slice().reverse() : models;
    for (const model of order) console.log(JSON.stringify(await run(model, sample, apiKey)));
  }
}

main().catch((error) => {
  console.error(error.message, error.cause?.code || "");
  process.exitCode = 1;
});
