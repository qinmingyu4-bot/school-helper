(function (global) {
  "use strict";
  function create({ root, window: win = global }) {
    const doc = win.document;
    function resize() {
      const input = root.querySelector("#chatInput");
      if (!input) return;
      const style = win.getComputedStyle(input);
      const minimum = parseFloat(style.minHeight) || 44;
      const maximum = parseFloat(style.maxHeight) || 140;
      const borders = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
      input.style.height = `${minimum}px`;
      const needed = input.scrollHeight + borders;
      input.style.height = `${Math.max(minimum, Math.min(maximum, needed))}px`;
      input.style.overflowY = needed > maximum ? "auto" : "hidden";
    }
    function closeMenus(focus = false) {
      root.querySelectorAll(".quick-prompts-more[open]").forEach((menu) => {
        menu.open = false;
        if (focus) menu.querySelector("summary")?.focus();
      });
    }
    doc.addEventListener("input", (event) => { if (event.target.id === "chatInput") resize(); });
    doc.addEventListener("click", (event) => {
      if (!event.target.closest?.(".quick-prompts-more") || event.target.closest?.(".quick-prompts-more button")) closeMenus();
    });
    doc.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && event.target.closest?.(".quick-prompts-more")) { event.preventDefault(); closeMenus(true); }
    });
    win.addEventListener("resize", resize);
    doc.fonts?.addEventListener("loadingdone", resize);
    return { resize, closeMenus };
  }
  if (typeof module === "object" && module.exports) module.exports = { create };
  else global.StudyBridgeComposer = { create };
})(typeof window === "object" ? window : globalThis);
