(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeStudyFormulas = factory();
})(globalThis, function () {
  "use strict";
  const operators = { "−": "-", "–": "-", "×": "*", "·": "*", "⋅": "*", "÷": "/" };
  const symbols = { times: "*", cdot: "*", div: "/", le: "≤", leq: "≤", ge: "≥", geq: "≥", approx: "≈",
    pm: "±", sum: "∑", int: "∫", pi: "π", alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ",
    theta: "θ", mu: "μ", sigma: "σ", lambda: "λ", infinity: "∞", infty: "∞" };

  function indexText(text) {
    let key = "", offset = 0;
    const starts = [], ends = [];
    for (const character of text) {
      for (const normalized of character.normalize("NFKC")) {
        if (/[\s{}_^]/u.test(normalized)) continue;
        const value = operators[normalized] || normalized;
        key += value;
        for (let i = 0; i < value.length; i++) { starts.push(offset); ends.push(offset + character.length); }
      }
      offset += character.length;
    }
    return { key, starts, ends };
  }

  function expression(value) {
    const latex = value.replace(/\\(?:left|right)\b|\\[,!;: ]/g, "")
      .replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "$1/$2")
      .replace(/\\([a-zA-Z]+)(?![a-zA-Z])/g, (match, name) =>
        Object.hasOwn(symbols, name) ? symbols[name] : /^(sin|cos|tan|log|ln|exp|max|min)$/.test(name) ? name : match);
    if (latex.includes("\\") || !/[=≈≤≥<>+*/∑∫]/u.test(latex) || /[\u3400-\u9fff]/u.test(latex)) return "";
    const key = indexText(latex).key;
    return key.length >= 3 && key.length <= 140 ? key : "";
  }

  function candidates(text) {
    const keys = new Set();
    text = String(text || "");
    for (const match of text.matchAll(/\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g)) {
      const key = expression(match[1] ?? match[2] ?? match[3] ?? match[4]);
      if (key) keys.add(key);
      if (keys.size === 8) break;
    }
    for (const line of text.split("\n")) {
      if (keys.size === 8) break;
      const bare = line.trim().replace(/^`|`$/g, "");
      if (/^[A-Za-zα-ωΑ-Ω][\wα-ωΑ-Ω]*\s*(?:\([^)]{1,20}\))?\s*=\s*[\wα-ωΑ-Ω₀-₉²³.()\s+*/^−-]+$/u.test(bare) &&
          !/[A-Za-z]{4,}\s+[A-Za-z]{4,}/.test(bare)) {
        const key = expression(bare);
        if (key) keys.add(key);
      }
    }
    return [...keys];
  }

  function locate(lines, keys) {
    if (!keys.length) return null;
    const indexed = lines.map(indexText);
    for (const formula of keys) {
      if (!formula) continue;
      let match;
      let ambiguous = false;
      for (const [line, { key, starts, ends }] of indexed.entries()) {
        for (let offset = key.indexOf(formula); offset >= 0; offset = key.indexOf(formula, offset + 1)) {
          const start = starts[offset], end = ends[offset + formula.length - 1];
          const before = lines[line].slice(0, start), after = lines[line].slice(end);
          if (/[A-Za-z0-9α-ωΑ-Ω]$/u.test(before) || /^[A-Za-z0-9α-ωΑ-Ω]/u.test(after) ||
              /^\s*[+*/=^_−×÷-]/u.test(after)) continue;
          if (match) { ambiguous = true; break; }
          match = { formula, line, start, end };
        }
        if (ambiguous) break;
      }
      if (!ambiguous && match) return match;
    }
    return null;
  }

  return { candidates, locate };
});
