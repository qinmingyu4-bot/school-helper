(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeLearningStyle = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  function normalize(value = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value)) value = {};
    return {
      englishTerms: value.englishTerms !== false,
      englishAnswers: value.englishAnswers === true,
      chineseExplanations: value.chineseExplanations === true,
      customInstruction: String(value.customInstruction || "").trim().slice(0, 500)
    };
  }
  function summary(value) {
    const p = normalize(value);
    const parts = [p.englishAnswers ? "英文作答" : "作答语言跟随提问", p.chineseExplanations ? "中文讲解" : p.englishAnswers ? "英文讲解" : "讲解语言跟随提问"];
    if (p.englishTerms) parts.push("保留英文术语");
    if (p.customInstruction) parts.push("自定义说明优先");
    return parts.join(" · ");
  }
  function buildInstruction(value) {
    const p = normalize(value);
    const lines = [
      "\n\nLearning Style — resolved response contract:",
      "- Apply safety first, then the latest EXPLICIT language/format request, then the student's custom style instruction, then the checkbox settings below, then the default of matching the question's language. A question merely written in Chinese (such as 怎么做) is not an explicit Chinese-only request. Likewise, an English question alone does not disable Chinese explanations.",
      p.englishTerms
        ? "- English terms ON: preserve useful English academic/technical terms in Chinese explanations, with a short Chinese definition when needed. Do not translate entire paragraphs twice."
        : "- English terms OFF: explain terms naturally in the chosen explanation language; do not insert English keywords into Chinese prose just for bilingual decoration. Preserve formulas, proper nouns, exact quotations, and required English answer wording.",
      p.englishAnswers
        ? "- English answer ON: provide the final answer, exam-ready response, or requested draft in English even when the student asks in Chinese. This checkbox is an explicit saved preference, including when all three checkboxes are ON and the custom instruction is empty."
        : "- English answer OFF: choose the final answer language from the latest explicit request/custom instruction, otherwise match the student's question. This does not prohibit English if the task itself requires it.",
      p.chineseExplanations
        ? "- Chinese explanation ON: explain concepts, steps, justification, and study guidance in Chinese even if the question is in English. Provide a learner-facing explanation, not private/internal chain-of-thought."
        : p.englishAnswers ? "- Chinese explanation OFF: use English for the supporting explanation unless an explicit request/custom instruction specifies otherwise." : "- Chinese explanation OFF: explain in the question's language unless an explicit request/custom instruction specifies otherwise."
    ];
    if (p.englishAnswers && p.chineseExplanations) {
      lines.push("- Combined checkboxes: for a worked academic answer, teach first in 中文讲解 (method, why it applies, and intermediate calculations), then provide a concise usable Answer (English). Both sections are required without needing the student to type bilingual into the custom box. For multipart questions, pair each part's Chinese teaching explanation with its English answer before moving to the next part; do not front-load all final answers. An explicit request for a different order takes precedence. Do not duplicate the full explanation in both languages.");
    }
    lines.push("- Language choices do not reduce teaching depth: English answer ON does not mean answer-only, and Chinese explanation OFF does not remove the worked explanation; use the resolved explanation language. For academic problems, teach the method, its reason and the reproducible calculation before the final answer unless the student explicitly requests a different format. Keep native document, exam-cram and cheatsheet limits intact.");
    lines.push("- A short-answer request limits length, not the saved language choices. A hints-only/interactive-quiz request withholds the final answer until permitted; do not reveal it merely to fill an English Answer section. Ordinary conversation or an email draft need not acquire irrelevant academic sections.");
    lines.push(String.raw`- Keep everyday answers concise; for academic problems explain the method and key concepts. For chat text, StudyBridge renders mathematical notation: write inline math inside \( ... \) and standalone equations inside \[ ... \]. Use LaTeX commands inside these delimiters, for example \(\sqrt{x}\), \(\frac{a+b}{c}\), \(x^2\), \(\sqrt[3]{x-1}\) and \[P=2+\int_1^2\sqrt{1+\frac{1}{9(x-1)^{4/3}}}\,dx\]. Prefer typeset roots, fractions, powers, integrals and limits over programming notation like sqrt(...), ^(...) or flattened integral bounds. Do not put mathematical notation in code spans or code fences unless the user requests source/code; preserve literal programming code and currency as text. For generated documents, use native typeset notation; do not print the chat delimiters or raw LaTeX commands into the artifact.`);
    if (p.customInstruction) lines.push(`- Student custom style instruction (overrides conflicting checkbox defaults, but not safety or the latest explicit request): ${p.customInstruction}`);
    return lines.join("\n");
  }

  // Serialize saves so an older network response cannot overwrite a newer edit.
  function createSaver({ initial, save, onChange = () => {} }) {
    let draft = normalize(initial), saved = normalize(initial), status = "saved", pending = null, disposed = false;
    const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const snapshot = () => ({ draft: { ...draft }, status, dirty: !equal(draft, saved) });
    const notify = () => { if (!disposed) onChange(snapshot()); };
    function setDraft(value) {
      if (disposed) return;
      draft = normalize(value);
      if (!pending) status = equal(draft, saved) ? "saved" : "unsaved";
      notify();
    }
    async function flush() {
      if (disposed) throw new Error("偏好保存已取消。");
      if (pending) {
        await pending;
        if (disposed) throw new Error("偏好保存已取消。");
        if (!equal(draft, saved)) return flush();
        return;
      }
      pending = (async () => {
        while (!disposed && !equal(draft, saved)) {
          const next = { ...draft };
          status = "saving";
          notify();
          try {
            saved = normalize(await save(next));
            if (disposed) return;
            status = equal(draft, saved) ? "saved" : "unsaved";
            notify();
          } catch (error) {
            status = "error";
            notify();
            throw error;
          }
        }
      })().finally(() => { pending = null; });
      return pending;
    }
    return { snapshot, setDraft, flush, dispose: () => { disposed = true; } };
  }
  return { normalize, summary, buildInstruction, createSaver };
});
