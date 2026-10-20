const { normalize } = require("../public/office-model");
const { calculator } = require("./office-formulas");
const { formats } = require("./creative-files");
const AdmZip = require("adm-zip");
const color = (value) => value.replace("#", "");
const imageBytes = (src) => Buffer.from(src.split(",")[1], "base64");
async function word(model, name) {
  const D = require("docx"),
    s = model.settings;
  const align = {
    left: D.AlignmentType.LEFT,
    center: D.AlignmentType.CENTER,
    right: D.AlignmentType.RIGHT,
    justify: D.AlignmentType.JUSTIFIED,
  };
  function runs(node) {
    if (node.type === "text") {
      const options = { text: node.text, font: s.font, size: s.size * 2 };
      for (const mark of node.marks || []) {
        if (mark.type === "bold") options.bold = true;
        if (mark.type === "italic") options.italics = true;
        if (mark.type === "underline") options.underline = {};
        if (mark.type === "strike") options.strike = true;
        if (mark.type === "textStyle") {
          if (mark.attrs.fontFamily) options.font = mark.attrs.fontFamily;
          if (mark.attrs.fontSize)
            options.size = parseFloat(mark.attrs.fontSize) * 2;
          if (mark.attrs.color) options.color = color(mark.attrs.color);
          if (mark.attrs.backgroundColor)
            options.shading = { fill: color(mark.attrs.backgroundColor) };
        }
      }
      return [new D.TextRun(options)];
    }
    if (node.type === "hardBreak") return [new D.TextRun({ break: 1 })];
    return (node.content || []).flatMap(runs);
  }
  function blocks(nodes, list = null, level = 0) {
    return (nodes || []).flatMap((node) => {
      if (node.type === "bulletList" || node.type === "orderedList")
        return blocks(node.content, node.type, level);
      if (node.type === "listItem")
        return blocks(node.content, list, level + 1);
      if (node.type === "blockquote")
        return blocks(node.content, list, level + 1);
      if (node.type === "image") {
        const bytes = imageBytes(node.attrs.src),
          ext = node.attrs.src.includes("jpeg")
            ? "jpg"
            : node.attrs.src.includes("webp")
              ? "webp"
              : "png";
        const dimensions = require("image-size").imageSize(bytes);
        const scale = Math.min(
          1,
          560 / dimensions.width,
          700 / dimensions.height,
        );
        return [
          new D.Paragraph({
            children: [
              new D.ImageRun({
                type: ext,
                data: bytes,
                transformation: {
                  width: dimensions.width * scale,
                  height: dimensions.height * scale,
                },
              }),
            ],
          }),
        ];
      }
      if (node.type === "horizontalRule")
        return [
          new D.Paragraph({
            border: {
              bottom: { color: "AAAAAA", size: 4, style: D.BorderStyle.SINGLE },
            },
          }),
        ];
      const options = {
        children: runs(node),
        alignment: align[node.attrs?.textAlign] || align.left,
        spacing: {
          line: Math.round(Number(node.attrs?.lineHeight || s.line) * 240),
          after: 0,
        },
        ...(level ? { indent: { left: level * 360 } } : {}),
        ...(node.type === "heading"
          ? { heading: D.HeadingLevel[`HEADING_${node.attrs?.level || 1}`] }
          : {}),
      };
      if (list === "bulletList")
        options.bullet = { level: Math.min(8, Math.max(0, level - 1)) };
      if (list === "orderedList")
        options.numbering = {
          reference: "ordered",
          level: Math.min(8, Math.max(0, level - 1)),
        };
      return [new D.Paragraph(options)];
    });
  }
  const doc = new D.Document({
    title: name,
    creator: "StudyBridge",
    styles: {
      default: {
        document: {
          run: { font: s.font, size: s.size * 2 },
          paragraph: { spacing: { line: s.line * 240, after: 0 } },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "ordered",
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: D.LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: D.AlignmentType.START,
          })),
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size:
              s.paper === "Letter"
                ? { width: 12240, height: 15840 }
                : { width: 11906, height: 16838 },
            margin: {
              top: (s.margin / 25.4) * 1440,
              bottom: (s.margin / 25.4) * 1440,
              left: (s.margin / 25.4) * 1440,
              right: (s.margin / 25.4) * 1440,
            },
          },
        },
        children: blocks(model.content.content),
      },
    ],
  });
  return D.Packer.toBuffer(doc);
}
async function slides(model, name) {
  const PptxGenJS = require("pptxgenjs"),
    deck = new PptxGenJS();
  deck.layout = "LAYOUT_WIDE";
  deck.author = "StudyBridge";
  deck.title = name;
  deck.subject = "Editable StudyBridge presentation";
  for (const item of model.slides) {
    const slide = deck.addSlide();
    slide.background = { color: color(item.background) };
    for (const el of item.elements) {
      const box = {
        x: (el.x / 100) * 13.333333,
        y: (el.y / 100) * 7.5,
        w: (el.w / 100) * 13.333333,
        h: (el.h / 100) * 7.5,
      };
      if (el.type === "image") slide.addImage({ data: el.src, ...box });
      else
        slide.addText(el.text, {
          ...box,
          fontFace: el.font,
          fontSize: el.size,
          color: color(el.color),
          bold: el.bold,
          align: el.align,
          valign: "top",
          margin: 0,
          breakLine: false,
        });
    }
    slide.addNotes(item.notes || "");
  }
  const bytes = await deck.write({ outputType: "nodebuffer" });
  const zip = new AdmZip(bytes);
  model.slides.forEach((slide, index) => {
    if (slide.transition === "none") return;
    const file = `ppt/slides/slide${index + 1}.xml`;
    const effect =
      slide.transition === "fade"
        ? "<p:fade/>"
        : `<p:${slide.transition} dir="l"/>`;
    const speed =
      slide.duration < 0.5 ? "fast" : slide.duration > 1 ? "slow" : "med";
    zip.updateFile(
      file,
      Buffer.from(
        zip
          .readAsText(file)
          .replace(
            "</p:sld>",
            `<p:transition xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" spd="${speed}" p14:dur="${Math.round(slide.duration * 1000)}">${effect}</p:transition></p:sld>`,
          ),
      ),
    );
  });
  return zip.toBuffer();
}
async function workbook(model, name) {
  const ExcelJS = require("exceljs"),
    book = new ExcelJS.Workbook();
  const calc = calculator(model);
  book.creator = "StudyBridge";
  book.title = name;
  book.calcProperties.fullCalcOnLoad = true;
  for (const item of model.sheets) {
    const sheet = book.addWorksheet(item.name, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.columns = Array.from({ length: item.cols }, () => ({ width: 16 }));
    for (const [address, data] of Object.entries(item.cells)) {
      const cell = sheet.getCell(address),
        raw = data.value,
        style = data.style;
      const result = calc.get(item.name, address);
      if (raw.startsWith("="))
        cell.value = {
          formula: raw.slice(1),
          result:
            result instanceof Error
              ? {
                  error: [
                    "#REF!",
                    "#DIV/0!",
                    "#VALUE!",
                    "#NAME?",
                    "#NUM!",
                    "#N/A",
                  ].includes(result.error)
                    ? result.error
                    : "#VALUE!",
                }
              : result,
        };
      else
        cell.value = raw.startsWith("'")
          ? raw.slice(1)
          : raw && typeof result !== "object"
            ? result
            : raw;
      cell.font = {
        name: "Calibri",
        size: style.size,
        bold: style.bold,
        color: { argb: "FF" + color(style.color) },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF" + color(style.background) },
      };
      cell.alignment = { vertical: "top", wrapText: true };
      cell.numFmt = {
        general: "General",
        number: "0.00",
        currency: "$#,##0.00",
        percent: "0.00%",
      }[style.format];
    }
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}
async function exportOffice(kind, input, name = "StudyBridge") {
  const model = normalize(kind, input),
    extension = { docs: "docx", slides: "pptx", sheets: "xlsx" }[kind];
  const bytes = await { docs: word, slides, sheets: workbook }[kind](
    model,
    name,
  );
  return { bytes, extension, mime: formats[extension] };
}
module.exports = { exportOffice };
