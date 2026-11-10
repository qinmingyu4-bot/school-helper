"use strict";
const parse = require("pdf-parse");
// Read actual URI annotations, including links whose visible label is only “here”.
// Never request any of the extracted destinations.
async function readPdfSources(bytes, title) {
  const sources = [];
  await parse(Uint8Array.from(bytes), { pagerender: async (page) => {
    const { items } = await page.getTextContent({ normalizeWhitespace:false, disableCombineTextItems:false });
    let text = "", previousY;
    for (const item of items) {
      const y = item.transform?.[5];
      if (text && y !== previousY) text += "\n";
      text += item.str || ""; previousY = y;
    }
    const links = [];
    for (const annotation of await page.getAnnotations()) {
      if (annotation.subtype !== "Link" || !annotation.url || !Array.isArray(annotation.rect)) continue;
      const [left,bottom,right,top] = annotation.rect;
      const near = items.filter((item) => {
        const x = item.transform?.[4], y = item.transform?.[5];
        return Number.isFinite(x) && Number.isFinite(y) && y >= bottom-22 && y <= top+22;
      });
      const anchor = near.filter((item) => item.transform[4] + (item.width || 0) >= left && item.transform[4] <= right && item.transform[5] >= bottom-4 && item.transform[5] <= top+4);
      links.push({ url:annotation.url, label:anchor.map((item)=>item.str).join(" ").slice(0,120), context:near.map((item)=>item.str).join(" ").slice(0,800), page:page.pageNumber });
    }
    sources.push({ title, text, links, sourcePages:text ? [{page:page.pageNumber,start:0,end:text.length}] : [] });
    return text;
  } });
  return sources;
}
module.exports = { readPdfSources };
