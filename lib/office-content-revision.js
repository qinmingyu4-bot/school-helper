const Model = require("../public/office-model");
const invalid = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const color = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const number = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const text = (value, max) => typeof value === "string" && value.length <= max;
const slideFields = { notes: (v) => text(v, 10000), background: color, transition: (v) => ["none", "fade", "push", "wipe"].includes(v), duration: (v) => number(v, .2, 2) };
const elementFields = { text: (v) => text(v, 10000), font: (v) => Model.fonts.includes(v), size: (v) => number(v, 8, 96), color, bold: (v) => typeof v === "boolean", align: (v) => ["left", "center", "right"].includes(v), x: (v) => number(v, 0, 95), y: (v) => number(v, 0, 95), w: (v) => number(v, 3, 100), h: (v) => number(v, 3, 100) };
const cellStyleFields = { bold: (v) => typeof v === "boolean", color, background: color, size: (v) => number(v, 8, 36), format: (v) => ["general", "number", "currency", "percent"].includes(v) };
const geometryFields = Object.fromEntries(["x", "y", "w", "h"].map((key) => [key, elementFields[key]]));

function fields(value, validators, statusCode) {
  if (!object(value) || Object.keys(value).some((key) => !has(validators, key) || !validators[key](value[key])))
    throw invalid("AI 修改包含不支持的字段或无效的格式，请重新预览。", statusCode);
  return { ...value };
}
function rangeBounds(range, rows, cols) {
  const from = Model.address(range?.from), to = Model.address(range?.to);
  if (!from || !to || from.row > to.row || from.col > to.col || to.row > rows || to.col > cols)
    throw invalid("单元格区域无效，请使用当前工作表内的区域，例如 A1:D10。");
  return { from, to };
}
function inRange(cell, range, rows, cols) {
  const address = Model.address(cell), bounds = rangeBounds(range, rows, cols);
  return address && address.row >= bounds.from.row && address.row <= bounds.to.row && address.col >= bounds.from.col && address.col <= bounds.to.col;
}
function contentRevisionSource(kind, value) {
  if (!object(value) || JSON.stringify(value).length > 60000)
    throw invalid("本次内容过多，请缩小到当前页、工作表或指定区域后再修改。");
  if (kind === "slides") {
    if (!Array.isArray(value.slides) || !value.slides.length || value.slides.length > 100)
      throw invalid("请选择需要修改的幻灯片。");
    const ids = new Set();
    const slides = value.slides.map((slide) => {
      if (!object(slide) || !/^s\d+$/.test(slide.id) || ids.has(slide.id) || typeof slide.editable !== "boolean" || !Array.isArray(slide.elements) || slide.elements.length > 100)
        throw invalid("幻灯片修改范围无效。");
      ids.add(slide.id);
      const elementIds = new Set();
      return { id: slide.id, editable: slide.editable, ...fields(Object.fromEntries(Object.keys(slideFields).map((key) => [key, slide[key]])), slideFields, 400), elements: slide.elements.map((element) => {
        if (!object(element) || !/^e\d+$/.test(element.id) || elementIds.has(element.id) || !["text", "image"].includes(element.type)) throw invalid("幻灯片元素范围无效。");
        elementIds.add(element.id);
        const allowed = element.type === "text" ? elementFields : geometryFields;
        return { id: element.id, type: element.type, ...fields(Object.fromEntries(Object.keys(allowed).map((key) => [key, element[key]])), allowed, 400) };
      }) };
    });
    return { slides };
  }
  if (kind !== "sheets" || !Array.isArray(value.sheets) || !value.sheets.length || value.sheets.length > 10) throw invalid("请选择需要修改的工作表。");
  const ids = new Set();
  const sheets = value.sheets.map((sheet) => {
    if (!object(sheet) || !/^s\d+$/.test(sheet.id) || ids.has(sheet.id) || !text(sheet.name, 31) || !sheet.name || !Number.isInteger(sheet.rows) || !number(sheet.rows, 10, 1000) || !Number.isInteger(sheet.cols) || !number(sheet.cols, 5, 100) || !object(sheet.cells)) throw invalid("工作表修改范围无效。");
    ids.add(sheet.id);
    rangeBounds(sheet.range, sheet.rows, sheet.cols);
    const cells = {};
    for (const [key, cell] of Object.entries(sheet.cells)) {
      if (!inRange(key, sheet.range, sheet.rows, sheet.cols) || !object(cell) || !text(cell.value, 4000)) throw invalid("单元格内容或修改范围无效。");
      cells[key] = { value: cell.value, style: fields(cell.style || {}, cellStyleFields, 400) };
    }
    return { id: sheet.id, name: sheet.name, rows: sheet.rows, cols: sheet.cols, range: { from: sheet.range.from, to: sheet.range.to }, cells };
  });
  return { sheets };
}
function contentRevisionChanges(kind, value, source) {
  let plan;
  try { plan = typeof value === "string" ? JSON.parse(value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) : value; }
  catch { throw invalid("AI 未返回有效的修改，请重试。", 502); }
  if (!object(plan) || !Array.isArray(plan.changes) || plan.changes.length > 500 || JSON.stringify(plan).length > 60000) throw invalid("AI 返回的修改过多或格式无效，请缩小范围后重试。", 502);
  const seen = new Set();
  return plan.changes.map((change) => {
    if (!object(change) || !object(change.set) || !Object.keys(change.set).length) throw invalid("AI 返回了空的修改，请重试。", 502);
    if (kind === "slides") {
      if (Object.keys(change).some((key) => !["slideId", "elementId", "set"].includes(key))) throw invalid("AI 返回了无效的幻灯片修改。", 502);
      const slide = source.slides.find((item) => item.id === change.slideId);
      const element = has(change, "elementId") && slide?.elements.find((item) => item.id === change.elementId);
      if (!slide || (has(change, "elementId") ? !element : !slide.editable)) throw invalid("AI 修改超出了选定的幻灯片范围，请重试。", 502);
      const target = element || slide;
      const allowed = element ? element.type === "text" ? elementFields : geometryFields : slideFields;
      const set = fields(change.set, allowed, 502);
      const final = { ...target, ...set };
      if (element && (final.x + final.w > 100.001 || final.y + final.h > 100.001)) throw invalid("AI 修改会让元素超出幻灯片边界，请重新预览。", 502);
      const key = `${slide.id}:${element?.id || "slide"}`;
      if (seen.has(key)) throw invalid("AI 返回了重复的修改目标，请重试。", 502);
      seen.add(key);
      return { slideId: slide.id, ...(element ? { elementId: element.id } : {}), set: Object.fromEntries(Object.entries(set).filter(([key, next]) => next !== target[key])) };
    }
    if (Object.keys(change).some((key) => !["sheetId", "cell", "set"].includes(key))) throw invalid("AI 返回了无效的表格修改。", 502);
    const sheet = source.sheets.find((item) => item.id === change.sheetId);
    if (!sheet || !inRange(change.cell, sheet.range, sheet.rows, sheet.cols)) throw invalid("AI 修改超出了选定的单元格区域，请重试。", 502);
    const key = `${sheet.id}:${change.cell}`;
    if (seen.has(key)) throw invalid("AI 返回了重复的修改目标，请重试。", 502);
    seen.add(key);
    if (Object.keys(change.set).some((key) => !["value", "style"].includes(key)) || (has(change.set, "value") && !text(change.set.value, 4000))) throw invalid("AI 返回了无效的单元格内容。", 502);
    const current = sheet.cells[change.cell] || { value: "", style: {} }, set = {};
    if (has(change.set, "value")) {
      const formula = change.set.value.startsWith("=") ? change.set.value.replace(/"(?:[^"]|"")*"/g, '""') : "";
      if (/\b(?:WEBSERVICE|HYPERLINK|IMPORTXML|IMPORTDATA|IMAGE|DDE|RTD)\s*\(|\[[^\]]*\]|\|/i.test(formula)) throw invalid("AI 公式包含不支持的外部连接，请重试。", 502);
      if (current.value !== change.set.value) set.value = change.set.value;
    }
    if (has(change.set, "style")) {
      const style = fields(change.set.style, cellStyleFields, 502);
      const delta = Object.fromEntries(Object.entries(style).filter(([key, next]) => next !== current.style[key]));
      if (Object.keys(delta).length) set.style = delta;
    }
    return { sheetId: sheet.id, cell: change.cell, set };
  }).filter((change) => Object.keys(change.set).length);
}
function applyContentRevision(kind, model, source, changes) {
  const next = JSON.parse(JSON.stringify(model));
  for (const change of contentRevisionChanges(kind, { changes }, source)) {
    if (kind === "slides") {
      const slide = next.slides[Number(change.slideId.slice(1))];
      const target = has(change, "elementId") ? slide?.elements[Number(change.elementId.slice(1))] : slide;
      if (!target) throw invalid("作品已更改，请重新预览。");
      Object.assign(target, change.set);
    } else {
      const sheet = next.sheets[Number(change.sheetId.slice(1))];
      if (!sheet) throw invalid("工作表已更改，请重新预览。");
      const cell = sheet.cells[change.cell] || { value: "", style: {} };
      sheet.cells[change.cell] = { ...cell, ...change.set, style: { ...cell.style, ...change.set.style } };
    }
  }
  Model.normalize(kind, next);
  return next;
}

