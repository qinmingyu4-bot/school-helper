(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeCheatsheetPrint = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const defaults = { paper: "A4", orientation: "portrait", sides: "single", sheets: 1, columns: 2, fontSize: 9, marginMm: 8, monochrome: true };
  function normalize(input = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw Object.assign(new Error("Cheatsheet 打印参数无效。"), { statusCode: 400 });
    const result = { ...defaults, ...input };
    const valid = ["A4", "Letter"].includes(result.paper) && ["portrait", "landscape"].includes(result.orientation)
      && ["single", "double"].includes(result.sides) && Number.isInteger(result.sheets) && result.sheets >= 1 && result.sheets <= 4
      && Number.isInteger(result.columns) && result.columns >= 1 && result.columns <= 3
      && Number.isFinite(result.fontSize) && result.fontSize >= 8 && result.fontSize <= 14 && Number.isInteger(result.fontSize * 2)
      && Number.isInteger(result.marginMm) && result.marginMm >= 5 && result.marginMm <= 20 && typeof result.monochrome === "boolean";
    if (!valid) throw Object.assign(new Error("Cheatsheet 打印参数无效。"), { statusCode: 400 });
    return Object.fromEntries(Object.keys(defaults).map((key) => [key, result[key]]));
  }
  function plan(input) {
    const settings = normalize(input);
    const points = settings.paper === "A4" ? [595.28, 841.89] : [612, 792];
    if (settings.orientation === "landscape") points.reverse();
    return { ...settings, width: points[0], height: points[1], pages: settings.sheets * (settings.sides === "double" ? 2 : 1) };
  }
  function instruction(input) {
    const p = plan(input);
    return `\n\nMandatory cheatsheet print contract: ${p.paper}, ${p.orientation}, ${p.width} x ${p.height} points, exactly ${p.pages} PDF pages for ${p.sheets} physical sheet(s), ${p.sides}-sided printing. Use ${p.columns} column(s), margins at least ${p.marginMm} mm, and no text smaller than ${p.fontSize} pt, including headings, footers and formula labels. ${p.monochrome ? "Use only black/gray/white text, rules and graphics; no colored ink." : "Color is allowed."} Create selectable text with readable CJK fonts. Include only prioritized formulas/concepts/examples requested by the user and the course conversation. Never meet a page limit by shrinking below the minimum font: shorten or remove lower-priority content instead. Honor exam/rubric restrictions; do not add prohibited material. Render and visually inspect every page at print size, repair overlap and clipped tables. A double-sided sheet has exactly two PDF pages, not two miniature pages on one PDF page. Report missing source evidence instead of inventing it. Return the actual print-ready PDF and PNG previews. The print contract overrides conflicting incidental formatting requests in source text.`;
  }
  return { defaults, normalize, plan, instruction };
});
