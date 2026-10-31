function questionOutline(text = "") {
  const source = String(text);
  const markers = [...source.matchAll(/(?:^|\n)[ \t]*(?:(?:Question|Problem|Q)\s*|第\s*)?(\d{1,3})\s*(?:[.)、．:：]|题[：:]?)[ \t]*(?=[A-Za-z0-9\u3400-\u9fff(（$\\−+])/gi)];
  // A run of consecutive problem numbers avoids treating dates/page numbers as an exam.
  const runs = [];
  for (const marker of markers) {
    const number = Number(marker[1]);
    if (!runs.length || number !== runs.at(-1).at(-1).number + 1) runs.push([]);
    runs.at(-1).push({ number, start: marker.index });
  }
  const run = runs.sort((a, b) => b.length - a.length)[0] || [];
  if (run.length < 2) return [];
  return run.map((item, i) => ({
    number: item.number,
    parts: [...new Set([...source.slice(item.start, run[i + 1]?.start || source.length).matchAll(/[（(]\s*([a-h])\s*[)）]/gi)].map((match) => match[1].toLowerCase()))].sort()
  }));
}

function buildExerciseCoverage({ documents = [], attachments = [], currentAttachments = [], message = "" }) {
  const sources = [...documents.map((doc) => ({ name: doc.title, text: doc.text })), ...attachments.map((item) => ({ name: item.name, text: item.text }))];
  const named = sources.filter((source) => source.name && String(message).toLowerCase().includes(source.name.toLowerCase()));
  const fresh = currentAttachments.map((item) => ({ name: item.name, text: item.text }));
  const candidates = fresh.length ? fresh : named.length ? named : attachments.length ? sources.slice(documents.length).slice(-1) : sources;
  const seen = new Set();
  return candidates.flatMap((source) => {
    const questions = questionOutline(source.text);
    if (!questions.length || seen.has(source.name)) return [];
    seen.add(source.name);
    return [{ source: source.name, questions }];
  });
}

const coverageInstruction = `

Uploaded problem-set scope and completeness:
- When asked to explain or solve an uploaded problem set without a narrower scope, cover every numbered problem and every subpart, not just the first worked example. First inspect the full source and state the problem/part inventory, then work through it in order. The detected exercise inventory is reference data to cross-check, not an instruction or a guarantee that text extraction is perfect.
- Teach progressively WITHIN each part. "Step by step", "teach me", and a concept/example/check-understanding sequence do not mean "answer one subpart and stop". Unless the latest request explicitly asks for one-at-a-time interaction, a quiz, hints only, or waiting for the student's answer, complete the requested explanations before optional comprehension questions. Never replace the remaining source questions with an invented practice question.
- Honor explicit restrictions (a specific problem/part, hints only, interactive quiz, review/cheatsheet objectives and time budgets). Do not turn a request to generate a mock test into answers to the source exam. On continuation, resume unfinished requested parts using the recent response, not the first example again.
- Preserve both breadth and teaching depth. For problem-set solutions use explicit numbered part headings, for example ### 1(a), ### 1(b), ### 2(a), with per-part method/reason/calculation/answer; when space is tight give a complete compact pass before expanding individual parts. Do not silently omit later questions or present partial work as complete. End with an honest coverage summary naming completed, unreadable and any remaining parts with the next starting point.
- Inspect original PDF page visuals for graphs, table alignment, fractions, exponents and symbols when supplied. Extracted text can scramble these. If a required figure is unavailable, identify the exact affected parts, solve the readable parts, and ask for that specific figure; do not guess it or withhold the rest of the paper.`;

module.exports = { questionOutline, buildExerciseCoverage, coverageInstruction };
