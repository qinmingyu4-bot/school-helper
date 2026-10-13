const PDFJS = require("pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js");
const { OPS } = PDFJS;
const { plan } = require("../public/cheatsheet-print");

async function validatePrintablePdf(bytes, settings) {
  const expected = plan(settings), pages = [], violations = new Set();
  const margin = expected.marginMm * 72 / 25.4;
  // This bundled PDF.js version reads font/worker settings from its legacy namespace.
  PDFJS.PDFJS.disableWorker = true;
  PDFJS.PDFJS.disableFontFace = true;
  PDFJS.PDFJS.isEvalSupported = false;
  const document = await PDFJS.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, isEvalSupported: false, maxImageSize: 32000000 }).promise;
  try {
    for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex++) {
      const page = await document.getPage(pageIndex);
      const [left, bottom, right, top] = page.view;
      const width = right - left, height = top - bottom;
      if (Math.abs(width - expected.width) > 2 || Math.abs(height - expected.height) > 2) violations.add("纸张尺寸或方向不符合要求");
      if (page.rotate % 360 !== 0) violations.add("纸张不能依靠页面旋转改变打印方向");
      const text = await page.getTextContent();
      const items = text.items.filter((item) => item.str.trim());
      if (!items.length) violations.add("页面缺少可选择的文字");
      for (const item of items) {
        const [a, b, , , x, y] = item.transform;
        const fontSize = Math.hypot(a, b);
        if (fontSize < expected.fontSize - 0.3) violations.add("存在小于最小字号的文字");
        if (x - left < margin - 2 || x + item.width - left > width - margin + 2 || y - bottom < margin - 2 || y - bottom + fontSize * 0.75 > height - margin + 2) violations.add("存在超出打印边距的文字");
      }
      if (expected.monochrome) {
        const operators = await page.getOperatorList();
        operators.fnArray.forEach((operation, i) => {
          if ([OPS.setFillRGBColor, OPS.setStrokeRGBColor].includes(operation)) {
            const colors = Array.from(operators.argsArray[i]);
            const tolerance = Math.max(...colors) > 1 ? 2 : 0.005;
            if (Math.max(...colors) - Math.min(...colors) > tolerance) violations.add("黑白版包含彩色文字或图形");
          }
          if ([OPS.setFillCMYKColor, OPS.setStrokeCMYKColor].includes(operation)) {
            const colors = Array.from(operators.argsArray[i]).slice(0, 3);
            if (Math.max(...colors) - Math.min(...colors) > 0.005) violations.add("黑白版包含彩色文字或图形");
          }
        });
      }
      pages.push({ width, height, textRuns: items.length });
    }
    if (document.numPages !== expected.pages) violations.add(`要求 ${expected.pages} 页，实际 ${document.numPages} 页`);
    if (violations.size) throw Object.assign(new Error(`PDF 打印检查未通过：${[...violations].join("；")}。请缩减内容或调整排版后重试。`), { statusCode: 502, code: "PRINT_LAYOUT_INVALID" });
    return { pages: document.numPages, paper: expected.paper, orientation: expected.orientation, minFontSize: expected.fontSize, marginMm: expected.marginMm, monochrome: expected.monochrome };
  } finally { await document.destroy(); }
}

module.exports = { validatePrintablePdf };
