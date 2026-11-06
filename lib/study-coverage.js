// One parser owns both prompt inventories and background-task boundaries.
function partLabels(text = "") {
  const labels = [];
  for (const match of String(text).matchAll(/[（(]\s*([a-z]|[ivx]{2,5}|\d{1,2})\s*[)）]/gi)) {
    const before = text.slice(0, match.index), line = before.slice(before.lastIndexOf("\n") + 1).trim();
    // f(x), g(t), interval notation and parenthetical prose are not headings.
    if (line && !/^(?:(?:Question|Problem|Q)\s*|第\s*)?\d{1,3}\s*(?:[.)、．:：]|题[：:]?)\s*$/i.test(line)
      && !/[.;:!?。；：！？]\s*$/.test(line)) continue;
    labels.push(match[1].toLowerCase());
  }
  return [...new Set(labels)];
}
function exerciseSections(text = "") {
  const source = String(text);
  const markers = [...source.matchAll(/(?:^|\n)[ \t]*(?:(Question|Problem|Q)\s*|第\s*)?(\d{1,3})\s*(?:[.)、．:：]|题[：:]?)[ \t]*(?=[A-Za-z0-9\u3400-\u9fff(（$\\−+])/gi)];
  if (markers.length < 2 && !markers.some((match) => match[1] || /第\s*\d+\s*题/.test(match[0]))) return [];
  // Keep ALL sections, including numbering resets and gaps. Never select only
  // the longest run: that made a partial inventory look like the whole paper.
  const headings = [...source.matchAll(/(?:^|\n)[ \t]*((?:Section|Part)\s+[A-Z0-9IVX]+\b[^\n]*|第[一二三四五六七八九十\d]+部分[^\n]*)/gi)];
  return markers.map((match, i) => {
    const start = match.index, next = markers[i + 1]?.index ?? source.length;
    const heading = headings.filter((heading) => heading.index < start).at(-1);
    const end = headings.find((entry) => entry.index > start && entry.index < next)?.index ?? next;
    const firstInSection = heading && markers.find((entry) => entry.index > heading.index);
    const section = heading?.[1]?.trim() || "", shared = heading && firstInSection ? source.slice(heading.index, firstInSection.index) : "";
    return { number: Number(match[2]), start, end, section, shared, parts: partLabels(source.slice(start, end)) };
  });
}
function questionOutline(text = "") {
  return exerciseSections(text).map(({ number, parts }) => ({ number, parts }));
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

module.exports = { exerciseSections, partLabels, questionOutline, buildExerciseCoverage, coverageInstruction };
