"use strict";
const recognition = require("./grade-preview-recognition");
const locations = require("../public/grade-locations");
const { readPdfSources } = require("./grade-source-pdf");
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
function createGradePlanner({ db, apiKey, model, request }) {
  let active = 0;
  const pdfCache = new Map();
  let pdfQueue = Promise.resolve();
  const capabilities = () => ({ configured: Boolean(apiKey), syllabusConfigured: Boolean(apiKey), provider: apiKey ? "ai" : null });
  return {
    async read(userId) {
      const courses = (await db.listCourses(userId)).filter((c) => c.name !== "Schedule & Deadlines" && c.chatType !== "general");
      return { ...capabilities(), courses: await Promise.all(courses.map(async (c) => ({ id: c.id, code: c.name, name: c.name, term: c.term, ...await db.getGradePlan(userId, c.id) }))) };
    },
    async locations(userId, courseId) {
      if (!await db.getCourse(userId, courseId)) throw fail(404, "课程不存在。");
      const documents = (await db.listDocuments(userId, courseId)).filter((doc) => doc.type !== "Schedule" && !String(doc.title).startsWith("[SCHEDULE_ITEM]"));
      const sources = [], pdfLocations = []; let partialCount = 0;
      for (const doc of documents) {
        sources.push({ title:doc.title, documentId:doc.id, text:doc.text, sourcePages:doc.sourcePages });
        if (!doc.hasSourcePdf) continue;
        const key = JSON.stringify([userId,courseId,doc.id,doc.updatedAt]);
        if (!pdfCache.has(key)) {
          const work = pdfQueue.catch(()=>{}).then(async () => {
            const file = await db.readMaterial(userId,courseId,`DOCFILE#${doc.id}#PDF`);
            if (!file?.dataUrl) throw new Error("Original PDF unavailable");
            return locations.discover(await readPdfSources(Buffer.from(file.dataUrl.split(",")[1],"base64"),doc.title));
          });
          pdfQueue = work.catch(()=>{});
          pdfCache.set(key,work); if (pdfCache.size > 32) pdfCache.delete(pdfCache.keys().next().value);
        }
        try { pdfLocations.push(...(await pdfCache.get(key)).map((source)=>({...source,documentId:doc.id}))); }
        catch { partialCount++; pdfCache.delete(key); }
      }
      return { locations:[...locations.discover(sources),...pdfLocations], checkedCount:documents.length, partialCount };
    },
    async recognize(userId, courseId, body, signal) {
      if (!await db.getCourse(userId, courseId)) throw fail(404, "课程不存在。");
      let file;
      try { file = recognition.upload(body); } catch (error) { throw fail(400, error.message); }
      if (!apiKey) throw fail(503, "AI 识别尚未配置，请先手动填写。");
      if (active >= 2) throw fail(429, "已有文件正在识别，请稍后重试。");
      active++;
      try {
        const response = await request("https://api.openai.com/v1/responses", { method: "POST", signal,
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify(recognition.requestBody(file, model)) });
        if (!response.ok) throw fail(502, "AI 识别暂时不可用，请重试；尚未保存任何成绩。");
        const result = recognition.parseRecognition(file.kind, recognition.responseText(await response.json()));
        if (file.kind === "syllabus") {
          let sources;
          if (body.mime === "text/plain") sources = [{title:file.name,text:Buffer.from(body.dataUrl.split(",")[1],"base64").toString("utf8")}];
          if (body.mime === "application/pdf") { try { sources = await readPdfSources(Buffer.from(body.dataUrl.split(",")[1],"base64"),file.name); } catch { /* Preserve the explicitly reviewed AI result when the original is not text-readable. */ } }
          const found = sources ? locations.discover(sources) : [];
          const readable = sources?.some((source)=>source.text.trim() || source.links?.length);
          for (const category of result.categories) {
            const relevant = locations.forCategory(found,category);
            const directions = (category.gradeDirections || []).filter((direction)=>!readable || relevant.some((source)=>!source.url && source.quote.replace(/\s+/g," ").includes(direction.quote.replace(/\s+/g," "))));
            category.gradeDirections = [...relevant.filter((link)=>!link.url).map(locations.normalizeDirection),...directions].filter((value,index,array)=>array.findIndex((other)=>other.quote===value.quote)===index).slice(0,5).map((value)=>({...value,sourceName:file.name}));
            const extracted = (category.gradeLinks || []).filter((link)=>!readable || relevant.some((candidate)=>candidate.url === link.url));
            const actual = locations.forCategory(found,category).filter((link)=>link.url).map((link)=>locations.normalizeLink(link));
            category.gradeLinks = [...actual, ...extracted].filter((link,index,array)=>array.findIndex((other)=>other.url===link.url)===index).slice(0,5)
              .map((link)=>({...link,sourceName:file.name}));
          }
        }
        return result;
      } finally { active--; }
    }
  };
}
module.exports = { createGradePlanner };
