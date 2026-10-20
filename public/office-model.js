(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeOfficeModel = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const kinds = ["docs", "slides", "sheets"];
  const fonts = [
    "Times New Roman",
    "Arial",
    "Calibri",
    "Georgia",
    "Noto Sans SC",
    "SimSun",
  ];
  const fail = (message) => {
    throw Object.assign(new Error(message), { statusCode: 400 });
  };
  const str = (value, max = 20000) => String(value ?? "").slice(0, max);
  const num = (value, fallback, min, max) =>
    Number.isFinite(Number(value))
      ? Math.max(min, Math.min(max, Number(value)))
      : fallback;
  const color = (value, fallback = "#172d42") =>
    /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
  const font = (value) => (fonts.includes(value) ? value : fonts[0]);
  function image(value) {
    if (
      typeof value !== "string" ||
      !/^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/]+=*$/i.test(value) ||
      value.length > 1600000
    )
      fail("图片无效或超过 1 MB，请缩小图片后重试。");
    return value;
  }
  const id = () => "el_" + Math.random().toString(36).slice(2, 12);
  const col = (index) => {
    let name = "";
    for (let n = index; n > 0; n = Math.floor((n - 1) / 26))
      name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    return name;
  };
  function address(value) {
    const m = /^([A-Z]{1,3})([1-9][0-9]{0,3})$/.exec(value || "");
    if (!m) return null;
    const c = Array.from(m[1]).reduce(
        (n, v) => n * 26 + v.charCodeAt(0) - 64,
        0,
      ),
      r = Number(m[2]);
    return c <= 100 && r <= 1000 ? { row: r, col: c } : null;
  }
  function textBox(text = "双击编辑文字", extra = {}) {
    return {
      id: id(),
      type: "text",
      text,
      x: 8,
      y: 14,
      w: 78,
      h: 25,
      font: "Arial",
      size: 28,
      color: "#172d42",
      bold: false,
      align: "left",
      ...extra,
    };
  }
  function blankSlide() {
    return {
      id: id(),
      background: "#ffffff",
      transition: "none",
      duration: 0.6,
      notes: "",
      elements: [
        textBox("标题", { size: 36, y: 12, h: 18 }),
        textBox("在这里写下你的想法", { y: 38, size: 22, h: 40 }),
      ],
    };
  }
  function fresh(kind) {
    if (kind === "docs")
      return {
        settings: {
          paper: "A4",
          margin: 25.4,
          font: "Times New Roman",
          size: 12,
          line: 2,
        },
        content: { type: "doc", content: [{ type: "paragraph" }] },
      };
    if (kind === "slides") return { slides: [blankSlide()] };
    return {
      sheets: [{ id: id(), name: "Sheet1", rows: 40, cols: 12, cells: {} }],
    };
  }
  function richNode(node, depth = 0, budget = { count: 0 }) {
    if (depth > 12 || ++budget.count > 40000) fail("文档结构过大。");
    const allowed = [
      "doc",
      "paragraph",
      "text",
      "heading",
      "bulletList",
      "orderedList",
      "listItem",
      "blockquote",
      "hardBreak",
      "horizontalRule",
      "codeBlock",
      "image",
    ];
    if (!node || !allowed.includes(node.type)) fail("不支持的文档内容。");
    const out = { type: node.type };
    if (node.type === "text") {
      if (String(node.text || "").length > 300000)
        fail("单段文字过长，请拆分段落。");
      out.text = str(node.text, 300000);
    }
    if (node.attrs) {
      out.attrs = {};
      if (node.type === "image")
        Object.assign(out.attrs, {
          src: image(node.attrs.src),
          alt: str(node.attrs.alt, 200),
        });
      if (["left", "center", "right", "justify"].includes(node.attrs.textAlign))
        out.attrs.textAlign = node.attrs.textAlign;
      if (node.type === "heading")
        out.attrs.level = num(node.attrs.level, 1, 1, 3);
      if (node.type === "orderedList")
        out.attrs.start = num(node.attrs.start, 1, 1, 9999);
      if (node.attrs.lineHeight)
        out.attrs.lineHeight = String(num(node.attrs.lineHeight, 2, 1, 3));
    }
    if (node.marks)
      out.marks = node.marks
        .filter((m) =>
          [
            "bold",
            "italic",
            "underline",
            "strike",
            "code",
            "textStyle",
          ].includes(m.type),
        )
        .map((m) => {
          if (m.type !== "textStyle") return { type: m.type };
          const a = m.attrs || {},
            attrs = {};
          if (a.fontFamily)
            attrs.fontFamily = font(a.fontFamily.replace(/['"]/g, ""));
          if (a.fontSize)
            attrs.fontSize = `${num(parseFloat(a.fontSize), 12, 8, 96)}pt`;
          if (a.color) attrs.color = color(a.color);
          if (a.backgroundColor)
            attrs.backgroundColor = color(a.backgroundColor, "#ffffff");
          if (a.lineHeight)
            attrs.lineHeight = String(num(a.lineHeight, 2, 1, 3));
          return { type: "textStyle", attrs };
        });
    if (node.content) {
      if (!Array.isArray(node.content)) fail("文档内容无效。");
      out.content = node.content.map((child) =>
        richNode(child, depth + 1, budget),
      );
    }
    return out;
  }
  function normalize(kind, value) {
    if (!kinds.includes(kind) || !value || typeof value !== "object")
      fail("作品类型无效。");
    if (JSON.stringify(value).length > 10000000)
      fail("作品超过 10 MB，请减少图片或拆分作品。");
    if (kind === "docs") {
      const s = value.settings || {};
      const content = richNode(value.content || fresh(kind).content);
      if (content.type !== "doc") fail("文档根节点无效。");
      return {
        settings: {
          paper: s.paper === "Letter" ? "Letter" : "A4",
          margin: num(s.margin, 25.4, 10, 40),
          font: font(s.font),
          size: num(s.size, 12, 8, 72),
          line: num(s.line, 2, 1, 3),
        },
        content,
      };
    }
    if (kind === "slides") {
      if (
        !Array.isArray(value.slides) ||
        !value.slides.length ||
        value.slides.length > 100
      )
        fail("演示需要 1–100 页。");
      return {
        slides: value.slides.map((slide) => {
          if (!Array.isArray(slide.elements) || slide.elements.length > 100)
            fail("每页最多 100 个元素。");
          const elements = slide.elements.map((el) => {
            if (!["text", "image"].includes(el.type))
              fail("幻灯片元素类型无效。");
            if (String(el.text || "").length > 10000)
              fail("文字框超过 10000 字符，请拆分内容。");
            const x = num(el.x, 5, 0, 95),
              y = num(el.y, 5, 0, 95);
            const result = {
              id: str(el.id || id(), 100),
              type: el.type,
              x,
              y,
              w: num(el.w, 40, 3, 100 - x),
              h: num(el.h, 20, 3, 100 - y),
            };
            if (el.type === "image") result.src = image(el.src);
            else
              Object.assign(result, {
                text: str(el.text, 10000),
                font: font(el.font),
                size: num(el.size, 24, 8, 96),
                color: color(el.color),
                bold: Boolean(el.bold),
                align: ["left", "center", "right"].includes(el.align)
                  ? el.align
                  : "left",
              });
            return result;
          });
          if (new Set(elements.map((el) => el.id)).size !== elements.length)
            fail("元素 ID 重复。");
          return {
            id: str(slide.id || id(), 100),
            background: color(slide.background, "#ffffff"),
            transition: ["none", "fade", "push", "wipe"].includes(
              slide.transition,
            )
              ? slide.transition
              : "none",
            duration: num(slide.duration, 0.6, 0.2, 2),
            notes: str(slide.notes, 10000),
            elements,
          };
        }),
      };
    }
    if (
      !Array.isArray(value.sheets) ||
      !value.sheets.length ||
      value.sheets.length > 10
    )
      fail("工作簿需要 1–10 个工作表。");
    const names = new Set();
    let count = 0;
    return {
      sheets: value.sheets.map((sheet) => {
        const name = str(sheet.name, 31).trim();
        if (!name || /[\\/*?:\[\]]/.test(name) || names.has(name.toLowerCase()))
          fail("工作表名称无效或重复。");
        names.add(name.toLowerCase());
        const rows = Math.floor(num(sheet.rows, 40, 10, 1000)),
          cols = Math.floor(num(sheet.cols, 12, 5, 100));
        const cells = {};
        for (const [key, cell] of Object.entries(sheet.cells || {})) {
          const a = address(key);
          if (!a || a.row > rows || a.col > cols)
            fail("单元格地址超过工作表范围。");
          if (++count > 50000) fail("作品最多保存 50000 个非空单元格。");
          if (String(cell.value || "").length > 4000)
            fail("单元格内容超过 4000 字符。");
          const s = cell.style || {};
          cells[key] = {
            value: str(cell.value, 4000),
            style: {
              bold: Boolean(s.bold),
              color: color(s.color),
              background: color(s.background, "#ffffff"),
              size: num(s.size, 12, 8, 36),
              format: ["general", "number", "currency", "percent"].includes(
                s.format,
              )
                ? s.format
                : "general",
            },
          };
        }
        return { id: str(sheet.id || id(), 100), name, rows, cols, cells };
      }),
    };
  }
  function safeNormalize(kind, value) {
    try {
      return normalize(kind, value);
    } catch (error) {
      if (error.statusCode) throw error;
      fail("作品内容结构无效。");
    }
  }
  return {
    kinds,
    fonts,
    fresh,
    normalize: safeNormalize,
    col,
    address,
    blankSlide,
    textBox,
    id,
    color,
    image,
  };
});
