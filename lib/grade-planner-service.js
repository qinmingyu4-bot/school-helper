"use strict";
const G = require("../public/grade-planner-model");
const { supportsWeight, mergeClearRules } = require("./grade-rule-defaults");
const recognition = require("./grade-preview-recognition");
const locations = require("../public/grade-locations");
const { readPdfSources } = require("./grade-source-pdf");
const materialRules = require("./grade-course-materials");
const { inspectSyllabus } = require("./grade-syllabus-routing");
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });

function resolveSavedDrop(category, sources) {
  const verified = category.ruleEvidence.some(ref => {
    const source = sources.find(doc => doc.id === ref.documentId);
    return source?.native || recognition.matchQuote(source?.text, category.dropEvidence);
  });
  recognition.resolveDropRule(category, verified);
}

function createGradePlanner({ db, apiKey, model, screenshotModel = model, syllabusModel = model, request }) {
  let active = 0;
  const pdfCache = new Map();
  let pdfQueue = Promise.resolve();
  const capabilities = () => ({ configured: Boolean(apiKey), syllabusConfigured: Boolean(apiKey), provider: apiKey ? "ai" : null });

  function clearRules(result, inspection, verified) {
    if (result.warnings.length || !inspection.matches(result.categories)) return false;
    const { categories } = result;
    const names = categories.map(category => G.normalizeName(category.name));
    if (names.includes("") || new Set(names).size !== names.length) return false;
    if (categories.some(category => category.weight === null || category.specialRule
      || category.plannedCount !== null && category.items.length > category.plannedCount
      || !verified(category, result))) return false;
    return Math.abs(categories.reduce((sum, category) => sum + category.weight, 0) - 100) <= .000001;
  }

  async function requestResult(body, signal, message) {
    signal?.throwIfAborted();
    const response = await request("https://api.openai.com/v1/responses", {
      method: "POST", signal, headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw fail(502, message);
    return response.json();
  }

  async function readSyllabus(inspection, buildRequest, parse, verified, signal, message) {
    const readDraft = payload => {
      const result = parse(recognition.responseText(payload));
      inspection.normalizeNoDropNotes(result.categories);
      return result;
    };
    let flagged = false;
    if (syllabusModel !== model && !inspection.preferSol) {
      // Requests that fail at the provider are not retried on a second model.
      const payload = await requestResult(buildRequest(syllabusModel), signal, message);
      if (payload.error || payload.status === "failed") throw fail(502, message);
      let draft;
      try { draft = readDraft(payload); }
      catch { /* Missing or invalid evidence requires one detailed read. */ }
      if (draft && clearRules(draft, inspection, verified)) return draft;
      flagged = Boolean(draft?.warnings.length || draft?.categories.some(category => category.specialRule));
    }
    const result = readDraft(await requestResult(buildRequest(model), signal, message));
    return inspection.review || flagged || !clearRules(result, inspection, verified)
      ? { ...result, reviewReason: { code: "unclear", details: [] } }
      : result;
  }

  async function saveClearRules(userId, courseId, plan, result, source, signal) {
    if (!plan || result.reviewReason) return result;
    const { categories, sourceReview } = result;
    const merged = mergeClearRules(plan.categories, categories);
    if (merged.conflicts.length) return { ...result, reviewReason: { code: "conflict", details: merged.conflicts } };

    signal?.throwIfAborted();
    const savedPlan = await db.saveGradePlan(userId, courseId, {
      version: plan.version,
      source,
      sourceReview,
      ruleSources: plan.ruleSources || [],
      categories: merged.categories
    });
    return { ...result, savedPlan };
  }

  async function documents(userId,courseId) {
    if (!await db.getCourse(userId,courseId)) throw fail(404,"课程不存在。");
    return (await db.listDocuments(userId,courseId)).filter(materialRules.eligible);
  }
  async function collectLocations(userId,courseId,documents,originals) {
    const sources = [], pdfLocations = []; let partialCount = 0;
    for (const doc of documents) {
      sources.push({ title:doc.title, documentId:doc.id, text:doc.text, sourcePages:doc.sourcePages });
      if (!doc.hasSourcePdf) continue;
      const key = JSON.stringify([userId,courseId,doc.id,doc.updatedAt]);
      if (!pdfCache.has(key)) {
        const work = pdfQueue.catch(()=>{}).then(async () => {
          const file = await db.readMaterial(userId,courseId,`DOCFILE#${doc.id}#PDF`);
          if (!file?.dataUrl) throw new Error("Original PDF unavailable");
          const pages = await readPdfSources(Buffer.from(file.dataUrl.split(",")[1],"base64"),doc.title);
          return { pages, locations: locations.discover(pages) };
        });
        pdfQueue = work.catch(()=>{});
        pdfCache.set(key,work); if (pdfCache.size > 32) pdfCache.delete(pdfCache.keys().next().value);
      }
      try {
        const pdf = await pdfCache.get(key);
        originals?.set(doc.id, pdf.pages);
        pdfLocations.push(...pdf.locations.map(source => ({ ...source, documentId: doc.id })));
      }
      catch { partialCount++; pdfCache.delete(key); }
    }
    return { locations:[...locations.discover(sources),...pdfLocations], checkedCount:documents.length, partialCount };
  }
  return {
    async read(userId) {
      const courses = (await db.listCourses(userId)).filter((c) => c.name !== "Schedule & Deadlines" && c.chatType !== "general");
      return { ...capabilities(), courses: await Promise.all(courses.map(async (c) => ({ id: c.id, code: c.name, name: c.name, term: c.term, ...await db.getGradePlan(userId, c.id) }))) };
    },
    async locations(userId, courseId) {
      return collectLocations(userId,courseId,await documents(userId,courseId));
    },
    async materials(userId,courseId) {
      const [available,plan]=await Promise.all([documents(userId,courseId),db.getGradePlan(userId,courseId)]);
      return {materials:available.map(materialRules.describe),version:plan.version,maxDocuments:materialRules.MAX_DOCUMENTS,...capabilities()};
    },
    async extractMaterials(userId,courseId,body,signal) {
      const available=await documents(userId,courseId), ids=body?.documentIds;
      if (!Array.isArray(ids) || !ids.length || ids.length>materialRules.MAX_DOCUMENTS || new Set(ids).size!==ids.length
        || ids.some(id=>typeof id!=="string" || !available.some(doc=>doc.id===id))) throw fail(400,"请选择本课程的 1–8 份已有资料。");
      const plan=await db.getGradePlan(userId,courseId);
      if (body.version!==plan.version) throw fail(409,"成绩记录已更新，请刷新页面后重新提取。");
      if (!apiKey) throw fail(503,"AI 识别尚未配置，仍可手动设置评分规则。");
      if (active>=2) throw fail(429,"已有资料正在识别，请稍后重试。");
      active++;
      try {
        const selected=available.filter(doc=>ids.includes(doc.id)), refs=selected.map(materialRules.reference);
        const prepared=await materialRules.prepare(selected,id=>db.readMaterial(userId,courseId,`DOCFILE#${id}#PDF`));
        const originals = new Map();
        const found = (await collectLocations(userId, courseId, selected, originals)).locations;
        const inspection = inspectSyllabus(prepared.sources.flatMap(doc => doc.hasSourcePdf
          ? [doc, ...(originals.get(doc.id)?.length ? originals.get(doc.id) : [{ native: true }])]
          : [doc]));
        const result = await readSyllabus(inspection, selectedModel => materialRules.requestBody(prepared, selectedModel), output => {
          const draft = materialRules.parse(output, prepared);
          for (const category of draft.categories) resolveSavedDrop(category, prepared.sources);
          return draft;
        }, (category, draft) => category.ruleEvidence.some(ref => {
          const pdfPages = originals.get(ref.documentId);
          return ref.verified && supportsWeight(category, ref.quote, draft.categories)
            && (!pdfPages || pdfPages.some(page => recognition.matchQuote(page.text, ref.quote)));
        }), signal, "资料提取暂时未成功，请重试；尚未保存任何规则。");
        for(const category of result.categories) {
          const relevant=locations.forCategory(found,category), native=category.ruleEvidence.find(ref=>!ref.verified);
          const actual=relevant.filter(link=>link.url).map(link=>locations.normalizeLink(link));
          const extracted=(category.gradeLinks || []).filter(link=>relevant.some(candidate=>candidate.url===link.url) || native)
            .map(link=>({...link,sourceName:relevant.find(candidate=>candidate.url===link.url)?.sourceName || native?.sourceName || ""}));
          category.gradeLinks=[...actual,...extracted].filter((link,index,array)=>array.findIndex(other=>other.url===link.url && other.sourceName===link.sourceName)===index).slice(0,5);
          category.gradeDirections=[...relevant.filter(link=>!link.url).map(locations.normalizeDirection),
            ...(native?(category.gradeDirections || []).map(direction=>({...direction,sourceName:native.sourceName})):[])].slice(0,5);
        }
        materialRules.assertCurrent(refs,await documents(userId,courseId));
        if((await db.getGradePlan(userId,courseId)).version!==plan.version) throw fail(409,"成绩记录已更新，请刷新页面后重新提取。");
        const draft = { ...result, sourceReview: { version: plan.version, sources: refs } };
        return await saveClearRules(userId, courseId, body.autoSave === true ? plan : null, draft, refs.map(ref => ref.name).join("、"), signal);
      } finally {active--;}
    },
    async recognize(userId, courseId, body, signal) {
      if (!await db.getCourse(userId, courseId)) throw fail(404, "课程不存在。");
      let file;
      try { file = recognition.upload(body); } catch (error) { throw fail(400, error.message); }
      if (!apiKey) throw fail(503, "AI 识别尚未配置，请先手动填写。");
      const plan = file.kind === "syllabus" && body.autoSave === true ? await db.getGradePlan(userId, courseId) : null;
      if (plan && body.version !== plan.version) throw fail(409, "成绩记录已更新，请刷新页面后重新识别。");
      if (active >= 2) throw fail(429, "已有文件正在识别，请稍后重试。");
      active++;
      try {
        const buildRequest = selectedModel => recognition.requestBody(file, selectedModel);
        const message = "AI 识别暂时不可用，请重试；尚未保存任何成绩。";
        if (file.kind === "syllabus") {
          let sources = [];
          if (body.mime === "text/plain") sources = [{ title: file.name, text: file.content.text }];
          if (body.mime === "application/pdf") {
            try { sources = await readPdfSources(Buffer.from(body.dataUrl.split(",")[1], "base64"), file.name); }
            catch { /* The original can still be read by Sol and left for manual review. */ }
          }
          const inspection = inspectSyllabus(sources);
          const textSources = sources.filter(source => source.text.trim());
          const result = await readSyllabus(inspection, buildRequest, output => {
            const draft = recognition.parseRecognition(file.kind, output);
            for (const category of draft.categories) recognition.resolveDropRule(category,
              !textSources.length || textSources.some(source => recognition.matchQuote(source.text, category.dropEvidence)));
            return draft;
          }, (category, draft) => textSources.some(source => {
            const match = recognition.matchQuote(source.text, category.evidence);
            return match && supportsWeight(category, match[0], draft.categories);
          }), signal, message);
          const found = locations.discover(sources);
          const readable = sources.some((source)=>source.text.trim() || source.links?.length);
          for (const category of result.categories) {
            const relevant = locations.forCategory(found,category);
            const directions = (category.gradeDirections || []).filter((direction)=>!readable || relevant.some((source)=>!source.url && source.quote.replace(/\s+/g," ").includes(direction.quote.replace(/\s+/g," "))));
            category.gradeDirections = [...relevant.filter((link)=>!link.url).map(locations.normalizeDirection),...directions].filter((value,index,array)=>array.findIndex((other)=>other.quote===value.quote)===index).slice(0,5).map((value)=>({...value,sourceName:file.name}));
            const extracted = (category.gradeLinks || []).filter((link)=>!readable || relevant.some((candidate)=>candidate.url === link.url));
            const actual = locations.forCategory(found,category).filter((link)=>link.url).map((link)=>locations.normalizeLink(link));
            category.gradeLinks = [...actual, ...extracted].filter((link,index,array)=>array.findIndex((other)=>other.url===link.url)===index).slice(0,5)
              .map((link)=>({...link,sourceName:file.name}));
          }
          return await saveClearRules(userId, courseId, plan, result, file.name, signal);
        }
        const recognizeWith = async selectedModel => recognition.responseText(
          await requestResult(buildRequest(selectedModel), signal, message));
        const useScreenshotModel = screenshotModel !== model;
        const output = await recognizeWith(useScreenshotModel ? screenshotModel : model);
        let result;
        try { result = recognition.parseRecognition(file.kind, output); }
        catch (error) { if (!useScreenshotModel) throw error; }
        if (useScreenshotModel && !result?.rows.some((row) => row.score !== null)) {
          try {
            const detailed = recognition.parseRecognition(file.kind, await recognizeWith(model));
            if (detailed.rows.length || !result) result = detailed;
          } catch (error) {
            if (!result || signal?.aborted) throw error;
          }
        }
        return result;
      } finally { active--; }
    }
  };
}
module.exports = { createGradePlanner };
