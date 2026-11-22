(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("markdown-it"), require("./math"), require("./study-source-links"), (value) => value);
  else root.StudyBridgeMarkdown = factory(root.markdownit, root.StudyBridgeMath, root.StudyBridgeStudySourceLinks, (value) => root.StudyBridgeI18n?.text(value) || value);
})(typeof globalThis !== "undefined" ? globalThis : this, function (MarkdownIt, math, sourceLinks, text) {
  "use strict";

  const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true });
  math.install(markdown);
  markdown.validateLink = (href) => /^(https?:\/\/|mailto:)/i.test(href) || sourceLinks?.accepts(href) === true;
  markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
    const token = tokens[index];
    if (sourceLinks?.accepts(token.attrGet("href"))) token.attrSet("data-study-source", "");
    else { token.attrSet("target", "_blank"); token.attrSet("rel", "noopener noreferrer"); }
    return renderer.renderToken(tokens, index, options);
  };
  markdown.core.ruler.after("text_join", "study_source_disclosures", (state) => {
    const result = [];
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i], inline = state.tokens[i + 1];
      const rows = token.type === "paragraph_open" && inline?.type === "inline" &&
        state.tokens[i + 2]?.type === "paragraph_close" && sourceLinks?.rows(inline.content);
      if (!rows) { result.push(token); continue; }
      const disclosure = new state.Token("study_source_disclosure", "", 0);
      disclosure.meta = rows;
      disclosure.level = token.level;
      result.push(disclosure);
      i += 2;
    }
    state.tokens = result;
  });
  markdown.renderer.rules.study_source_disclosure = (tokens, index) => {
    const escape = markdown.utils.escapeHtml;
    const rows = tokens[index].meta.map(({ href, label }) =>
      `<li><a href="${escape(href)}" data-study-source="">${escape(label)}</a></li>`).join("");
    return `<details class="study-source-disclosure"><summary>${escape(text("来源"))}</summary><ul>${rows}</ul></details>\n`;
  };
  // Keep untrusted output from fetching tracking images or rendering raw HTML.
  markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index].content);
  markdown.renderer.rules.table_open = (tokens, index, options, env, renderer) => {
    tokens[index].attrJoin("class", "markdown-table");
    return '<div class="markdown-table-wrap">' + renderer.renderToken(tokens, index, options);
  };
  markdown.renderer.rules.table_close = () => "</table></div>\n";

  const render = (text) => markdown.render(String(text || ""));
  function renderBlocks(text) {
    const env = {}, tokens = markdown.parse(String(text || ""), env);
    const renderer = markdown.renderer, blocks = [];
    let html = "";
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      html += token.type === "inline" ? renderer.renderInline(token.children, markdown.options, env)
        : renderer.rules[token.type] ? renderer.rules[token.type](tokens, i, markdown.options, env, renderer)
          : renderer.renderToken(tokens, i, markdown.options);
      if (token.level === 0 && token.nesting !== 1 && html) { blocks.push(html); html = ""; }
    }
    if (html) blocks.push(html);
    return blocks;
  }
  const rendered = new WeakMap();
  function renderInto(element, text) {
    const source = String(text || "");
    const previous = rendered.get(element);
    if (previous?.source === source) return;
    // Parse the complete source so late reference definitions, lists, code fences
    // and formulas retain normal Markdown semantics. Keep unchanged DOM blocks
    // mounted so their layout, text selection and table scroll positions survive.
    // Compare HTML before parsing DOM: completed blocks need neither new nodes
    // nor layout. Full-token rendering also updates earlier reference links.
    const htmlBlocks = renderBlocks(source), blocks = [];
    if (!previous) element.replaceChildren();
    for (let i = 0; i < htmlBlocks.length; i++) {
      const html = htmlBlocks[i], old = previous?.blocks[i];
      if (old?.html === html) { blocks.push(old); continue; }
      const template = element.ownerDocument.createElement("template");
      template.innerHTML = html;
      const nodes = Array.from(template.content.childNodes);
      element.insertBefore(template.content, old?.nodes[0] || null);
      old?.nodes.forEach((node) => node.remove());
      blocks.push({ html, nodes });
    }
    previous?.blocks.slice(blocks.length).forEach((block) => block.nodes.forEach((node) => node.remove()));
    rendered.set(element, { source, blocks });
  }

  return { render, renderBlocks, renderInto };
});
