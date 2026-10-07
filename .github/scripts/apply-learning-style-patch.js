const fs = require('fs');

const path = 'server.js';
let text = fs.readFileSync(path, 'utf8');

if (!text.includes('const preferenceInstruction = buildPreferenceInstruction(user.preferences || {});')) {
  text = text.replace(
    'function buildStudyPrompt({ user, course, documents, history, scheduleItems, weatherContext, mode, message }) {\n  const docContext = documents',
    'function buildStudyPrompt({ user, course, documents, history, scheduleItems, weatherContext, mode, message }) {\n  const preferenceInstruction = buildPreferenceInstruction(user.preferences || {});\n  const docContext = documents'
  );
}

text = text.replace(
  'When real-time weather context is provided, answer the weather question directly and include practical clothing/commute advice."',
  'When real-time weather context is provided, answer the weather question directly and include practical clothing/commute advice." +\n        preferenceInstruction'
);

text = text.replace(
  'Course: ${course.name}\\nMode: ${mode}\\nPreferences: ${JSON.stringify(\n        user.preferences || {}\n      )}\\nCurrent server time:',
  'Course: ${course.name}\\nMode: ${mode}\\nLearning style instructions:\\n${preferenceInstruction || "Use StudyBridge defaults: Chinese explanation with helpful English academic terms."}\\nRaw preferences: ${JSON.stringify(\n        user.preferences || {}\n      )}\\nCurrent server time:'
);

const preferenceHelper = String.raw`
function buildPreferenceInstruction(preferences = {}) {
  const englishTerms = preferences.englishTerms !== false;
  const englishAnswers = preferences.englishAnswers !== false;
  const chineseExplanations = preferences.chineseExplanations !== false;
  const customInstruction = String(preferences.customInstruction || "").trim();
  const lines = [
    "\\n\\nLearning Style is mandatory. It overrides the general default language style unless it conflicts with safety or the user's latest message."
  ];

  if (englishTerms) {
    lines.push("- English terms ON: keep important academic keywords, formulas, course concepts, due-date labels, assignment wording, and technical terms in English. Add concise Chinese explanation after them when helpful.");
  } else {
    lines.push("- English terms OFF: translate English academic terms into Chinese when natural, but keep proper nouns, formulas, and exact course labels unchanged.");
  }

  if (englishAnswers && chineseExplanations) {
    lines.push("- English answer ON + Chinese reasoning ON: for problem-solving, assignments, emails, practice questions, exam prep, or study planning, use this order exactly: first provide the direct answer/draft in English, then provide the reasoning, steps, study plan, and warnings in Chinese.");
  } else if (englishAnswers) {
    lines.push("- English answer ON: provide the direct answer/draft in English first, then keep the rest concise.");
  } else if (chineseExplanations) {
    lines.push("- Chinese reasoning ON: explain reasoning, steps, and study strategy in Chinese first. Include English only where it improves academic accuracy.");
  } else {
    lines.push("- Keep answers concise and match the user's language.");
  }

  lines.push("- These three default options do not conflict: English terms are vocabulary anchors, English answer is the final/draft output layer, and Chinese reasoning is the explanation layer.");
  lines.push("- Do not ignore these settings. If the answer is not a question-solving task, still preserve English terms when enabled and use Chinese for explanation when enabled.");

  if (customInstruction) {
    lines.push("- Student custom instruction: " + customInstruction);
  }

  return lines.join("\\n");
}
`;

const marker = 'function buildPreferenceInstruction(preferences = {}) {';
const chooser = 'function chooseAiModel(';
if (marker in String.prototype) {
  // unreachable guard to keep older linters quiet
}
if (text.includes(marker)) {
  const start = text.indexOf(marker);
  const end = text.indexOf(chooser, start);
  if (end === -1) throw new Error('chooseAiModel marker was not found after buildPreferenceInstruction');
  text = text.slice(0, start) + preferenceHelper.trimStart() + '\n\n' + text.slice(end);
} else {
  if (!text.includes(chooser)) throw new Error('chooseAiModel marker was not found');
  text = text.replace('\nfunction chooseAiModel(', '\n' + preferenceHelper.trimStart() + '\n\nfunction chooseAiModel(');
}

fs.writeFileSync(path, text, 'utf8');
console.log('learning style patch applied');
