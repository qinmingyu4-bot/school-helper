(function () {
  "use strict";

  const BOOT_VERSION = "1.1.31";
  const BUNDLE_PARTS = Array.from(
    { length: 5 },
    (_, index) => `/app.bundle.gz.b64.${index}?v=${encodeURIComponent(BOOT_VERSION)}`,
  );
  const root = document.getElementById("root");

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
  }

  function showFailure(message) {
    console.error(message);
    if (!root) return;
    root.innerHTML = `
      <div class="boot-screen">
        <div class="brand-mark">SB</div>
        <strong>StudyBridge failed to open</strong>
        <span>${escapeHtml(message)}</span>
      </div>
    `;
  }

  function base64ToBytes(value) {
    const binary = atob(value.trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  async function inflateGzip(bytes) {
    if (!("DecompressionStream" in window)) {
      throw new Error("This browser cannot start StudyBridge. Please update Chrome and try again.");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  }

  async function boot() {
    const responses = await Promise.all(BUNDLE_PARTS.map((url) => fetch(url, { cache: "no-store" })));
    const failed = responses.find((response) => !response.ok);
    if (failed) {
      throw new Error(`Cannot load StudyBridge bundle: HTTP ${failed.status}`);
    }

    const source = await inflateGzip(base64ToBytes((await Promise.all(responses.map((response) => response.text()))).join("")));
    (0, eval)(`${source}\n//# sourceURL=/app.bundle.source.js`);
  }

  boot().catch((error) => showFailure(error && error.message ? error.message : error));
})();
