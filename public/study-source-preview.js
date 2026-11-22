(function () {
  "use strict";

  const ui = window.StudyBridgeI18n;
  const { locate } = window.StudyBridgeStudyFormulas;
  let active;

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function pdfLines(items) {
    const lines = [];
    let current = null;
    for (const item of items) {
      if (typeof item.str !== "string" || !item.transform) continue;
      const previous = current?.items.at(-1)?.item;
      if (!current || previous.hasEOL || (Math.abs(previous.transform[5] - item.transform[5]) >
          Math.max(2, Math.min(previous.height, item.height) * .7))) {
        current = { text: "", items: [] };
        lines.push(current);
      }
      const start = current.text.length;
      current.text += item.str;
      current.items.push({ start, end: current.text.length, item });
    }
    return lines;
  }

  function markFormula(canvas, viewport, util, text, formulas) {
    if (!text) return null;
    const lines = pdfLines(text.items), match = locate(lines.map(({ text }) => text), formulas);
    if (!match) return null;
    const context = canvas.getContext("2d");
    let top = Infinity;
    for (const { start, end, item } of lines[match.line].items) {
      if (end <= match.start || start >= match.end || !item.width || !item.str.length) continue;
      const transform = util.transform(viewport.transform, item.transform);
      const width = item.width * viewport.scale, height = Math.hypot(transform[2], transform[3]);
      const left = (Math.max(start, match.start) - start) / item.str.length * width;
      const right = (Math.min(end, match.end) - start) / item.str.length * width;
      context.save();
      context.translate(transform[4], transform[5]);
      context.rotate(Math.atan2(transform[1], transform[0]));
      context.fillStyle = "rgba(224, 174, 67, .25)";
      context.fillRect(left - 1, -height * .84, right - left + 2, height * 1.05);
      context.restore();
      top = Math.min(top, transform[5] - height);
    }
    return Number.isFinite(top) ? top : null;
  }

  function appendExcerpt(body, view) {
    if (!view.excerpt) return;
    const lines = view.excerpt.split("\n"), match = locate(lines, view.formulas);
    const quote = element("blockquote", "", "study-source-excerpt");
    if (!match) quote.textContent = view.excerpt;
    else {
      const start = lines.slice(0, match.line).reduce((offset, line) => offset + line.length + 1, 0) + match.start;
      const end = start + match.end - match.start;
      quote.append(view.excerpt.slice(0, start), element("mark", view.excerpt.slice(start, end)), view.excerpt.slice(end));
    }
    body.append(quote);
  }

  function disclosureKey(disclosure) {
    return disclosure.querySelector("a[data-study-source]")?.getAttribute("href");
  }

  function openDisclosures(container) {
    return new Set(Array.from(container?.querySelectorAll(".study-source-disclosure[open]") || [], disclosureKey));
  }

  function restoreDisclosures(container, keys) {
    if (!container || !keys.size) return;
    for (const disclosure of container.querySelectorAll(".study-source-disclosure")) {
      if (keys.has(disclosureKey(disclosure))) disclosure.open = true;
    }
  }

  function open({ href, trigger, api, currentKey }) {
    active?.dialog.close();
    const contextKey = currentKey(), chat = trigger.closest(".chat-area");
    const scrollTop = chat?.scrollTop || 0;
    const anchorTop = trigger.getBoundingClientRect().top;
    const controller = new AbortController();
    const dialog = element("dialog", "", "study-source-dialog");
    dialog.setAttribute("aria-label", ui.text("查看出处原文"));
    const heading = element("header", "", "dialog-heading");
    const title = element("h2", ui.text("查看出处原文"));
    const close = element("button", "×");
    close.type = "button";
    close.setAttribute("aria-label", ui.text("关闭"));
    heading.append(title, close);
    const info = element("div", "", "study-source-info");
    const body = element("div", "", "dialog-body");
    const status = element("p", ui.text("正在加载出处…"), "study-source-status");
    status.setAttribute("role", "status");
    body.append(status);
    dialog.append(heading, info, body);
    let loading, rendering, drawId = 0;
    active = { dialog, contextKey };
    const current = () => active?.dialog === dialog && !controller.signal.aborted && currentKey() === contextKey;

    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener("close", () => {
      controller.abort();
      rendering?.cancel();
      void loading?.destroy().catch(() => {});
      dialog.remove();
      if (active?.dialog !== dialog) return;
      active = null;
      if (currentKey() !== contextKey) return;
      const link = trigger.isConnected ? trigger : Array.from(document.querySelectorAll(".study-workspace a[data-study-source]")).find((node) => node.getAttribute("href") === href);
      const disclosure = link?.closest(".study-source-disclosure");
      if (disclosure) disclosure.open = true;
      const viewport = link?.closest(".chat-area") || chat;
      link?.focus({ preventScroll: true });
      if (viewport?.isConnected) viewport.scrollTop = link ? viewport.scrollTop + link.getBoundingClientRect().top - anchorTop : scrollTop;
    });
    document.body.append(dialog);
    dialog.showModal();
    close.focus({ preventScroll: true });

    async function preview() {
      let view;
      try {
        view = await api(href, { signal: controller.signal });
        if (!current()) return;
        title.textContent = view.name;
        title.title = view.name;
        info.textContent = view.location;
        if (!view.pdf) {
          status.textContent = ui.text("显示资料中的原文片段。");
          appendExcerpt(body, view);
          return;
        }
        const lib = await import("/vendor/pdfjs/pdf.min.mjs");
        if (!current()) return;
        lib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
        const url = new URL(href, location.origin);
        url.searchParams.set("pdf", "1");
        loading = lib.getDocument({ url: url.href, cMapUrl: "/vendor/pdfjs/cmaps/", cMapPacked: true,
          standardFontDataUrl: "/vendor/pdfjs/standard_fonts/", wasmUrl: "/vendor/pdfjs/wasm/" });
        const pdf = await loading.promise;
        if (!current()) return;
        const pages = view.pages.filter((page) => page <= pdf.numPages);
        if (!pages.length) throw new Error(ui.text("引用页在原始 PDF 中不可用。"));
        const firstPage = pages.includes(view.initialPage) ? view.initialPage : pages[0];
        let picker;
        if (pages.length === 1) info.textContent = ui.message`PDF 第 ${firstPage} 页`;
        else {
          picker = element("select");
          const label = element("label", ui.text("原文页码"));
          for (const page of pages) picker.add(new Option(ui.message`PDF 第 ${page} 页`, String(page)));
          picker.value = String(firstPage);
          label.append(picker);
          info.replaceChildren(label);
        }

        async function draw(page) {
          const id = ++drawId;
          rendering?.cancel();
          status.textContent = ui.text("正在打开原文页…");
          body.replaceChildren(status);
          body.scrollTop = 0;
          try {
            const sourcePage = await pdf.getPage(page);
            if (!current() || id !== drawId) return;
            const natural = sourcePage.getViewport({ scale: 1 });
            const width = Math.min(1600, Math.max(640, body.clientWidth * Math.min(window.devicePixelRatio || 1, 2)));
            const viewport = sourcePage.getViewport({ scale: Math.min(width / natural.width, 2200 / natural.height) });
            const canvas = element("canvas", "", "study-source-page");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            canvas.setAttribute("role", "img");
            canvas.setAttribute("aria-label", ui.message`PDF 第 ${page} 页`);
            rendering = sourcePage.render({ canvasContext: canvas.getContext("2d"), viewport });
            const [text] = await Promise.all([
              view.formulas.length ? sourcePage.getTextContent().catch(() => null) : null,
              rendering.promise
            ]);
            if (!current() || id !== drawId) return;
            const top = markFormula(canvas, viewport, lib.Util, text, view.formulas);
            status.textContent = top === null && view.hasFormula ? ui.text("已打开引用页，未能精确定位公式。") : "";
            body.append(canvas);
            if (view.excerpt) {
              const details = element("details", "", "study-source-text");
              details.append(element("summary", ui.text("原文片段")));
              appendExcerpt(details, view);
              body.append(details);
            }
            if (top !== null) {
              const pageRect = canvas.getBoundingClientRect(), bodyRect = body.getBoundingClientRect();
              body.scrollTop = Math.max(0, pageRect.top - bodyRect.top + top * pageRect.height / canvas.height - body.clientHeight * .33);
            }
          } catch (error) {
            if (!current() || id !== drawId) return;
            status.textContent = ui.text("原文页暂时无法打开。");
            appendExcerpt(body, view);
          }
        }

        picker?.addEventListener("change", () => void draw(Number(picker.value)));
        await draw(firstPage);
      } catch (error) {
        if (!current()) return;
        if (view && error.status === 409) status.textContent = ui.text("资料已更新，旧出处无法定位。");
        else {
          status.textContent = view ? ui.text("原始 PDF 暂不可用。") : ui.text(error.message);
          if (view) appendExcerpt(body, view);
        }
      }
    }
    void preview();
  }

  window.StudyBridgeStudySource = {
    open,
    openDisclosures,
    restoreDisclosures,
    isOpen: () => Boolean(active?.dialog.open),
    sync(key) { if (active && active.contextKey !== key) active.dialog.close(); }
  };
})();
