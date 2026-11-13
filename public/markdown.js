(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("markdown-it"), require("./math"));
  else root.StudyBridgeMarkdown = factory(root.markdownit, root.StudyBridgeMath);
})(typeof globalThis !== "undefined" ? globalThis : this, function (MarkdownIt, math) {
  "use strict";

  const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true });
  math.install(markdown);
  markdown.validateLink = (href) => /^(https?:\/\/|mailto:)/i.test(href);
  markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
    tokens[index].attrSet("target", "_blank");
    tokens[index].attrSet("rel", "noopener noreferrer");
    return renderer.renderToken(tokens, index, options);
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
