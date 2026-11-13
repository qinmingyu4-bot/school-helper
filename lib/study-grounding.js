"use strict";

// Only explicit references to an existing visual, not requests to draw a new one.
function refersToVisual(text) {
  return /如图|下图|上图|图中|附图|这张图|这幅图|该图|根据.{0,8}(?:图像|图形)|(?:shown|illustrated|depicted)\s+(?:below|above|in\s+(?:the\s+)?(?:figure|diagram|graph))|(?:from|using|in|refer\s+to|see)\s+(?:the\s+)?(?:attached\s+|following\s+)?(?:figure|diagram|graph|picture|image)\b|\b(?:figure|fig\.)\s*\d+/i.test(String(text || ""));
}

const groundingInstruction = `Before solving, check that the actual question, every needed condition and any referenced visual are available and readable. A filename, OCR text or unrelated course figure is not proof that you saw the question's diagram. Never infer missing labels, values, units, geometry or answer choices from a familiar-looking exercise. If anything essential is missing, identify the exact question/subpart and missing item, explain briefly why it matters, and ask for a clear crop including the question number, full wording, labels and units, or a typed transcription. You may explain a method that follows from confirmed information, clearly separated from the unresolved answer; do not give a guessed final answer or disguise assumptions as facts. Continue independent readable parts. Teach with a short intuitive explanation or a clearly labelled small example when helpful, followed by reproducible reasoning; stay warm, concise and respect hints-only requests. Do not invent facts to make the answer entertaining.`;

function missingStudyVisuals({ message = "", currentAttachments = [], attachments = [], documents = [], visuals = [] }) {
  // A student can replace the missing visual with an explicit transcription.
  // Its sufficiency is still checked by the grounding instructions, never assumed.
  if (!currentAttachments.length && /(?:补充说明|完整题干|图中数据|transcription|additional details)\s*[:：]\s*\S/i.test(message)) return [];
  const sources = [...documents.map((doc) => ({ name: doc.title, documentId: doc.id, text: doc.text, kind: doc.hasSourcePdf ? "pdf" : "text" })), ...attachments];
  const named = sources.filter((source) => source.name && message.toLowerCase().includes(source.name.toLowerCase()));
  const followup = /题|讲解|解答|继续|分析|图|\b(?:solve|explain|continue|analy[sz]e|question|problem|pdf)\b/i.test(message);
  const targets = currentAttachments.length ? currentAttachments : named.length ? named : followup ? attachments.length ? [attachments.at(-1)] : sources.length === 1 ? sources : [] : [];
  const missing = targets.filter((source) => ["pdf", "image"].includes(source.kind) && !visuals.some((file) =>
    file.kind === source.kind && (source.documentId ? file.documentId === source.documentId : file.name === source.name) && (!source.dataUrl || file.dataUrl === source.dataUrl)));
  const targetVisuals = targets.filter((source) => ["pdf", "image"].includes(source.kind));
  if (!targetVisuals.length) {
    for (const source of targets) if (refersToVisual(source.text)) missing.push(source);
  }
  // Having an unrelated retained original does not establish the missing figure's identity.
  if (refersToVisual(message) && !visuals.length && !missing.length) missing.push({ name: /[\u3400-\u9fff]/.test(message) ? "题目中引用的图" : "the referenced question figure" });
  return [...new Set(missing.map((source) => source.name))];
}

function missingVisualReply(names, english = false) {
  const labels = names.map((name) => String(name).replace(/[\r\n<>`*_\[\]\\]/g, " ")).join(english ? ", " : "、");
  return english
    ? `I don't have the original visual needed for ${labels} in this reply, so I can't reliably determine the answer yet.\n\nPlease upload a clear crop with the question number, full wording, diagram labels and units, or type out those details. For a large file, send just the relevant pages or one question at a time. Once those details are available, we can work through the method and calculation step by step.`
    : `这次还没有拿到「${labels}」所需的原图，关键条件无法核对，因此暂时不能给出可靠答案。\n\n请补充清晰题图，保留题号、完整题干、图中标注和单位；也可以把这些条件打出来。文件较多时，先发相关页面或一道题就好。补齐后，我们再把“为什么这样做”和每一步计算讲清楚。`;
}

module.exports = { refersToVisual, groundingInstruction, missingStudyVisuals, missingVisualReply };
