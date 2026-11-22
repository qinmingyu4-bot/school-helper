(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeStudySourceLinks = factory();
})(globalThis, function () {
  "use strict";
  const route = String.raw`/api/courses/[\w-]+/study-source/task_[a-f0-9]{40}\?[a-zA-Z0-9%._&=+-]+`;
  const href = new RegExp(`^${route}$`);
  const citation = new RegExp(String.raw`（来源：\[((?:\\[^\n]|[^\]\\\n])+)\]\((${route})\)）`, "g");

  function rows(paragraph) {
    const result = [];
    let end = 0;
    for (const match of paragraph.matchAll(citation)) {
      if (paragraph.slice(end, match.index).trim()) return null;
      result.push({ label: match[1].replace(/\\([^\n])/g, "$1"), href: match[2] });
      end = match.index + match[0].length;
    }
    return result.length && !paragraph.slice(end).trim() ? result : null;
  }

  return {
    accepts: (url) => href.test(url),
    rows,
    plain: (value) => value.replace(citation, "（来源：$1）")
  };
});
