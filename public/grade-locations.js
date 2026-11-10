(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeGradeLocations = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const groups = {
    homework: /\b(?:homeworks?|assignments?|problem\s*sets?)\b|作业|习题集/i,
    quiz: /\bquizz?(?:es)?\b|小测|随堂测/i,
    midterm: /\bmid[\s-]?terms?\b|期中/i,
    final: /\bfinal\s+(?:exams?|examinations?|tests?)\b|期末/i,
    lab: /\blabs?\b|实验/i,
    project: /\bprojects?\b|项目|课程设计/i,
    participation: /\bparticipation\b|课堂参与/i
  };
  const names = (text) => Object.entries(groups).filter(([, re]) => re.test(text)).map(([key]) => key);
  function safeUrl(value) {
    if (typeof value !== "string" || value.length > 2000 || /[\s\x00-\x1f\x7f\\]/.test(value.trim())) return "";
    const raw = value.trim();
    try {
      const url = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw);
      return ["http:", "https:"].includes(url.protocol) && url.hostname && !url.username && !url.password ? url.href : "";
    } catch { return ""; }
  }
  function normalizeDirection(value) {
    const quote = typeof value?.quote === "string" ? value.quote.trim().slice(0,800) : "";
    return quote ? {url:"",label:"",quote,sourceName:typeof value.sourceName === "string" ? value.sourceName.slice(0,160) : "",page:Number.isInteger(value.page) && value.page>0 && value.page<=100000 ? value.page : null,origin:"syllabus"} : null;
  }
  function normalizeLink(link, origin = "syllabus") {
    const url = safeUrl(link?.url);
    if (!url) return null;
    const str = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
    return { url, label: str(link.label, 120), quote: str(link.quote || link.evidence, 800), sourceName: str(link.sourceName, 160),
      page: Number.isInteger(link.page) && link.page > 0 && link.page <= 100000 ? link.page : null, origin: origin === "manual" ? "manual" : "syllabus" };
  }
  function purpose(context, url = "") {
    if (/\b(?:no longer|do not|don't|never|not available)\b|不再|不要|并非|不能在/.test(context.toLowerCase())) return false;
    const grade = /\b(?:grades?|scores?|marks?|gradebook)\b|成绩|分数|得分/i.test(context) || /\bresults?\b/i.test(context) && names(context).length > 0;
    const view = /\b(?:posted|published|released|available|view(?:ed|ing)?|check(?:ed|ing)?|find|found|access(?:ed)?|see|review(?:ed)?|returned|recorded|gradebook)\b|查询|查看|公布|发布|查阅|成绩簿|可以.*找到/i.test(context);
    const gradePath = /\/(?:gradebook|grades|scores|results)(?:[/?#]|$)/i.test(url);
    const label = /\b(?:grades?|scores?|marks?|results?)\s*(?:[:：→]|link\b)|(?:成绩|分数)(?:查询)?[：:链接]/i.test(context) && !/\d(?:[.,]\d+)?\s*%/.test(context);
    return grade && (view || label) || gradePath;
  }
  function discover(sources) {
    const results = [], seen = new Set();
    const add = (source, url, context, page, label = "") => {
      if (!purpose(context, url)) return;
      const key = JSON.stringify([source.documentId || source.title, url, context]);
      if (seen.has(key)) return;
      seen.add(key);
      const categories = names(context.replace(/(?:https?:\/\/|www\.)[^\s<>"'`]+/gi,""));
      results.push({ url, label: label.slice(0,120), quote: context.trim().slice(0,800), sourceName:String(source.title || "").slice(0,160),
        documentId:source.documentId || "", page: Number.isInteger(page) && page > 0 ? page : null, categories,
        general: categories.length === 0, origin:"material" });
    };
    for (const source of sources) {
      const text = String(source.text || "");
      const pageAt = (position) => source.sourcePages?.find((p) => Number.isInteger(p.page) && p.start <= position && p.end > position && p.end <= text.length)?.page;
      for (const match of text.matchAll(/(?:https?:\/\/|www\.)[^\s<>"'`]+/gi)) {
        let raw = match[0].replace(/&amp;/g,"&").replace(/[.,;:!?，。；：！？、）\]}>]+$/g,"");
        while (raw.endsWith(")") && (raw.match(/\)/g)||[]).length > (raw.match(/\(/g)||[]).length) raw = raw.slice(0,-1);
        const url = safeUrl(raw); if (!url) continue;
        const from = text.lastIndexOf("\n", match.index) + 1, next = text.indexOf("\n",match.index), to = next < 0 ? text.length : next;
        let context = text.slice(from,to).trim();
        if (!purpose(context,url) && !context.replace(match[0],"").trim()) {
          const previous = text.lastIndexOf("\n",Math.max(0,from-2)) + 1;
          if (from > 0 && text.slice(previous,from).trim()) context = text.slice(previous,to).trim();
        }
        add(source,url,context,pageAt(match.index));
      }
      for (const link of source.links || []) {
        const url = safeUrl(link.url); if (!url) continue;
        add(source,url,String(link.context || link.quote || link.label || ""),link.page,String(link.label || ""));
      }
      // Keep useful navigation instructions when a source names a location but gives no URL.
      for (const match of text.matchAll(/[^\n]+/g)) {
        const line = match[0].trim();
        if (line.length <= 800 && !/(?:https?:\/\/|www\.)/i.test(line) && purpose(line) && /\b(?:on|in|under|through|via|at)\b|在|进入|前往/i.test(line)) add(source,"",line,pageAt(match.index));
      }
    }
    return results;
  }
  function forCategory(locations, category) {
    const name = String(category?.name || category || "");
    const keys = names(name === "Final" ? "Final exam" : name);
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const exact = name && new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`,"iu");
    const seen = new Set();
    return locations.filter((link) => {
      const match = link.general || link.categories?.some((key) => keys.includes(key)) || exact && exact.test(link.quote);
      const key = `${link.url}\n${link.sourceName}\n${link.page || ""}\n${link.url ? "" : link.quote}`;
      if (!match || seen.has(key)) return false;
      seen.add(key); return true;
    }).sort((a,b) => Number(a.general)-Number(b.general));
  }
  return { safeUrl, normalizeLink, normalizeDirection, discover, forCategory };
});
