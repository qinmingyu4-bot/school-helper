(function () {
  "use strict";

  const BOOT_VERSION = "1.1.35";
  const BUNDLE_URL = `/app.bundle.gz.b64?v=${encodeURIComponent(BOOT_VERSION)}`;
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
      <main class="auth-shell">
        <section class="auth-card">
          <div class="brand-row">
            <div class="brand-mark">SB</div>
            <div><span>STUDYBRIDGE CLOUD</span><strong>StudyBridge</strong></div>
          </div>
          <p class="notice"><b>StudyBridge failed to open</b> ${escapeHtml(message)}</p>
          <button class="primary wide" onclick="location.reload()">刷新页面</button>
        </section>
      </main>
    `;
  }

  function base64ToBytes(base64) {
    const clean = String(base64 || "").replace(/\s+/g, "");
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function inflateGzip(bytes) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Your browser does not support the StudyBridge bundle loader. Please update Chrome.");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  }

  async function boot() {
    const response = await fetch(BUNDLE_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Cannot load StudyBridge bundle: HTTP ${response.status}`);
    const source = await inflateGzip(base64ToBytes(await response.text()));
    (0, eval)(`${source}\n//# sourceURL=/app.bundle.source.js`);
  }

  boot().catch((error) => showFailure(error && error.message ? error.message : error));
})();
