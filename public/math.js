(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("katex"));
  else root.StudyBridgeMath = factory(root.katex);
})(typeof globalThis !== "undefined" ? globalThis : this, function (katex) {
  "use strict";

  function install(markdown) {
    const escape = markdown.utils.escapeHtml;
    function render(tex, display) {
      if (tex.length > 8000) return escape(tex);
      try {
        return `<span class="math-${display ? "display" : "inline"}">${katex.renderToString(tex, {
          displayMode: display, throwOnError: true, trust: false, strict: "ignore",
          maxExpand: 500, maxSize: 20, output: "htmlAndMathml", macros: {}
        })}</span>`;
      } catch {
        // Incomplete streamed formulas and unsupported commands remain readable and inert.
        return `<span class="math-fallback">${escape(tex)}</span>`;
      }
    }
    markdown.renderer.rules.math_inline = (tokens, index) => render(tokens[index].content, tokens[index].meta?.display);
    markdown.renderer.rules.math_block = (tokens, index) => `<div class="math-block">${render(tokens[index].content, true)}</div>\n`;

    markdown.inline.ruler.before("escape", "study_math", (state, silent) => {
      const start = state.pos, source = state.src;
      const open = source.startsWith("\\(", start) ? "\\(" : source.startsWith("\\[", start) ? "\\[" : source.startsWith("$$", start) ? "$$" : source[start] === "$" ? "$" : "";
      if (!open) return false;
      const close = open === "\\(" ? "\\)" : open === "\\[" ? "\\]" : open;
      const begin = start + open.length;
      if (open === "$" && (/\s/.test(source[begin] || " ") || /[\w$]/.test(source[start - 1] || ""))) return false;
      let end = source.indexOf(close, begin);
      while (end >= 0 && source[end - 1] === "\\") end = source.indexOf(close, end + close.length);
      if (end < 0 || end >= state.posMax || end - begin > 8000) return false;
      const content = source.slice(begin, end);
      // Avoid interpreting prices such as "$5 and $10" as a formula.
      if (open === "$" && (!content.trim() || /\s$/.test(content) || /\d/.test(source[end + 1] || "") || content.includes("\n"))) return false;
      if (!silent) {
        const token = state.push("math_inline", "", 0);
        token.content = content;
        token.meta = { display: open === "\\[" || open === "$$" };
      }
      state.pos = end + close.length;
      return true;
    });

    markdown.block.ruler.before("fence", "study_math", (state, startLine, endLine, silent) => {
      if (state.sCount[startLine] - state.blkIndent >= 4) return false;
      const first = state.bMarks[startLine] + state.tShift[startLine];
      const line = state.src.slice(first, state.eMarks[startLine]).trimEnd();
      const open = line.startsWith("\\[") ? "\\[" : line.startsWith("$$") ? "$$" : "";
      if (!open) return false;
      const close = open === "\\[" ? "\\]" : "$$";
      let last = startLine, end = line.indexOf(close, open.length);
      if (end >= 0 && line.slice(end + close.length).trim()) return false;
      while (end < 0 && ++last < endLine) {
        const next = state.src.slice(state.bMarks[last] + state.tShift[last], state.eMarks[last]);
        const candidate = next.indexOf(close);
        if (candidate >= 0) {
          if (next.slice(candidate + close.length).trim()) return false;
          end = state.bMarks[last] + state.tShift[last] + candidate - first;
        }
        if (state.eMarks[last] - first > 8000) return false;
      }
      if (end < 0 || last >= endLine) return false;
      if (silent) return true;
      const token = state.push("math_block", "", 0);
      token.block = true;
      token.content = state.src.slice(first + open.length, first + end).trim();
      token.map = [startLine, last + 1];
      state.line = last + 1;
      return true;
    }, { alt: ["paragraph", "reference", "blockquote", "list"] });

    // Migrate only balanced arithmetic root calls in text tokens. Never rewrite code,
    // URLs, raw source, or already-delimited formulas stored in conversation history.
    markdown.core.ruler.after("linkify", "legacy_roots", (state) => {
      for (const block of state.tokens) {
        if (!block.children) continue;
        let linkDepth = 0;
        block.children = block.children.flatMap((token) => {
          if (token.type === "link_open") linkDepth++;
          if (token.type === "link_close") linkDepth--;
          if (token.type !== "text" || linkDepth) return [token];
          const result = [], pattern = /\b(?:sqrt|cbrt)\s*\(/gi;
          let previous = 0, match;
          while ((match = pattern.exec(token.content))) {
            let depth = 1, end = pattern.lastIndex;
            while (end < token.content.length && end - match.index <= 2048 && depth) {
              const ch = token.content[end++];
              if (ch === "(") depth++;
              if (ch === ")") depth--;
            }
            if (depth) continue;
            const tex = legacyExpression(token.content.slice(match.index, end));
            if (!tex) continue;
            const prefix = new state.Token("text", "", 0);
            prefix.content = token.content.slice(previous, match.index);
            const math = new state.Token("math_inline", "", 0);
            math.content = tex;
            result.push(prefix, math);
            previous = end;
            pattern.lastIndex = end;
          }
          if (!result.length) return [token];
          const suffix = new state.Token("text", "", 0);
          suffix.content = token.content.slice(previous);
          return [...result, suffix];
        });
      }
    });
  }

  function legacyExpression(input) {
    // A small, bounded arithmetic parser, rather than regex substitution, keeps
    // nested radicals, fractions and grouped fractional powers mathematically intact.
    const source = input.replace(/−/g, "-").replace(/×/g, "*").replace(/÷/g, "/");
    const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z]+|π|[()+\-*/^_\[\]{}]|\s+|./g).filter((token) => !/^\s+$/.test(token));
    if (tokens.length > 512) return null;
    let pos = 0, depth = 0;
    const bare = (node) => node.inner || node.tex;
    function atom() {
      if (++depth > 32) throw new Error("depth");
      let token = tokens[pos++], result;
      if (["(", "[", "{"].includes(token)) {
        const inner = expression();
        if (tokens[pos++] !== { "(": ")", "[": "]", "{": "}" }[token]) throw new Error("group");
        result = { tex: `\\left(${inner.tex}\\right)`, inner: inner.tex };
      } else if (/^(sqrt|cbrt)$/i.test(token || "")) {
        if (tokens[pos] !== "(") throw new Error("root");
        const value = atom();
        result = { tex: `\\sqrt${token.toLowerCase() === "cbrt" ? "[3]" : ""}{${bare(value)}}` };
      } else if (/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token || "") || /^[A-Za-z]$/.test(token || "")) result = { tex: token.replace(/[eE]([+-]?\d+)$/, "\\times 10^{$1}") };
      else if (token === "π" || token === "pi") result = { tex: "\\pi" };
      else throw new Error("unsupported");
      depth--;
      return result;
    }
    function power() {
      let value = atom();
      if (tokens[pos] === "^" || tokens[pos] === "_") {
        const operation = tokens[pos++], exponent = unary();
        value = { tex: `${value.tex}${operation}{${bare(exponent)}}` };
      }
      return value;
    }
    function unary() {
      if (tokens[pos] === "+" || tokens[pos] === "-") {
        const sign = tokens[pos++];
        if (++depth > 32) throw new Error("depth");
        const value = unary(); depth--;
        return { tex: `${sign}${value.tex}` };
      }
      return power();
    }
    function product() {
      let value = unary();
      while (pos < tokens.length) {
        const operation = tokens[pos], implicit = /^(?:\d|[A-Za-zπ(\[{])/.test(operation);
        if (!["*", "/"].includes(operation) && !implicit) break;
        if (!implicit) pos++;
        const right = unary();
        value = { tex: operation === "/" ? `\\frac{${bare(value)}}{${bare(right)}}` : `${value.tex}${implicit ? " " : "\\cdot "}${right.tex}` };
      }
      return value;
    }
    function expression() {
      let value = product();
      while (tokens[pos] === "+" || tokens[pos] === "-") {
        const sign = tokens[pos++], right = product();
        value = { tex: `${value.tex}${sign}${right.tex}` };
      }
      return value;
    }
    try { const result = expression(); return pos === tokens.length ? result.tex : null; } catch { return null; }
  }

  return { install };
});
