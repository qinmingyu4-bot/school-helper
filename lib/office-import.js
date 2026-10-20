const path = require("node:path");
const AdmZip = require("adm-zip");
const { DOMParser } = require("@xmldom/xmldom");
const M = require("../public/office-model");
const fail = (message) => {
  throw Object.assign(new Error(message), { statusCode: 400 });
};
const children = (node) =>
  Array.from(node?.childNodes || []).filter((n) => n.nodeType === 1);
const all = (node, tag) => Array.from(node?.getElementsByTagName(tag) || []);
const first = (node, tag) => all(node, tag)[0];
const attr = (node, key, fallback = "") => node?.getAttribute(key) || fallback;
function xml(zip, file) {
  const entry = zip.getEntry(file);
  if (!entry) return null;
  if (entry.header.size > 8 * 1024 * 1024)
    fail("文件内容过大，请拆分文件后导入。");
  const text = zip.readAsText(entry);
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    fail("不支持包含 DTD 或自定义实体的文件。");
  try {
    return new DOMParser({
      onError: (level) => {
        if (level !== "warning") fail("文件 XML 结构无效。");
      },
    }).parseFromString(text, "application/xml");
  } catch {
    fail("文件 XML 结构无效。");
  }
}
function relations(zip, file) {
  const directory = path.posix.dirname(file),
    name = path.posix.basename(file);
  const doc = xml(zip, `${directory}/_rels/${name}.rels`),
    map = new Map();
  for (const item of all(doc, "Relationship")) {
    if (attr(item, "TargetMode") === "External") continue;
    const target = path.posix.normalize(
      path.posix.join(directory, attr(item, "Target")),
    );
    if (target.startsWith("../") || target.startsWith("/")) continue;
    map.set(attr(item, "Id"), target);
  }
  return map;
}
function picture(zip, file, warnings) {
  const entry = file && zip.getEntry(file);
  if (!entry || !/\.(png|jpe?g)$/i.test(file) || entry.header.size > 1000000) {
    warnings.add("部分图片格式或大小暂不支持，未导入这些图片。");
    return null;
  }
  const data = zip.readFile(entry);
  return `data:image/${/\.png$/i.test(file) ? "png" : "jpeg"};base64,${data.toString("base64")}`;
}
function word(zip, warnings) {
  const doc = xml(zip, "word/document.xml");
  if (!doc) fail("不是有效的 Word 文档。");
  const model = M.fresh("docs"),
    body = first(doc, "w:body"),
    content = [],
    rels = relations(zip, "word/document.xml");
  const section = first(body, "w:sectPr"),
    page = first(section, "w:pgSz"),
    margins = first(section, "w:pgMar");
  if (Math.abs(Number(attr(page, "w:w")) - 12240) < 30)
    model.settings.paper = "Letter";
  if (attr(margins, "w:left"))
    model.settings.margin = (Number(attr(margins, "w:left")) / 1440) * 25.4;
  for (const paragraph of children(body)) {
    if (paragraph.tagName === "w:tbl") {
      warnings.add(
        "Word 表格、页眉页脚、批注和复杂对象暂不转换，请核对原文件。",
      );
      continue;
    }
    if (paragraph.tagName !== "w:p") continue;
    const pr = first(paragraph, "w:pPr"),
      style = attr(first(pr, "w:pStyle"), "w:val"),
      heading = /heading([1-3])/i.exec(style);
    const alignment = attr(first(pr, "w:jc"), "w:val", "left"),
      spacing = first(pr, "w:spacing");
    const node = {
      type: heading ? "heading" : "paragraph",
      attrs: {
        ...(heading ? { level: Number(heading[1]) } : {}),
        textAlign: alignment === "both" ? "justify" : alignment,
        ...(attr(spacing, "w:line")
          ? { lineHeight: String(Number(attr(spacing, "w:line")) / 240) }
          : {}),
      },
      content: [],
    };
    for (const run of all(paragraph, "w:r")) {
      const props = first(run, "w:rPr"),
        marks = [];
      for (const [tag, type] of [
        ["w:b", "bold"],
        ["w:i", "italic"],
        ["w:u", "underline"],
        ["w:strike", "strike"],
      ])
        if (
          first(props, tag) &&
          !["false", "0", "none"].includes(attr(first(props, tag), "w:val"))
        )
          marks.push({ type });
      const family = attr(first(props, "w:rFonts"), "w:ascii"),
        size = attr(first(props, "w:sz"), "w:val"),
        color = attr(first(props, "w:color"), "w:val");
      const attrs = {
        ...(family ? { fontFamily: family } : {}),
        ...(size ? { fontSize: Number(size) / 2 + "pt" } : {}),
        ...(/^[0-9a-f]{6}$/i.test(color) ? { color: "#" + color } : {}),
      };
      if (Object.keys(attrs).length) marks.push({ type: "textStyle", attrs });
      for (const child of children(run)) {
        if (child.tagName === "w:t" && child.textContent)
          node.content.push({ type: "text", text: child.textContent, marks });
        if (child.tagName === "w:tab")
          node.content.push({ type: "text", text: "\t", marks });
        if (child.tagName === "w:br") node.content.push({ type: "hardBreak" });
      }
    }
    if (first(pr, "w:numPr"))
      warnings.add("Word 列表按段落导入，请检查编号和缩进。");
    content.push(node);
    for (const blip of all(paragraph, "a:blip")) {
      const src = picture(zip, rels.get(attr(blip, "r:embed")), warnings);
      if (src)
        content.push({ type: "image", attrs: { src, alt: "导入的图片" } });
    }
  }
  if (all(doc, "w:altChunk").length || all(doc, "w:object").length)
    warnings.add("Word 中的嵌入对象暂不支持，请核对原文件。");
  model.content = {
    type: "doc",
    content: content.length ? content : [{ type: "paragraph" }],
  };
  warnings.add(
    "导入会保留常见文字格式；页眉页脚、分页、主题样式和复杂版式可能需要重新调整。",
  );
  return model;
}
function presentation(zip, warnings) {
  const manifest = xml(zip, "ppt/presentation.xml");
  if (!manifest) fail("不是有效的 PowerPoint 文件。");
  const rels = relations(zip, "ppt/presentation.xml"),
    size = first(manifest, "p:sldSz"),
    width = Number(attr(size, "cx", 12192000)),
    height = Number(attr(size, "cy", 6858000));
  const files = all(manifest, "p:sldId")
    .map((el) => rels.get(attr(el, "r:id")))
    .filter(Boolean);
  if (!files.length || files.length > 100) fail("演示需要 1–100 页。");
  if (Math.abs(width / height - 16 / 9) > 0.03)
    warnings.add("演示画布已转换为 16:9，请核对元素位置。");
  const slides = files.map((file) => {
    const doc = xml(zip, file),
      relationships = relations(zip, file),
      tree = first(doc, "p:spTree"),
      slide = {
        id: M.id(),
        background: "#ffffff",
        transition: "none",
        duration: 0.6,
        notes: "",
        elements: [],
      };
    slide.background =
      "#" + attr(first(first(doc, "p:bg"), "a:srgbClr"), "val", "ffffff");
    const transition = first(doc, "p:transition");
    for (const effect of ["fade", "push", "wipe"])
      if (first(transition, "p:" + effect)) slide.transition = effect;
    slide.duration = attr(transition, "p14:dur")
      ? Number(attr(transition, "p14:dur")) / 1000
      : attr(transition, "spd") === "fast"
        ? 0.3
        : attr(transition, "spd") === "slow"
          ? 1.2
          : 0.6;
    for (const shape of children(tree)) {
      if (!["p:sp", "p:pic"].includes(shape.tagName)) {
        if (!["p:nvGrpSpPr", "p:grpSpPr"].includes(shape.tagName))
          warnings.add(
            "组合形状、图表、表格和部分复杂对象未转换，请核对原演示。",
          );
        continue;
      }
      const transform = first(shape, "a:xfrm"),
        off = first(transform, "a:off"),
        ext = first(transform, "a:ext");
      if (!off || !ext) {
        warnings.add("使用母版定位的部分元素无法自动定位，未导入。");
        continue;
      }
      const box = {
        id: M.id(),
        x: (Number(attr(off, "x")) / width) * 100,
        y: (Number(attr(off, "y")) / height) * 100,
        w: (Number(attr(ext, "cx")) / width) * 100,
        h: (Number(attr(ext, "cy")) / height) * 100,
      };
      if (shape.tagName === "p:pic") {
        const blip = first(shape, "a:blip"),
          src = picture(
            zip,
            relationships.get(attr(blip, "r:embed")),
            warnings,
          );
        if (src) slide.elements.push({ ...box, type: "image", src });
        continue;
      }
      const paragraphs = all(first(shape, "p:txBody"), "a:p");
      const text = paragraphs
        .map((p) =>
          all(p, "a:t")
            .map((t) => t.textContent)
            .join(""),
        )
        .join("\n");
      if (!text) continue;
      const props = first(shape, "a:rPr") || first(shape, "a:defRPr"),
        para = first(shape, "a:pPr"),
        align = attr(para, "algn", "l");
      slide.elements.push({
        ...M.textBox(text),
        ...box,
        font: attr(first(props, "a:latin"), "typeface", "Arial"),
        size: Number(attr(props, "sz", 2400)) / 100,
        color: "#" + attr(first(props, "a:srgbClr"), "val", "172d42"),
        bold: attr(props, "b") === "1",
        align: align === "ctr" ? "center" : align === "r" ? "right" : "left",
      });
      if (attr(transform, "rot"))
        warnings.add("旋转、动画、主题与母版效果可能需要重新调整。");
    }
    for (const rel of relationships.values())
      if (/\/notesSlides\/notesSlide/.test(rel)) {
        const notes = xml(zip, rel);
        slide.notes = all(notes, "a:t")
          .map((n) => n.textContent)
          .join("\n");
      }
    return slide;
  });
  warnings.add(
    "文字框、图片和常见转场可继续编辑；主题、图表、母版和复杂动画不保证完整转换。",
  );
  return { slides };
}
async function spreadsheet(bytes, warnings) {
  const ExcelJS = require("exceljs"),
    book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  if (!book.worksheets.length || book.worksheets.length > 10)
    fail("工作簿需要 1–10 个工作表。");
  const sheets = book.worksheets.map((ws) => {
    if (ws.rowCount > 1000 || ws.columnCount > 100)
      fail("工作表超过 1000 行或 100 列，请拆分后导入。");
    const sheet = {
      id: M.id(),
      name: ws.name,
      rows: Math.max(40, ws.rowCount),
      cols: Math.max(12, ws.columnCount),
      cells: {},
    };
    ws.eachRow((row) =>
      row.eachCell((cell) => {
        if (cell.value === null) return;
        let value;
        if (cell.formula) value = "=" + cell.formula;
        else if (cell.value instanceof Date)
          value = "'" + cell.value.toISOString().slice(0, 10);
        else if (typeof cell.value === "object")
          value = cell.value.richText
            ? cell.value.richText.map((t) => t.text).join("")
            : cell.value.text ||
              cell.value.error ||
              String(cell.value.result ?? "");
        else value = String(cell.value);
        if (
          typeof cell.value === "string" &&
          /^(?:[+-]?(?:\d|\.)|true$|false$)/i.test(value)
        )
          value = "'" + value;
        if (!cell.formula && value.startsWith("=")) value = "'" + value;
        const font = cell.font || {},
          fill = cell.fill || {},
          format = cell.numFmt || "";
        sheet.cells[cell.address] = {
          value,
          style: {
            bold: Boolean(font.bold),
            size: font.size || 12,
            color: "#" + (font.color?.argb || "FF172D42").slice(-6),
            background: "#" + (fill.fgColor?.argb || "FFFFFFFF").slice(-6),
            format: format.includes("%")
              ? "percent"
              : format.includes("$")
                ? "currency"
                : /0\.0/.test(format)
                  ? "number"
                  : "general",
          },
        };
      }),
    );
    return sheet;
  });
  warnings.add(
    "已导入数据、常见单元格格式和公式；图表、合并单元格与复杂格式不转换。不支持的函数会显示公式错误，请核对计算结果。",
  );
  return { sheets };
}
async function importOffice(kind, fileName, data) {
  const extension = { docs: "docx", slides: "pptx", sheets: "xlsx" }[kind];
  if (!extension || path.extname(fileName).toLowerCase() !== "." + extension)
    fail("请选择相应类型的 Office 文件。");
  if (typeof data !== "string" || data.length > 18000000)
    fail("导入文件超过 12 MB。");
  const match = /^data:[^;,]*;base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(data);
  if (!match) fail("文件内容无效。");
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length > 12 * 1024 * 1024 || bytes.length < 4)
    fail("文件大小无效。");
  let zip;
  try {
    zip = new AdmZip(bytes);
  } catch {
    fail("无法读取这个 Office 文件。");
  }
  const entries = zip.getEntries();
  if (
    entries.length > 2500 ||
    entries.reduce((n, e) => n + e.header.size, 0) > 64 * 1024 * 1024
  )
    fail("文件解压后过大，请拆分后导入。");
  if (
    entries.some((e) =>
      /vbaProject|oleObject|externalLinks|(^|\/)\.\.\//i.test(e.entryName),
    )
  )
    fail("不支持包含宏、嵌入程序或外部工作簿链接的文件。");
  for (const entry of entries)
    if (/\.(xml|rels)$/i.test(entry.entryName)) {
      if (entry.header.size > 8 * 1024 * 1024)
        fail("文件内容过大，请拆分后导入。");
      if (/<!DOCTYPE|<!ENTITY/i.test(zip.readAsText(entry)))
        fail("不支持包含 DTD 或自定义实体的文件。");
    }
  const warnings = new Set();
  let model;
  try {
    model =
      kind === "docs"
        ? word(zip, warnings)
        : kind === "slides"
          ? presentation(zip, warnings)
          : await spreadsheet(bytes, warnings);
  } catch (error) {
    if (error.statusCode) throw error;
    fail("文件内容无法转换，请确认它是有效的 Office 文件。");
  }
  return {
    name: path.basename(fileName, path.extname(fileName)).slice(0, 120),
    model: M.normalize(kind, model),
    warnings: [...warnings],
  };
}
module.exports = { importOffice };
