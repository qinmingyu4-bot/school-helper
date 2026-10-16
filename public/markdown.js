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

  return { render: (text) => markdown.render(String(text || "")) };
});
