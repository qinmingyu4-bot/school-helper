// Search every saved source, retaining complete small corpora and selecting
// relevant passages from larger ones within an explicit prompt budget.
const stopWords = new Set("the and for with this that from into have what which how explain please using about these those lecture notes course material question answer help teach 解释 请问 帮我 怎么 什么 如何 这个 这些 讲义 资料 课程".split(" "));
const normalize = (text) => String(text || "").normalize("NFKC").toLowerCase().replace(/[‐‑–—-]/g, " ").replace(/\s+/g, " ");
function terms(text) {
  const value = normalize(text);
  const result = value.match(/[a-z0-9_]{2,}/g) || [];
  for (const run of value.match(/[\u3400-\u9fff]+/g) || []) {
    if (run.length === 1) result.push(run);
    for (let i = 0; i < run.length - 1; i++) result.push(run.slice(i, i + 2));
  }
  return [...new Set(result)].filter((term) => !stopWords.has(term));
}

function materialSources(documents = [], attachments = []) {
  return [
    ...documents.map((doc) => ({ name: doc.title, text: doc.text || "", origin: "Course material" })),
    ...attachments.filter((item) => item.kind !== "image").map((item) => ({ name: item.name, text: item.text || "", origin: "Chat attachment" }))
  ];
}
const render = (source, text, range = "complete extracted text") => `Source: ${source.name} | ${source.origin} | ${range}\n${text}`;
function materialContextNeedsRetrieval({ documents = [], attachments = [], budget = 60000 }) {
  return materialSources(documents, attachments).reduce((size, source) => size + render(source, source.text).length + 2, -2) > budget;
}

function buildMaterialContext({ documents = [], attachments = [], currentAttachments = [], history = [], message = "", searchQueries = [], budget = 60000 }) {
  const sources = materialSources(documents, attachments);
  const complete = sources.map((source) => render(source, source.text)).join("\n\n");
  if (complete.length <= budget) return complete;

  const direct = terms(message);
  const previous = terms(history.filter((item) => item.role === "user").slice(-3).map((item) => item.content).join(" "));
  // Generated alternatives affect ranking only; they never become source evidence.
  const alternatives = Array.isArray(searchQueries) ? searchQueries.filter((query) => typeof query === "string").slice(0, 8).map((query) => normalize(query.slice(0, 160)).trim()).filter(Boolean) : [];
  const phrases = alternatives.filter((query) => terms(query).length > 1);
  const weights = new Map();
  for (const [list, weight] of [[previous, 0.5], [alternatives.flatMap(terms), 2], [direct, 4]]) {
    for (const term of list) weights.set(term, Math.max(weights.get(term) || 0, weight));
  }
  const chunks = [];
  const frequencies = new Map();
  sources.forEach((source, sourceIndex) => {
    const titleTokens = new Set(terms(source.name).filter((term) => weights.has(term)));
    for (let start = 0; start < source.text.length; start += 2200) {
      const text = source.text.slice(start, start + 2400);
      // Retain only query terms, rather than a full in-memory vocabulary per chunk.
      const tokens = new Set(terms(text).filter((term) => weights.has(term)));
      for (const term of tokens) frequencies.set(term, (frequencies.get(term) || 0) + 1);
      chunks.push({ source, sourceIndex, start, text, tokens, titleTokens, lower: normalize(text) });
      if (start + 2400 >= source.text.length) break;
    }
  });
  const rarity = new Map([...weights.keys()].map((term) => [term, 1 + Math.log(1 + chunks.length / (1 + (frequencies.get(term) || 0)))]));
  for (const chunk of chunks) {
    chunk.score = 0;
    for (const term of chunk.tokens) chunk.score += weights.get(term) * rarity.get(term);
    for (const term of chunk.titleTokens) chunk.score += 1.5 * weights.get(term) * rarity.get(term);
    // Reward exact multiword alternatives as well as individual matching words.
    for (const query of phrases) if (chunk.lower.includes(query)) chunk.score += 12;
  }
  chunks.sort((a, b) => b.score - a.score || a.sourceIndex - b.sourceIndex || a.start - b.start);
  const picked = new Set();
  const selected = [];
  let used = 0;
  const completeSources = new Set();
  // A new upload is the task's immediate source, not background to lose behind old notes.
  for (const source of sources) {
    if (!currentAttachments.some((item) => item.name === source.name && item.text === source.text)) continue;
    const entry = render(source, source.text);
    if (used + entry.length + 2 > budget) continue;
    completeSources.add(source);
    selected.push({ chunk: { sourceIndex: sources.indexOf(source), start: 0 }, entry });
    used += entry.length + 2;
  }
  const add = (chunk) => {
    const entry = render(chunk.source, chunk.text, `characters ${chunk.start + 1}-${chunk.start + chunk.text.length} of ${chunk.source.text.length}`);
    if (completeSources.has(chunk.source) || picked.has(chunk) || used + entry.length + 2 > budget) return;
    picked.add(chunk);
    selected.push({ chunk, entry });
    used += entry.length + 2;
  };
  // Reserve the strongest matches first so a late source cannot be crowded out
  // by an arbitrarily large collection of unrelated documents.
  for (const chunk of chunks.slice(0, 5)) if (chunk.score > 0) add(chunk);
  // Then diversify across sources before filling the remaining budget.
  for (let index = 0; index < sources.length; index++) {
    const best = chunks.find((chunk) => chunk.sourceIndex === index);
    if (best) add(best);
  }
  // Broad reviews also sample the middle/end rather than exhausting the start.
  const broad = /summary|summari|review|entire|all |overview|cheatsheet|\bend\b|总结|汇总|全部|整份|复习|概览|末尾|后半|最后/i.test(message);
  if (broad) for (let index = 0; index < sources.length; index++) {
    const ordered = chunks.filter((chunk) => chunk.sourceIndex === index).sort((a, b) => a.start - b.start);
    if (ordered.length) { add(ordered.at(-1)); add(ordered[Math.floor(ordered.length / 2)]); }
  }
  for (const chunk of chunks) add(chunk);
  selected.sort((a, b) => a.chunk.sourceIndex - b.chunk.sourceIndex || a.chunk.start - b.chunk.start);
  return `Passages retrieved from ALL ${sources.length} saved sources. This is a selection, not the complete corpus. Do not claim exhaustive coverage.\n`
    + selected.map((item) => item.entry).join("\n\n");
}

