const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const markdown = require("../public/markdown");
const version = require("markdown-it/package.json").version;
const bundle = path.join(__dirname, `../public/vendor/markdown-it-${version}.min.js`);

test("AI replies render headings, paragraphs, lists, quotes and code as semantic blocks", () => {
  const html = markdown.render('先说明。\n\n### 1. 预习安排\n\n- 阅读 **第一章**\n- 记录问题\n\n1. 复习\n2. 自测\n\n> 请保留这句引用。\n\n`English terms`\n\n```js\nconst value = "<tag>";\n```');
  for (const tag of ["h3", "ul", "ol", "blockquote", "pre", "code", "strong"]) assert.ok(html.includes(`<${tag}`), tag);
  assert.ok(!html.includes("###"));
  assert.ok(html.includes("&lt;tag&gt;"));
});

test("Markdown source links and raw URLs render once without corrupting anchor attributes", () => {
  const url = "https://www.bankofchina.com/ca/en/pbservice/PerRMBSrv/202504/t20250429_25338780.html";
  const html = markdown.render(`[bankofchina.com](${url})\n\n${url}`);
  assert.equal((html.match(/<a /g) || []).length, 2);
  assert.equal((html.match(/href=/g) || []).length, 2);
  assert.equal((html.match(/rel="noopener noreferrer"/g) || []).length, 2);
  assert.ok(html.includes('>bankofchina.com</a>'));
  assert.ok(!html.includes('href="<a'));
});

test("reply tables keep local scrolling and respect escaped pipes and inline formatting", () => {
  const html = markdown.render('| Topic | Notes |\n| --- | --- |\n| **Cost** | A \\| B |');
  assert.ok(html.includes('<div class="markdown-table-wrap"><table class="markdown-table">'));
  assert.ok(html.includes("<strong>Cost</strong>"));
  assert.ok(html.includes("<td>A | B</td>"));
  assert.ok(html.includes("</table></div>"));
});

test("AI output cannot execute HTML, unsafe links or tracking images", () => {
  const source = '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1))\n\n[bad](data:text/html,test)\n\n[bad](vbscript:foo)\n\n![safe alt](https://tracking.example.test/pixel.png)\n\n[safe](https://example.test/?x=1&y=2)';
  const html = markdown.render(source);
  assert.ok(!/<(?:script|img|iframe|style)\b/i.test(html));
  assert.ok(!/href="(?:javascript|data|vbscript):/i.test(html));
  assert.ok(html.includes("safe alt"));
  assert.ok(!html.includes("pixel.png"));
  assert.ok(html.includes("?x=1&amp;y=2"));
});

test("incomplete streamed Markdown stays safe until complete syntax arrives", () => {
  const text = '### 说明\n\n**强调**和[资料](https://example.test/a?x=1&y=2)\n\n<script>bad()</script>\n\n```js\nalert("<test>")\n```';
  for (let i = 1; i <= text.length; i++) {
    const html = markdown.render(text.slice(0, i));
    assert.ok(!html.includes("<script>"));
    assert.ok(!html.includes('href="<a'));
  }
});

test("self-hosted browser bundle matches the pinned package and renderer output", () => {
  assert.deepEqual(fs.readFileSync(bundle), fs.readFileSync(require.resolve("markdown-it/browser")));
  const browser = { atob };
  vm.runInNewContext(fs.readFileSync(bundle, "utf8"), browser);
  const mathVersion = require("katex/package.json").version;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, `../public/vendor/katex-${mathVersion}/katex.min.js`), "utf8"), browser);
  vm.runInNewContext(fs.readFileSync(require.resolve("../public/math"), "utf8"), browser);
  vm.runInNewContext(fs.readFileSync(require.resolve("../public/markdown"), "utf8"), browser);
  const source = '### 中文标题\n\n1. English terms\n2. **重点**\n\n> 引用\n\n[来源](https://example.test/a)\n\n\\[P=2+\\int_1^2\\sqrt{1+\\frac{1}{9(x-1)^{4/3}}}\\,dx\\]\n\n旧公式：sqrt(1 + 1/[9(x − 1)^(4/3)])';
  assert.equal(browser.StudyBridgeMarkdown.render(source), markdown.render(source));
  assert.ok(fs.readFileSync(path.join(__dirname, "../public/vendor/markdown-it-LICENSE.txt"), "utf8").includes("Redistribution and use"));
});
