"use strict";
const crypto = require("node:crypto");
const { renderSource, lineStarts } = require("./study-citations");
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const stop = new Set("the and for with this that from what which how explain please course lecture notes material question answer 解释 帮我 什么 怎么 课程 资料 题目".split(" "));
function terms(text) {
  const normalized = String(text || "").normalize("NFKC").toLowerCase();
  const words = normalized.match(/[a-z0-9_]{2,}/g) || [];
  for (const run of normalized.match(/[\u3400-\u9fff]+/g) || []) for (let i = 0; i < run.length - 1; i++) words.push(run.slice(i, i + 2));
  return [...new Set(words)].filter((word) => !stop.has(word));
}
function revision(source) { return digest([source.text || "", source.sourcePages || [], source.name]); }
function createStudyIndex({ db, maxCacheBytes = 4 * 1024 * 1024, now = Date.now }) {
  const cache = new Map(), building = new Map(); let cacheBytes = 0;
  const materialId = (source) => `STUDYINDEX#${digest(source.id)}#${revision(source)}`;
  const invalidate = (userId, courseId) => {
    const prefix = JSON.stringify([userId, courseId]);
    for (const [key, item] of cache) if (item.scope === prefix) { cacheBytes -= item.bytes; cache.delete(key); }
  };
  async function prepare(userId, courseId, source) {
    const id = materialId(source), key = JSON.stringify([userId, courseId, id]);
    if (building.has(key)) return building.get(key);
    const work = (async () => {
      const saved = await db.readMaterial(userId, courseId, id).catch((error) => { if (/material is missing/i.test(error.message)) return null; throw error; });
      if (saved?.revision === revision(source)) return saved;
      const text = source.text || "", chunks = [], postings = Object.create(null);
      for (let start = 0; start < text.length; start += 1400) {
        const excerpt = text.slice(start, start + 1600), index = chunks.length;
        chunks.push({ start, end: start + excerpt.length, text: excerpt });
        for (const term of terms(excerpt)) (postings[term] ||= []).push(index);
        if (index % 128 === 0) await new Promise((resolve) => setImmediate(resolve));
        if (start + 1600 >= text.length) break;
      }
      const result = { version: 1, revision: revision(source), name: source.name, sourcePages: source.sourcePages || [], chunks, postings };
      if (source.id.startsWith("doc:") && db.listDocuments) {
        const doc = (await db.listDocuments(userId, courseId)).find((doc) => `doc:${doc.id}` === source.id);
        if (!doc || revision({ name: doc.title, text: doc.text, sourcePages: doc.sourcePages }) !== result.revision) throw new Error("Source changed during indexing.");
      }
      await db.writeMaterial(userId, courseId, id, result);
      if (db.pruneMaterialRevisions) await db.pruneMaterialRevisions(userId, courseId, `STUDYINDEX#${digest(source.id)}#`, id);
      return result;
    })();
    building.set(key, work);
    try { return await work; } finally { building.delete(key); }
  }
  async function retrieve(userId, courseId, sources, question, alternatives = [], { limit = 6, referencePrefix = "S", prepared } = {}) {
    const key = digest([userId, courseId, sources.map((source) => [source.id, revision(source)]), question, alternatives, limit, referencePrefix]);
    const hit = cache.get(key);
    if (hit && hit.until > now()) { cache.delete(key); cache.set(key, hit); return structuredClone(hit.value); }
    if (hit) { cacheBytes -= hit.bytes; cache.delete(key); }
    const weights = new Map();
    for (const term of alternatives.flatMap(terms)) weights.set(term, 1);
    for (const term of terms(question)) weights.set(term, 2);
    const ranked = [];
    for (const source of sources) {
      const index = prepared?.get(source.id) || await prepare(userId, courseId, source), scores = new Map(), title = new Set(terms(source.name));
      for (const [term, weight] of weights) {
        const matches = Object.hasOwn(index.postings, term) ? index.postings[term] : [], rarity = 1 + Math.log(1 + index.chunks.length / (1 + matches.length));
        for (const number of matches) scores.set(number, (scores.get(number) || 0) + weight * rarity);
        if (title.has(term)) for (let number = 0; number < index.chunks.length; number++) scores.set(number, (scores.get(number) || 0) + weight);
      }
      for (const [number, score] of scores) if (score > 0) ranked.push({ source, chunk: index.chunks[number], score });
    }
    ranked.sort((a, b) => b.score - a.score || a.source.id.localeCompare(b.source.id) || a.chunk.start - b.chunk.start);
    const selected = [];
    for (const item of ranked) {
      if (selected.some((old) => old.source.id === item.source.id && Math.abs(old.chunk.start - item.chunk.start) < 1400)) continue;
      selected.push(item); if (selected.length >= limit) break;
    }
    const result = selected.map(({ source, chunk }, index) => {
      const pages = (source.sourcePages || []).filter((page) => page.start < chunk.end && page.end > chunk.start).map((page) => page.page);
      const before = lineStarts(source.text.slice(0, chunk.start)).length, lines = before + (chunk.text.match(/\n/g) || []).length;
      const ref = `${referencePrefix}${index + 1}`;
      return { ref, sourceId: source.id, revision: revision(source), name: source.name, kind: source.kind, materialId: source.materialId, attachmentIndex: source.attachmentIndex,
        pages, start: chunk.start, end: chunk.end, location: pages.length ? `PDF 第 ${pages.join("、")} 页` : `提取文本第 ${before}–${lines} 行（字符 ${chunk.start + 1}–${chunk.end}）`,
        text: chunk.text, context: renderSource({ ...source, reference: ref, origin: "Course source" }, chunk.text, "retrieved passage", chunk.start) };
    });
    const bytes = Buffer.byteLength(JSON.stringify(result));
    if (bytes <= maxCacheBytes) {
      while (cache.size && cacheBytes + bytes > maxCacheBytes) { const oldest = cache.keys().next().value; cacheBytes -= cache.get(oldest).bytes; cache.delete(oldest); }
      cache.set(key, { value: structuredClone(result), bytes, scope: JSON.stringify([userId, courseId]), until: now() + 60000 }); cacheBytes += bytes;
    }
    return result;
  }
  async function retrieveBatch(userId, courseId, sources, questions) {
    // Keep full indexes only during this batch; retain just selected fragments afterward.
    const prepared = new Map();
    for (const source of sources) prepared.set(source.id, await prepare(userId, courseId, source));
    const evidence = {};
    for (const question of questions) evidence[question.id] = await retrieve(userId, courseId, sources, question.text, question.queries, { limit: 4, referencePrefix: `${question.id}.S`, prepared });
    return evidence;
  }
  return { prepare, retrieve, retrieveBatch, invalidate, revision, materialId, cacheSize: () => cacheBytes };
}
module.exports = { createStudyIndex, terms, revision };
