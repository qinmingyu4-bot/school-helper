const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const markdown = require("../public/markdown");
const learningStyle = require("../public/learning-style");
const annotations = (html) => [...html.matchAll(/<annotation encoding="application\/x-tex">([^<]*)<\/annotation>/g)].map((match) => match[1]);

test("inline and display formulas typeset roots, fractions, powers, integrals and limits", () => {
  const html = markdown.render(String.raw`Let \(f(x)=\sqrt[3]{x-1}\).

\[
P=2+\int_1^2\sqrt{1+\frac{1}{9(x-1)^{4/3}}}\,dx
\]

Limit: $\lim_{b\to\infty}\int_2^b e^{-2x+4}\,dx=\frac12$.

$$\frac{x^2}{\sqrt{x+1}}$$`);
  assert.equal(annotations(html).length, 4);
  for (const tag of ["msqrt", "mroot", "mfrac", "msup", "msubsup"]) assert.ok(html.includes(`<${tag}`), tag);
  assert.equal((html.match(/class="math-block"/g) || []).length, 2);
  assert.ok(!html.includes("math-fallback"));
  const table = markdown.render(String.raw`| Formula | Value |
| --- | --- |
| \(\sqrt{9}\) | 3 |`);
  assert.ok(table.includes("<msqrt>"));
});

test("old sqrt calls retain nested fractions and fractional-power grouping without changing stored text", () => {
  const source = "P = 2 + ∫₁² sqrt(1 + 1/[9(x − 1)^(4/3)]) dx. **SQRT(9)** and cbrt(x-1); sqrt(1+sqrt(x/2)); sqrt(1e-3).";
  assert.deepEqual(annotations(markdown.render(source)), [
    String.raw`\sqrt{1+\frac{1}{9 \left(x-1\right)^{\frac{4}{3}}}}`,
    String.raw`\sqrt{9}`, String.raw`\sqrt[3]{x-1}`, String.raw`\sqrt{1+\sqrt{\frac{x}{2}}}`, String.raw`\sqrt{1\times 10^{-3}}`
  ]);
  assert.ok(markdown.render(source).includes("<mfrac>"));
  assert.ok(source.includes("sqrt(1 + 1/[9(x − 1)^(4/3)])"));
  for (const unsupported of ["sqrt(some text)", "sqrt(x+)", "sqrt(x", "sqrt(sin(x))"]) {
    assert.deepEqual(annotations(markdown.render(unsupported)), []);
  }
});

test("math leaves prices, escaped dollars, code and source URLs unchanged", () => {
  const source = 'Costs $5 and $10; USD$20. \\$x$ is literal.\n\n`sqrt(x/2)` and `\\(x^2\\)`\n\n```js\nconst y = sqrt(x); // $x$\n```\n\nhttps://example.test/sqrt(9)\n\n[source sqrt(9)](https://example.test/sqrt(9))';
  const html = markdown.render(source);
  assert.deepEqual(annotations(html), []);
  assert.ok(html.includes("Costs $5 and $10"));
  assert.ok(html.includes("<code>sqrt(x/2)</code>"));
  assert.ok(html.includes('href="https://example.test/sqrt(9)"'));
  assert.ok(html.includes("const y = sqrt(x)"));
});

test("untrusted math cannot create links, images, HTML attributes or persistent macros", () => {
  const html = markdown.render(String.raw`\(\href{https://tracking.example.test}{click}\)

\[\includegraphics{https://tracking.example.test/pixel.png}\]

\(\htmlStyle{background:url(https://tracking.example.test)}{x}\)

\(\badcommand{<img src=x onerror=alert(1)>}\)

\(\def\loop{\loop}\loop\)`);
  assert.ok(!/<(?:a|img|script|iframe)\b/i.test(html));
  assert.ok(!/\s(?:href|src|onerror)\s*=/i.test(html.replace(/<annotation[\s\S]*?<\/annotation>/g, "").replace(/<span class="math-fallback">[\s\S]*?<\/span>/g, "")));
  assert.ok(!annotations(markdown.render(String.raw`\(\loop\)`)).length);
});

test("every partial streamed formula stays inert and complete input recovers real math", () => {
  const source = String.raw`### 解答

\[P=2+\int_1^2\sqrt{1+\frac{1}{9(x-1)^{4/3}}}\,dx\]

\(\sqrt{x}\) and sqrt(1+sqrt(x/2)).`;
  for (let i = 1; i <= source.length; i++) {
    const html = markdown.render(source.slice(0, i));
    assert.ok(!/<(?:script|img|iframe)\b/i.test(html));
    assert.ok(!html.includes("undefined"));
  }
  assert.equal(annotations(markdown.render(source)).length, 3);
  assert.ok(!markdown.render(String.raw`\(${'x'.repeat(9000)}\)`).includes('class="katex"'));
});

test("all Learning Style settings use the same math contract and the browser loads local math assets", () => {
  for (const englishAnswers of [false, true]) for (const chineseExplanations of [false, true]) {
    const text = learningStyle.buildInstruction({ englishAnswers, chineseExplanations });
    assert.ok(text.includes(String.raw`\sqrt{x}`));
    assert.ok(text.includes("StudyBridge renders mathematical notation"));
    assert.ok(!text.includes("Use readable plain-text math"));
  }
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  const version = require("katex/package.json").version;
  const dir = path.join(__dirname, `../public/vendor/katex-${version}`);
  assert.deepEqual(fs.readFileSync(path.join(dir, "katex.min.js")), fs.readFileSync(require.resolve("katex/dist/katex.min.js")));
  const css = fs.readFileSync(path.join(dir, "katex.min.css"), "utf8");
  for (const match of css.matchAll(/url\(([^)]+)\)/g)) assert.ok(fs.existsSync(path.join(dir, match[1])));
  assert.ok(html.indexOf("/math.js?") < html.indexOf("/markdown.js?"));
  assert.ok(html.includes(`/vendor/katex-${version}/katex.min.css`));
});
