(() => {
  const STYLE_ID = "studybridge-math-readable-patch";
  let frame = 0;

  function installStyle() {
    if (document.querySelector(`#${STYLE_ID}`)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .bubble[data-math-readable="true"] {
        word-break: break-word;
      }
    `;
    document.head.appendChild(style);
  }

  function loadStudentPageShell() {
    const path = "/student-page-shell-fix.js";
    const alreadyLoaded = Array.from(document.scripts).some((script) => {
      const src = script.getAttribute("src");
      return src && new URL(src, location.href).pathname === path;
    });
    if (alreadyLoaded) return;
    const script = document.createElement("script");
    script.src = `${path}?v=20261007-1`;
    script.defer = true;
    document.body.appendChild(script);
  }

  function toReadableMath(value) {
    let text = String(value || "");

    text = text
      .replace(/\r\n/g, "\n")
      .replace(/\\\[/g, "")
      .replace(/\\\]/g, "")
      .replace(/\\\(/g, "")
      .replace(/\\\)/g, "")
      .replace(/\\left\s*/g, "")
      .replace(/\\right\s*/g, "")
      .replace(/\\cdot/g, " * ")
      .replace(/\\times/g, " * ")
      .replace(/\\circ/g, " o ")
      .replace(/\\div/g, " / ")
      .replace(/\\sqrt\s*\{([^{}]+)\}/g, "sqrt($1)")
      .replace(/\\sqrt\s*([A-Za-z0-9]+)/g, "sqrt($1)")
      .replace(/\^\{([^{}]+)\}/g, "^$1")
      .replace(/_\{([^{}]+)\}/g, "_$1")
      .replace(/^\s*#{1,6}\s*/gm, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1");

    for (let index = 0; index < 6; index += 1) {
      const next = text.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)");
      if (next === text) break;
      text = next;
    }

    return text
      .replace(/\\sqrt\s*\{([^{}]+)\}/g, "sqrt($1)")
      .replace(/\\frac/g, "frac")
      .replace(/\\,/g, " ")
      .replace(/\\;/g, " ")
      .replace(/\\:/g, " ")
      .replace(/\\([A-Za-z]+)/g, "$1")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function normalizeBubble(bubble) {
    if (!bubble || bubble.dataset.mathReadable === "true") return;
    const raw = bubble.textContent || "";
    if (!/\\(?:frac|sqrt|cdot|circ|times|left|right)|\\\[|\\\]|\\\(|\\\)|^\s*#{1,6}\s/m.test(raw)) return;
    const readable = toReadableMath(raw);
    if (readable && readable !== raw) {
      bubble.dataset.rawMathText = raw;
      bubble.textContent = readable;
      bubble.dataset.mathReadable = "true";
    }
  }

  function normalizeMessages() {
    installStyle();
    document.querySelectorAll(".message.assistant .bubble").forEach(normalizeBubble);
  }

  function scheduleNormalize() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      normalizeMessages();
    });
  }

  normalizeMessages();
  loadStudentPageShell();
  setTimeout(loadStudentPageShell, 250);
  new MutationObserver(scheduleNormalize).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();
