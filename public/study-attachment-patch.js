(() => {
  if (window.__studybridgeStudyAttachmentPatch) return;
  window.__studybridgeStudyAttachmentPatch = true;

  const MAX_ATTACHMENTS = 8;
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const MAX_TEXT_BYTES = 600 * 1024;
  const attachments = [];

  function installStyle() {
    if (document.querySelector("#studybridge-study-attachment-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-study-attachment-style";
    style.textContent = `
      #chatForm.study-attachment-ready {
        grid-template-columns: 44px minmax(0, 1fr) 86px;
      }

      #chatForm.study-attachment-ready #messageInput {
        grid-column: 2;
      }

      #chatForm.study-attachment-ready #sendButton {
        grid-column: 3;
      }

      .study-attachment-button {
        grid-column: 1;
        width: 44px;
        height: 52px;
        border: 1px solid #ccd7e5;
        border-radius: 8px;
        background: #fff;
        color: #0b3269;
        cursor: pointer;
        font-size: 24px;
        font-weight: 800;
        line-height: 1;
      }

      .study-attachment-button:hover,
      #chatForm.study-drag-over .study-attachment-button {
        border-color: #2f7d68;
        color: #2f7d68;
      }

      .study-attachment-tray {
        display: none;
        grid-column: 1 / -1;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        min-height: 0;
        padding: 0;
      }

      .study-attachment-tray.has-attachments {
        display: flex;
        padding-bottom: 2px;
      }

      .study-attachment-chip {
        display: inline-grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        max-width: min(340px, 100%);
        min-height: 34px;
        padding: 6px 8px;
        border: 1px solid #cbd8e8;
        border-radius: 8px;
        background: #fff;
        color: #123260;
        font-size: 12px;
      }

      .study-attachment-chip img {
        width: 24px;
        height: 24px;
        object-fit: cover;
        border-radius: 5px;
      }

      .study-attachment-chip strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .study-attachment-chip span {
        color: #5a6b84;
      }

      .study-attachment-chip button {
        border: 0;
        background: transparent;
        color: #5a6b84;
        cursor: pointer;
        font-size: 16px;
      }

      #chatForm.study-drag-over {
        outline: 2px dashed #2f7d68;
        outline-offset: -8px;
      }

      @media (max-width: 560px) {
        #chatForm.study-attachment-ready {
          grid-template-columns: 44px 1fr;
        }

        #chatForm.study-attachment-ready #messageInput {
          grid-column: 2;
        }

        #chatForm.study-attachment-ready #sendButton {
          grid-column: 1 / -1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function fileKind(file) {
    const name = String(file.name || "").toLowerCase();
    const type = file.type || "";
    if (type.startsWith("image/")) return "image";
    if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
    if (/\.(docx?|pptx?|xlsx?)$/i.test(name)) return "office";
    if (type.startsWith("text/") || /\.(txt|md|csv|json|js|ts|tsx|jsx|py|java|cpp|c|h|html|css|xml|yaml|yml|log)$/i.test(name)) return "text";
    return "file";
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("File read failed."));
      reader.readAsDataURL(file);
    });
  }

  function readAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("File read failed."));
      reader.readAsText(file);
    });
  }

  function setStatus(message) {
    if (typeof window.setStatus === "function") {
      window.setStatus(message);
      return;
    }
    const statusLine = document.querySelector("#statusLine");
    if (statusLine) statusLine.textContent = message;
  }

  function safeAttachmentForServer(item) {
    return {
      name: item.name,
      mime: item.mime,
      size: item.size,
      kind: item.kind,
      dataUrl: item.dataUrl || "",
      text: item.text || ""
    };
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderTray() {
    const tray = document.querySelector("#studyAttachmentTray");
    if (!tray) return;
    tray.classList.toggle("has-attachments", attachments.length > 0);
    tray.innerHTML = attachments
      .map((item) => {
        const thumb = item.kind === "image" && item.dataUrl ? `<img src="${item.dataUrl}" alt="" />` : `<span>${item.kind.toUpperCase()}</span>`;
        return `
          <div class="study-attachment-chip" data-attachment-id="${item.id}">
            ${thumb}
            <strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong>
            <span>${formatBytes(item.size)}</span>
            <button type="button" aria-label="Remove attachment" data-remove-attachment="${item.id}">x</button>
          </div>
        `;
      })
      .join("");
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const remaining = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    if (!remaining) {
      setStatus("You can attach up to 8 files at a time.");
      return;
    }

    for (const file of files.slice(0, remaining)) {
      if (file.size > MAX_FILE_BYTES) {
        setStatus(`${file.name} is too large. Please use files under 8 MB.`);
        continue;
      }

      const kind = fileKind(file);
      const item = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name || `pasted-${kind}`,
        mime: file.type || "application/octet-stream",
        size: file.size,
        kind
      };

      try {
        if (kind === "text" && file.size <= MAX_TEXT_BYTES) {
          item.text = await readAsText(file);
        } else {
          item.dataUrl = await readAsDataUrl(file);
        }
        attachments.push(item);
      } catch (error) {
        setStatus(`${file.name} could not be read: ${error.message || "unknown error"}`);
      }
    }

    renderTray();
    document.querySelector("#messageInput")?.focus();
    if (files.length > remaining) setStatus("Some files were skipped because the limit is 8 attachments.");
  }

  function installUi() {
    installStyle();
    const form = document.querySelector("#chatForm");
    const input = document.querySelector("#messageInput");
    if (!form || !input || form.dataset.attachmentReady === "true") return;
    form.dataset.attachmentReady = "true";
    form.classList.add("study-attachment-ready");

    const fileInput = document.createElement("input");
    fileInput.id = "studyAttachmentInput";
    fileInput.type = "file";
    fileInput.multiple = true;
    fileInput.accept = "*/*";
    fileInput.hidden = true;

    const button = document.createElement("button");
    button.id = "studyAttachmentButton";
    button.className = "study-attachment-button";
    button.type = "button";
    button.title = "Upload screenshots, images, PDF, Word, PPT, Excel, or other files";
    button.textContent = "+";

    const tray = document.createElement("div");
    tray.id = "studyAttachmentTray";
    tray.className = "study-attachment-tray";

    form.insertBefore(tray, input);
    form.insertBefore(fileInput, input);
    form.insertBefore(button, input);

    button.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      await addFiles(fileInput.files);
      fileInput.value = "";
    });

    tray.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-remove-attachment]");
      if (!removeButton) return;
      const index = attachments.findIndex((item) => item.id === removeButton.dataset.removeAttachment);
      if (index !== -1) attachments.splice(index, 1);
      renderTray();
    });

    ["dragenter", "dragover"].forEach((type) => {
      form.addEventListener(type, (event) => {
        if (!hasTransferFiles(event.dataTransfer)) return;
        event.preventDefault();
        form.classList.add("study-drag-over");
      });
    });

    ["dragleave", "drop"].forEach((type) => {
      form.addEventListener(type, () => form.classList.remove("study-drag-over"));
    });

    form.addEventListener("drop", async (event) => {
      const files = filesFromTransfer(event.dataTransfer);
      if (!files?.length) return;
      event.preventDefault();
      await addFiles(files);
    });

    input.addEventListener("paste", async (event) => {
      const files = Array.from(event.clipboardData?.files || []);
      if (!files.length) return;
      await addFiles(files);
    });
  }

  function filesFromTransfer(dataTransfer) {
    const direct = Array.from(dataTransfer?.files || []).filter(Boolean);
    if (direct.length) return direct;
    return Array.from(dataTransfer?.items || [])
      .map((item) => (item.kind === "file" && typeof item.getAsFile === "function" ? item.getAsFile() : null))
      .filter(Boolean);
  }

  function hasTransferFiles(dataTransfer) {
    return Array.from(dataTransfer?.types || []).includes("Files") || Array.from(dataTransfer?.items || []).some((item) => item.kind === "file") || Boolean(dataTransfer?.files?.length);
  }

  async function api(path, options = {}) {
    if (typeof window.api === "function") return window.api(path, options);
    const response = await fetch(path, {
      method: options.method || "GET",
      headers: options.body ? { "content-type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed.");
    return payload;
  }

  function activeCourse() {
    return typeof window.activeCourse === "function" ? window.activeCourse() : null;
  }

  function attachmentLabel() {
    if (!attachments.length) return "";
    return "\n\nAttachments:\n" + attachments.map((item) => `- ${item.name} (${item.kind}, ${formatBytes(item.size)})`).join("\n");
  }

  async function submitWithAttachments(event) {
    if (event.target?.id !== "chatForm") return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const course = activeCourse();
    const messageInput = document.querySelector("#messageInput");
    const sendButton = document.querySelector("#sendButton");
    const modeSelect = document.querySelector("#modeSelect");
    const message = (messageInput?.value || "").trim();

    if (!course) {
      setStatus("Please create or select a course before sending.");
      messageInput?.focus();
      return;
    }

    if (!message && !attachments.length) return;

    const question = message || "Please analyze the attached file(s).";
    const outgoingAttachments = attachments.map(safeAttachmentForServer);
    const userDisplay = `${question}${attachmentLabel()}`;

    if (messageInput) messageInput.value = "";
    if (sendButton) sendButton.disabled = true;
    if (typeof window.appendMessage === "function") {
      window.appendMessage({ role: "user", content: userDisplay });
      window.appendMessage({ role: "assistant", content: "Reading attachment(s) and thinking..." }, "pending");
    }

    try {
      const result = await api(`/api/courses/${course.id}/chat`, {
        method: "POST",
        body: {
          message: question,
          mode: modeSelect?.value || "guided",
          attachments: outgoingAttachments
        }
      });
      attachments.splice(0, attachments.length);
      renderTray();
      if (window.state?.messages && Array.isArray(result.messages)) window.state.messages.push(...result.messages);
      if (typeof window.loadMessages === "function") await window.loadMessages(course.id);
      setStatus("Message and attachment(s) saved.");
      if (typeof window.maybeRefreshAdmin === "function") await window.maybeRefreshAdmin();
    } catch (error) {
      if (typeof window.removePending === "function") window.removePending();
      if (typeof window.appendMessage === "function") window.appendMessage({ role: "assistant", content: error.message });
      setStatus(error.message);
    } finally {
      if (sendButton) sendButton.disabled = false;
    }
  }

  function boot() {
    installUi();
  }

  document.addEventListener("submit", submitWithAttachments, true);
  document.addEventListener("DOMContentLoaded", boot);
  boot();
  new MutationObserver(boot).observe(document.body, { childList: true, subtree: true });
})();