function selectStudyVisuals(attachments, message, currentAttachments = []) {
  const eligible = (item) => (item.kind === "image" && /^data:image\//i.test(item.dataUrl || "")) ||
    (item.kind === "pdf" && /^data:application\/pdf;base64,JVBERi0[A-Za-z0-9+/=]*$/i.test(item.dataUrl || ""));
  const available = attachments.filter(eligible);
  const current = available.filter((item) => currentAttachments.some((fresh) => fresh.kind === item.kind && fresh.name === item.name && fresh.dataUrl === item.dataUrl));
  const named = available.filter((item) => String(message).toLowerCase().includes(item.name.toLowerCase()));
  const seen = new Set();
  let bytes = 0;
  return [...current.reverse(), ...named.reverse(), ...available.slice(-8).reverse()].filter((item) => {
    const key = item.kind + ":" + item.name + ":" + item.dataUrl;
    if (seen.has(key) || bytes + item.dataUrl.length > 32 * 1024 * 1024) return false;
    seen.add(key);
    bytes += item.dataUrl.length;
    return true;
  }).slice(0, 8);
}

function selectImages(attachments, message) {
  const images = attachments.filter((item) => item.kind === "image" && item.dataUrl);
  const named = images.filter((item) => String(message).toLowerCase().includes(item.name.toLowerCase()));
  let bytes = 0;
  return [...new Set([...named.reverse(), ...images.slice(-8).reverse()])].filter((item) => {
    if (bytes + item.dataUrl.length > 32 * 1024 * 1024) return false;
    bytes += item.dataUrl.length;
    return true;
  }).slice(0, 8);
}

module.exports = { buildMaterialContext, materialContextNeedsRetrieval, selectImages, selectStudyVisuals };