const revisionGuidance = {
  slides: 'Edit the EXISTING presentation in place. Return only JSON: {"changes":[{"slideId":"s0","elementId":"e0","set":{"text":"Revised wording"}},{"slideId":"s0","set":{"notes":"Revised speaker notes"}}]}. Use only supplied slide/element ids. A slide with editable=false permits element edits only. Do not add, delete or reorder slides/elements. Change only requested fields. Slide fields: notes, background (#RRGGBB), transition (none/fade/push/wipe), duration (0.2-2 seconds). Text fields: text, font (Times New Roman/Arial/Calibri/Georgia/Noto Sans SC/SimSun), size (8-96 pt), color (#RRGGBB), bold (boolean), align (left/center/right), x/y (0-95), w/h (3-100); positions/sizes are percentages and x+w/y+h must not exceed 100. Images permit geometry changes only, never replace image bytes. Keep text concise enough to fit its existing box; preserve original language unless asked to translate, meaning, facts and citations. Do not invent data or citations. Return changes:[] if nothing needs changing. One change per target; omit untouched fields.',
  sheets: 'Edit the EXISTING workbook in place. Return only JSON: {"changes":[{"sheetId":"s0","cell":"C2","set":{"value":"=SUM(A2:B2)","style":{"format":"number","bold":true}}}]}. Use only supplied sheet ids and cell addresses inside each sheet range (including empty cells inside it). Do not add/delete/rename sheets, rows or columns. Values must be strings (numbers as strings), formulas start with = and remain formulas. Use only supplied data; do not invent measurements, results or external sources. Retain existing formulas unless the request changes them. Standard Excel functions and cross-sheet references are supported; no network, external workbook or executable formulas. Optional style fields only: bold (boolean), color/background (#RRGGBB), size (8-36), format (general/number/currency/percent). Preserve all fields not requested. Return changes:[] if no changes are needed. At most 500 cells, one change per cell. Empty value clears a cell without deleting its formatting.'
};
module.exports = { contentRevisionSource, contentRevisionChanges, applyContentRevision, rangeBounds, inRange, revisionGuidance };
