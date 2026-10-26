(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeClipboard = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  async function copyText(text, environment = globalThis) {
    try {
      if (environment.navigator?.clipboard?.writeText) {
        await environment.navigator.clipboard.writeText(text);
        return;
      }
    } catch { /* HTTP sites and denied clipboard permissions need the selection fallback. */ }

    const doc = environment.document;
    if (!doc?.body || typeof doc.execCommand !== "function") throw new Error("复制失败，请选中文字后手动复制。");
    const active = doc.activeElement;
    const fieldSelection = typeof active?.selectionStart === "number"
      ? { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection } : null;
    const selection = doc.getSelection?.();
    const ranges = [];
    for (let i = 0; i < (selection?.rangeCount || 0); i++) ranges.push(selection.getRangeAt(i).cloneRange());
    const field = doc.createElement("textarea");
    field.value = text;
    field.readOnly = true;
    field.tabIndex = -1;
    field.setAttribute("aria-hidden", "true");
    field.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none;font-size:16px";
    try {
      doc.body.appendChild(field);
      field.focus({ preventScroll: true });
      field.select();
      field.setSelectionRange(0, text.length);
      if (!doc.execCommand("copy")) throw new Error("Copy rejected");
    } catch {
      throw new Error("复制失败，请选中文字后手动复制。");
    } finally {
      field.remove();
      active?.focus?.({ preventScroll: true });
      if (fieldSelection) active.setSelectionRange(fieldSelection.start, fieldSelection.end, fieldSelection.direction);
      if (selection && ranges.length) {
        selection.removeAllRanges();
        for (const range of ranges) selection.addRange(range);
      }
    }
  }
  return { copyText };
});
