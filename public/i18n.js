(function (scope, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory(require("./i18n-en"));
  else scope.StudyBridgeI18n = factory(scope.StudyBridgeEnglish, scope);
})(typeof globalThis === "object" ? globalThis : this, function (english, browser) {
  "use strict";
  const storageKey = "studybridge.interface-language";
  const normalize = (value) => /^zh(?:-|$)/i.test(value || "") ? "zh-CN" : /^en(?:-|$)/i.test(value || "") ? "en" : null;
  function resolveLanguage(saved, languages = []) {
    return normalize(saved) || languages.map(normalize).find(Boolean) || "zh-CN";
  }
  let saved;
  try { saved = browser?.localStorage.getItem(storageKey); } catch {}
  let language = resolveLanguage(saved, browser?.navigator.languages || [browser?.navigator.language]);
  const listeners = new Set();
  const getLanguage = () => language;
  const locale = () => language === "en" ? "en-US" : "zh-CN";
  function text(source) {
    if (language !== "en" || typeof source !== "string") return source;
    const placeholders = [];
    const key = source.trim().replace(/\uE000(\d+)\uE001/g, (token) => `{${placeholders.push(token) - 1}}`);
    if (!Object.hasOwn(english, key)) return source;
    const translated = english[key].replace(/\{(\d+)\}/g, (token, index) => placeholders[index] ?? token);
    return source.slice(0, source.length - source.trimStart().length) + translated + source.slice(source.trimEnd().length);
  }
  function markup(source) {
    return source.replace(/(<[^>]*>)|([^<]+)/g, (token, tag, content) => tag
      ? tag.replace(/\b(title|placeholder|aria-label|alt)="([^"]*)"/g, (_match, name, value) => `${name}="${text(value)}"`)
      : text(content));
  }
  function template(strings, values, translate) {
    const source = strings.reduce((result, part, index) => result + part + (index < values.length ? `\uE000${index}\uE001` : ""), "");
    return translate(source).replace(/\uE000(\d+)\uE001/g, (_token, index) => String(values[index] ?? ""));
  }
  const html = (strings, ...values) => template(strings, values, markup);
  const message = (strings, ...values) => template(strings, values, text);
  function updateDocument() {
    if (!browser?.document) return;
    browser.document.documentElement.lang = language;
    browser.document.querySelectorAll("[data-interface-language]").forEach((select) => { select.value = language; });
  }
  function setLanguage(next, persist = true) {
    if (!["zh-CN", "en"].includes(next)) return false;
    if (persist) { try { browser?.localStorage.setItem(storageKey, next); } catch {} }
    if (next === language) { updateDocument(); return true; }
    language = next;
    updateDocument();
    listeners.forEach((listener) => listener(next));
    return true;
  }
  function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  function bindStatic(container) {
    const bindings = [];
    const originals = new Map(Object.entries(english).map(([source, translation]) => [translation, source]));
    function bind(node, property) {
      const initial = node[property];
      const key = initial.trim();
      const source = Object.hasOwn(english, key) ? initial : originals.has(key) ? initial.replace(key, originals.get(key)) : null;
      if (source === null) return;
      let previous = initial;
      bindings.push(() => {
        if (node[property] !== previous) return;
        previous = text(source);
        node[property] = previous;
      });
    }
    function visit(node) {
      if (node.nodeType === 3) bind(node, "nodeValue");
      if (node.nodeType !== 1 && node !== container) return;
      if (node.matches?.("script, style, textarea, [contenteditable], [data-i18n-skip]")) return;
      for (const attribute of ["title", "placeholder", "aria-label", "alt"]) {
        const value = node.getAttributeNode?.(attribute);
        if (value) bind(value, "value");
      }
      Array.from(node.childNodes).forEach(visit);
    }
    visit(container);
    const update = () => bindings.forEach((binding) => binding());
    update();
    return subscribe(update);
  }
  const selector = () => `<label class="interface-language"><span>${text("界面语言")}</span><select data-interface-language aria-label="${text("界面语言")}"><option value="zh-CN"${language === "zh-CN" ? " selected" : ""}>简体中文</option><option value="en"${language === "en" ? " selected" : ""}>English</option></select></label>`;
  if (browser?.document) {
    updateDocument();
    browser.document.addEventListener("change", (event) => {
      if (event.target.matches?.("[data-interface-language]")) setLanguage(event.target.value);
    });
    browser.addEventListener("storage", (event) => {
      if (event.key === storageKey) setLanguage(resolveLanguage(event.newValue, browser.navigator.languages || [browser.navigator.language]), false);
    });
  }
  return { storageKey, normalize, resolveLanguage, getLanguage, locale, setLanguage, subscribe, text, markup, html, message, selector, bindStatic };
});
