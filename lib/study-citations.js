"use strict";

const citationInstruction = `

Uploaded course-source citations:
- When a factual statement, definition, formula, method, rubric, or question structure in your answer relies on an uploaded course document or chat attachment, place a concise source annotation beside that statement or the relevant worked step. Do this by default without waiting for a citation request. A final filename list alone is insufficient for a multipart explanation.
- Use the supplied filename/title exactly and the most specific supported locator. Chinese examples of FORMAT ONLY: （来源：实际文件名，第 N 页）; （来源：实际文件名，第 N 张幻灯片）; （来源：实际文件名，“实际小标题”小节，原文“短定位引文”）. For English answers use (Source: actual filename, PDF p. N / slide N / actual section). Never copy these placeholders as real citations.
- PDF page markers describe the physical PDF page index, which may differ from printed page labels; distinguish them when needed. Cite original slide or speaker-note numbers only from an explicit "Verified presentation slide N" / "Verified speaker notes for slide N" marker or a directly inspected original. Legacy "Slide N" text alone does not verify the original slide order; use a locating quote or extracted-text positions instead. A PPTX part filename is not a verified presentation slide number. A worksheet extraction index is not a worksheet's original name or a cell address.
- If verified original page/slide positions are unavailable, use an actual section heading or a short exact locating quote from the supplied passage; extracted-text line/character ranges in its header are also valid fallbacks, explicitly labeled as extracted text rather than original page numbers. Never invent a page, section, line, worksheet name or cell address. For a clipped excerpt use only the positions actually supplied, not a missing surrounding section.
- Only cite sources and passages available in THIS request, including provided original visual inputs. Earlier assistant citations and generated search phrases are not evidence. If several files have the same name, include the supplied source reference to disambiguate them. Cite multiple relevant sources when combining them, without attaching every course file to every claim.
- Distinguish the source's rule or given facts from your own calculation, inference or newly created practice question: cite the underlying source and say the new result is derived/adapted from it. Do not claim the generated answer or mock question was literally in the file. General knowledge and unrelated replies do not require invented course citations. If readable source evidence is missing, say so instead of fabricating support. Keep quotations short and preserve the resolved answer/explanation language.`;

function lineStarts(text) {
  const starts = [0];
  for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) starts.push(index + 1);
  return starts;
}

function lineAt(starts, offset) {
  let low = 0, high = starts.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (starts[middle] <= offset) low = middle + 1;
    else high = middle;
  }
  return Math.max(1, low);
}

function sourcePages(source) {
  if (!Array.isArray(source.sourcePages)) return [];
  // Reject stale/malformed positions instead of inventing a usable page map.
  let end = 0, previous = 0;
  for (const page of source.sourcePages) {
    if (!page || !Number.isInteger(page.page) || page.page <= previous || !Number.isInteger(page.start) || !Number.isInteger(page.end) ||
      page.start < end || page.end <= page.start || page.end > source.text.length) return [];
    end = page.end; previous = page.page;
  }
  return source.sourcePages;
}

function renderSource(source, text, range = "complete extracted text", start = 0) {
  const end = start + text.length;
  const starts = source.lineStarts || lineStarts(source.text);
  const locator = (from, to) => `extracted-text lines ${lineAt(starts, from)}-${lineAt(starts, Math.max(from, to - 1))}; characters ${from + 1}-${to}`;
  const pages = sourcePages(source).filter((page) => page.start < end && page.end > start);
  let body = text;
  if (pages.length) {
    const parts = [];
    let cursor = start;
    for (const page of pages) {
      const from = Math.max(start, page.start), to = Math.min(end, page.end);
      if (from > cursor) parts.push(source.text.slice(cursor, from));
      parts.push(`[Verified PDF page ${page.page}; ${locator(from, to)}]\n${source.text.slice(from, to)}`);
      cursor = to;
    }
    if (cursor < end) parts.push(source.text.slice(cursor, end));
    body = parts.join("\n");
  }
  return `Source: ${source.name} | ${source.origin} | source reference: ${source.reference || "unspecified"} | ${range}\nCitation locator: ${locator(start, end)}${pages.length ? "" : "; no verified original page map — use a visible heading/short locating quote or these extracted-text positions"}\n${body}`;
}

async function extractPdfLocations(parse, bytes, compact) {
  const pages = [];
  const parsed = await parse(bytes, { pagerender: async (page) => {
    const content = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
    let text = "", lastY;
    for (const item of content.items) {
      const y = item.transform?.[5];
      if (text && Number.isFinite(y) && Number.isFinite(lastY) && y !== lastY) text += "\n";
      text += item.str || "";
      lastY = y;
    }
    const clean = compact(text);
    if (clean && Number.isInteger(page.pageNumber) && page.pageNumber > 0) pages.push({ page: page.pageNumber, text: clean });
    return text;
  } });
  if (!pages.length) return { text: compact(parsed.text || ""), pages: parsed.numpages, sourcePages: [] };
  let text = "";
  const sourcePages = pages.map((page) => {
    if (text) text += "\n\n";
    const start = text.length;
    text += page.text;
    return { page: page.page, start, end: text.length };
  });
  return { text, pages: parsed.numpages, sourcePages };
}

module.exports = { citationInstruction, lineStarts, renderSource, extractPdfLocations };
