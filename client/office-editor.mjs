import { Editor, Extension } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import StarterKit from "@tiptap/starter-kit";
import {
  TextStyle,
  FontFamily,
  FontSize,
  Color,
  BackgroundColor,
} from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import Model from "../public/office-model.js";
import { calculator, renameFormulaSheet } from "../lib/office-formulas.js";
import { revisionBlocks, revisionEdits } from "../lib/office-revision.js";
const names = { docs: "SB Docs", slides: "SB Slides", sheets: "SB Sheets" };
const formats = { docs: "docx", slides: "pptx", sheets: "xlsx" };
const sessions = new Map();
let mounted = null;
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const uid = () =>
  "office_" +
  (crypto.randomUUID
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join(""));
const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const button = (action, text, extra = "") =>
  `<button type="button" data-office="${action}" ${extra}>${text}</button>`;
const select = (key, label, values, current) =>
  `<label>${label}<select data-setting="${key}">${values
    .map((v) => {
      const [value, text] = Array.isArray(v) ? v : [v, v];
      return `<option value="${esc(value)}" ${String(current) === String(value) ? "selected" : ""}>${esc(text)}</option>`;
    })
    .join("")}</select></label>`;
const fonts = Model.fonts.map((font) => [font, font]);
const paragraphStyle = Extension.create({
  name: "officeParagraph",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) => el.style.lineHeight || null,
            renderHTML: (attrs) =>
              attrs.lineHeight
                ? { style: `line-height:${Number(attrs.lineHeight) || 2}` }
                : {},
          },
        },
      },
    ];
  },
});
const localImage = Image.extend({
  parseHTML() {
    return [
      { tag: 'img[src^="data:image/png;base64,"]' },
      { tag: 'img[src^="data:image/jpeg;base64,"]' },
    ];
  },
}).configure({ allowBase64: true });
let database;
function backupDB() {
  return (database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open("studybridge-office", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
async function backup(action, key, value) {
  const db = await backupDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      "drafts",
      action === "get" ? "readonly" : "readwrite",
    );
    const store = tx.objectStore("drafts");
    const req =
      action === "get"
        ? store.get(key)
        : action === "delete"
          ? store.delete(key)
          : store.put(value, key);
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}
function meta(item) {
  const { model, saving, dirty, edits, conflict, ...rest } = item;
  return rest;
}
class Workspace {
  constructor(ctx, kind) {
    this.ctx = ctx;
    this.kind = kind;
    this.projects = [];
    this.current = null;
    this.ready = false;
    this.undo = [];
    this.redo = [];
    this.aiOpen = false;
    this.aiPrompt = "";
    this.aiResult = null;
    this.aiBusy = false;
    this.aiScope = "document";
    this.slideIndex = 0;
    this.elementId = "";
    this.sheetIndex = 0;
    this.cell = "A1";
  }
  async init() {
    try {
      const result = await this.ctx.api("/api/office");
      this.projects = (result.projects || []).filter(
        (p) => p.kind === this.kind,
      );
      const last = localStorage.getItem(
        `office.last.${this.ctx.userId}.${this.kind}`,
      );
      const selected =
        this.projects.find((p) => p.id === last) || this.projects[0];
      const recovery = await backup("get", this.recoveryKey()).catch(
        () => null,
      );
      if (recovery && recovery.kind === this.kind) {
        recovery.model = Model.normalize(this.kind, recovery.model);
        this.current = recovery;
        this.current.dirty = true;
        const latest = this.projects.find((p) => p.id === recovery.id);
        if (latest && latest.version !== recovery.version) {
          this.current.conflict = true;
          this.status = "恢复了此浏览器的草稿；云端有更新，请另存副本。";
        } else this.status = "已恢复此浏览器的未保存草稿";
      } else if (selected) {
        const { project } = await this.ctx.api("/api/office/" + selected.id);
        this.current = { ...project, dirty: false };
        this.status = "已保存到云端";
      } else this.newProject();
    } catch (error) {
      this.newProject();
      this.status = "暂时无法读取云端作品：" + error.message;
      const recovery = await backup("get", this.recoveryKey()).catch(
        () => null,
      );
      if (recovery) {
        try {
          recovery.model = Model.normalize(this.kind, recovery.model);
          this.current = recovery;
          this.current.dirty = true;
        } catch {
          /* Keep invalid recovery data out of the editor. */
        }
      }
    }
    this.ready = true;
    this.draw();
    if (this.current?.dirty && !this.current.conflict) this.schedule();
  }
  recoveryKey() {
    return `${this.ctx.userId}:${this.kind}`;
  }
  newProject(copy = false) {
    this.capture();
    this.editor?.destroy();
    this.editor = null;
    this.current = {
      id: uid(),
      kind: this.kind,
      name: copy
        ? this.current.name + " 副本"
        : `未命名${{ docs: "文档", slides: "演示", sheets: "表格" }[this.kind]}`,
      version: 0,
      model: copy ? clone(this.current.model) : Model.fresh(this.kind),
      dirty: true,
    };
    this.undo = [];
    this.redo = [];
    this.slideIndex = 0;
    this.sheetIndex = 0;
    this.elementId = "";
    this.cell = "A1";
    this.docSelection = null;
    this.status = "尚未保存";
  }
  async open(id) {
    if (id === this.current?.id || this.switching) return;
    this.switching = true;
    if (this.host) this.host.inert = true;
    try {
      this.capture();
      if (this.current?.dirty) await this.save();
      if (this.current?.dirty)
        throw Error("当前修改尚未保存，请先保存或另存副本。");
      const { project } = await this.ctx.api("/api/office/" + id);
      this.editor?.destroy();
      this.editor = null;
      this.current = { ...project, dirty: false };
      this.undo = [];
      this.redo = [];
      this.slideIndex = 0;
      this.sheetIndex = 0;
      this.cell = "A1";
      this.elementId = "";
      this.docSelection = null;
      this.status = "已保存到云端";
      this.aiResult = null;
      this.draw();
      localStorage.setItem(`office.last.${this.ctx.userId}.${this.kind}`, id);
    } finally {
      this.switching = false;
      if (this.host) this.host.inert = false;
    }
  }
  attach(host, ctx) {
    this.ctx = ctx;
    this.host = host;
    if (!this.ready) {
      host.innerHTML =
        '<div class="office-loading" role="status">正在打开编辑器…</div>';
      if (!this.initializing) this.initializing = this.init();
    } else this.draw();
  }
  capture() {
    if (this.editor && !this.editor.isDestroyed && this.current) {
      this.current.model.content = this.editor.getJSON();
      this.docSelection = {
        from: this.editor.state.selection.from,
        to: this.editor.state.selection.to,
      };
    }
    if (this.host?.isConnected) {
      this.aiPrompt =
        this.host.querySelector("[data-ai-prompt]")?.value || this.aiPrompt;
    }
  }
  detach() {
    this.capture();
    this.editor?.unmount();
    this.presentation?.remove();
    this.presentation = null;
    this.host = null;
  }
  checkpoint() {
    this.capture();
    const snap = JSON.stringify(this.current.model);
    if (this.undo.at(-1) !== snap) this.undo.push(snap);
    while (
      this.undo.length > 25 ||
      this.undo.reduce((n, s) => n + s.length, 0) > 14000000
    )
      this.undo.shift();
    this.redo = [];
  }
  changed() {
    this.current.dirty = true;
    this.current.edits = (this.current.edits || 0) + 1;
    this.status = "未保存的修改";
    this.schedule();
    this.updateStatus();
  }
  schedule() {
    clearTimeout(this.saveTimer);
    const current = this.current;
    this.saveTimer = setTimeout(() => {
      if (this.current === current) void this.save();
    }, 1000);
    void this.storeBackup(current);
  }
  async storeBackup(current) {
    try {
      await backup("put", this.recoveryKey(), {
        ...meta(current),
        dirty: current.dirty,
        model: clone(current.model),
      });
      this.backupError = "";
    } catch {
      this.backupError = "浏览器草稿空间不足，请点击保存或导出。";
      this.updateStatus();
    }
  }
  async save() {
    this.capture();
    clearTimeout(this.saveTimer);
    const current = this.current;
    if (!current?.dirty) return;
    if (current.conflict) {
      this.updateStatus();
      return;
    }
    if (current.saving) {
      await current.saving;
      if (current.dirty && !current.conflict) return this.save();
      return;
    }
    const edits = current.edits || 0;
    let model;
    try {
      model = Model.normalize(this.kind, current.model);
    } catch (error) {
      this.status = error.message;
      this.updateStatus();
      return;
    }
    current.saving = (async () => {
      this.status = "正在保存到云端…";
      this.updateStatus();
      await this.storeBackup(current);
      try {
        const { project } = await this.ctx.api("/api/office/" + current.id, {
          method: "PUT",
          body: {
            ownerId: this.ctx.userId,
            kind: this.kind,
            name: current.name,
            version: current.version,
            model,
          },
        });
        this.backupError = "";
        current.version = project.version;
        current.dirty = (current.edits || 0) !== edits;
        Object.assign(current, {
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        });
        this.projects = [
          project,
          ...this.projects.filter((p) => p.id !== project.id),
        ];
        if (this.current === current) {
          this.status = current.dirty ? "还有修改待保存" : "已保存到云端";
          this.updateProjectPicker();
          localStorage.setItem(
            `office.last.${this.ctx.userId}.${this.kind}`,
            current.id,
          );
          if (current.dirty) this.schedule();
          else await backup("delete", this.recoveryKey()).catch(() => {});
        }
      } catch (error) {
        current.dirty = true;
        if (error.status === 409) current.conflict = true;
        this.status =
          error.status === 409
            ? "云端有更新，请另存副本以保留修改。"
            : "云端保存失败，草稿已保留：" + error.message;
        await this.storeBackup(current);
      } finally {
        current.saving = null;
        this.updateStatus();
      }
    })();
    await current.saving;
  }
  updateStatus() {
    if (!this.host?.isConnected) return;
    const el = this.host.querySelector("[data-save-status]");
    if (el) el.textContent = this.backupError || this.status || "";
    const count = this.host.querySelector("[data-doc-count]");
    if (count && this.editor)
      count.textContent = `${this.editor.getText().length} 字符`;
  }
  updateProjectPicker() {
    const el = this.host?.querySelector("[data-project-picker]");
    if (el) el.innerHTML = this.projectOptions();
  }
  projectOptions() {
    return [
      meta(this.current),
      ...this.projects.filter((p) => p.id !== this.current.id),
    ]
      .map(
        (p) =>
          `<option value="${esc(p.id)}" ${p.id === this.current.id ? "selected" : ""}>${esc(p.name)}</option>`,
      )
      .join("");
  }
  draw() {
    if (!this.host?.isConnected || !this.ready || !this.current) return;
    const scrollState = Array.from(
      this.host.querySelectorAll(".office-doc-scroll,.office-grid-scroll"),
      (el) => [el.className, el.scrollTop, el.scrollLeft],
    );
    this.capture();
    this.editor?.unmount();
    const doc = this.kind === "docs",
      slide = this.kind === "slides";
    this.host.innerHTML = `<div class="office-topbar"><strong>${names[this.kind]}</strong><input class="office-name" data-name aria-label="作品名称" value="${esc(this.current.name)}"><label class="office-project-label">打开作品<select data-project-picker>${this.projectOptions()}</select></label><span class="office-top-actions">${button("new", "新建")}${button("import", "导入 " + formats[this.kind].toUpperCase())}${button("save", "保存")}${button("copy", "另存副本")}${button("export", "导出 " + formats[this.kind].toUpperCase())}${doc ? "" : button("ai", this.aiOpen ? "收起 AI" : "AI 辅助", 'aria-expanded="' + this.aiOpen + '"')}</span></div>
   ${doc ? this.aiHTML() : ""}
   <div class="office-statusbar"><span data-save-status role="status"></span><span>${doc ? "<span data-doc-count></span>" : slide ? "16:9 · 可编辑文字和图片" : "支持公式与跨工作表引用"}</span></div>
   ${this.current.importWarnings?.length ? `<div class="office-import-notice" role="status">${this.current.importWarnings.map(esc).join(" ")}</div>` : ""}
   <div class="office-layout ${!doc && this.aiOpen ? "with-ai" : ""}"><div class="office-main">${doc ? this.docsHTML() : slide ? this.slidesHTML() : this.sheetsHTML()}</div>${!doc && this.aiOpen ? this.aiHTML() : ""}</div><input data-office-image type="file" accept="image/png,image/jpeg,image/webp" hidden><input data-office-import type="file" accept=".${formats[this.kind]}" hidden>`;
    this.bind();
    if (doc) this.mountDocs();
    if (slide) this.paintSlides();
    if (this.kind === "sheets") this.refreshCells();
    this.updateStatus();
    for (const [className, top, left] of scrollState) {
      const el = this.host.querySelector("." + className);
      if (el) {
        el.scrollTop = top;
        el.scrollLeft = left;
      }
    }
  }
  docsHTML() {
    const s = this.current.model.settings;
    return `<div class="office-toolbar" aria-label="文档排版">${button("undo", "撤销")}${button("redo", "重做")}${select("font", "字体", fonts, s.font)}${select("size", "字号", [10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48], s.size)}${button("bold", "B", 'title="粗体" aria-label="粗体"')}${button("italic", "I", 'title="斜体" aria-label="斜体"')}${button("underline", "U", 'title="下划线" aria-label="下划线"')}${select(
      "block",
      "段落",
      [
        ["paragraph", "正文"],
        ["1", "标题 1"],
        ["2", "标题 2"],
        ["3", "标题 3"],
      ],
      "paragraph",
    )}${select(
      "align",
      "对齐",
      [
        ["left", "左对齐"],
        ["center", "居中"],
        ["right", "右对齐"],
        ["justify", "两端对齐"],
      ],
      "left",
    )}${select(
      "line",
      "行距",
      [
        ["1", "单倍"],
        ["1.15", "1.15 倍"],
        ["1.5", "1.5 倍"],
        ["2", "Double · 双倍"],
        ["3", "3 倍"],
      ],
      s.line,
    )}${button("bullet", "项目符号")}${button("numbered", "编号")}<label>文字色<input data-setting="textColor" type="color" value="#172d42"></label>${button("image", "插入图片")}${button("print", "打印 / PDF")}</div>
  <div class="office-page-settings">${select("paper", "纸张", ["A4", "Letter"], s.paper)}${select(
    "margin",
    "页边距",
    [
      ["15", "15 mm"],
      ["20", "20 mm"],
      ["25.4", "1 英寸"],
      ["30", "30 mm"],
    ],
    s.margin,
  )}<span>可选中文字调整字体、字号；行距作用于当前或选中的段落。</span></div><div class="office-doc-scroll"><article class="office-paper" data-paper><div data-doc-editor></div></article></div>`;
  }
  mountDocs() {
    if (this.editor && !this.editor.isDestroyed) {
      this.editor.mount(this.host.querySelector("[data-doc-editor]"));
      this.paperStyle();
      this.syncDocToolbar();
      return;
    }
    this.editor = new Editor({
      element: this.host.querySelector("[data-doc-editor]"),
      extensions: [
        StarterKit.configure({ link: false, codeBlock: false }),
        TextStyle,
        FontFamily,
        FontSize,
        Color,
        BackgroundColor,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        paragraphStyle,
        localImage,
      ],
      content: this.current.model.content,
      editorProps: {
        attributes: {
          "aria-label": "论文正文",
          "data-placeholder": "从这里开始写作…",
          spellcheck: "true",
        },
      },
      onUpdate: () => {
        this.current.model.content = this.editor.getJSON();
        this.changed();
        if (this.aiResult) this.refreshAI();
      },
      onSelectionUpdate: () => this.syncDocToolbar(),
    });
    if (this.docSelection) {
      try {
        this.editor.commands.setTextSelection(this.docSelection);
      } catch {
        /* A shortened document may no longer contain the old selection. */
      }
    }
    this.paperStyle();
    this.syncDocToolbar();
  }
  paperStyle() {
    const p = this.host?.querySelector("[data-paper]");
    if (!p) return;
    const s = this.current.model.settings;
    Object.assign(p.style, {
      width: s.paper === "Letter" ? "816px" : "794px",
      minHeight: s.paper === "Letter" ? "1056px" : "1123px",
      "--paper-margin": s.margin + "mm",
      fontFamily: s.font,
      fontSize: s.size + "pt",
      lineHeight: String(s.line),
    });
  }
  syncDocToolbar() {
    if (!this.editor || !this.host) return;
    const e = this.editor;
    for (const mark of ["bold", "italic", "underline"])
      this.host
        .querySelector(`[data-office="${mark}"]`)
        ?.setAttribute("aria-pressed", String(e.isActive(mark)));
    const attrs = e.getAttributes("textStyle");
    const values = {
      font: (attrs.fontFamily || this.current.model.settings.font).replaceAll(
        '"',
        "",
      ),
      size: parseFloat(attrs.fontSize) || this.current.model.settings.size,
      line:
        e.getAttributes("paragraph").lineHeight ||
        e.getAttributes("heading").lineHeight ||
        this.current.model.settings.line,
      align:
        e.getAttributes("paragraph").textAlign ||
        e.getAttributes("heading").textAlign ||
        "left",
      block: e.isActive("heading")
        ? String(e.getAttributes("heading").level)
        : "paragraph",
    };
    for (const [key, value] of Object.entries(values)) {
      const el = this.host.querySelector(`[data-setting="${key}"]`);
      if (el && document.activeElement !== el) el.value = String(value);
    }
  }
  slidesHTML() {
    return `<div class="office-toolbar" aria-label="演示工具">${button("undo", "撤销")}${button("redo", "重做")}${button("slide-add", "＋ 新幻灯片")}${button("slide-copy", "复制本页")}${button("slide-up", "上移一页")}${button("slide-down", "下移一页")}${button("slide-delete", "删除本页")}${button("text-add", "插入文字框")}${button("image", "插入图片")}${button("present", "▶ 演示")}</div><div class="office-slides-layout"><nav class="office-thumbnails" aria-label="幻灯片列表"></nav><div class="office-slide-work"><div class="office-stage-wrap"><div class="office-stage" data-stage aria-label="幻灯片画布"></div></div><label class="office-notes">演讲备注<textarea data-notes placeholder="这一页的讲稿与备注"></textarea></label></div><aside class="office-inspector" aria-label="幻灯片属性"></aside></div>`;
  }
  slide() {
    return (
      this.current.model.slides[this.slideIndex] || this.current.model.slides[0]
    );
  }
  element() {
    return this.slide().elements.find((el) => el.id === this.elementId);
  }
  paintSlides() {
    if (!this.host) return;
    this.thumbnails();
    const slide = this.slide(),
      stage = this.host.querySelector("[data-stage]");
    stage.style.background = slide.background;
    stage.innerHTML = slide.elements
      .map(
        (el) =>
          `<div class="office-slide-element ${el.id === this.elementId ? "is-selected" : ""}" data-element="${esc(el.id)}" tabindex="0" aria-label="${el.type === "image" ? "图片" : "文字框"}" style="left:${el.x}%;top:${el.y}%;width:${el.w}%;height:${el.h}%;">${el.type === "image" ? `<img src="${esc(el.src)}" alt="幻灯片图片" draggable="false">` : `<div class="office-slide-text" data-element-text="${esc(el.id)}" style="font-family:${esc(el.font)};font-size:${el.size / 9.6}cqw;color:${el.color};font-weight:${el.bold ? 700 : 400};text-align:${el.align};">${esc(el.text)}</div>`}<span class="office-resize" data-resize aria-label="拖动调整大小"></span></div>`,
      )
      .join("");
    this.host.querySelector("[data-notes]").value = slide.notes;
    this.inspector();
  }
  thumbnails() {
    const nav = this.host.querySelector(".office-thumbnails");
    if (nav)
      nav.innerHTML = this.current.model.slides
        .map(
          (slide, i) =>
            `<button data-slide="${i}" class="${i === this.slideIndex ? "selected" : ""}" aria-label="第 ${i + 1} 页"><small>${i + 1}</small><span class="office-thumb-canvas" style="background:${slide.background}">${slide.elements.map((el) => `<div style="position:absolute;left:${el.x}%;top:${el.y}%;width:${el.w}%;height:${el.h}%;overflow:hidden;${el.type === "text" ? `font-family:${esc(el.font)};font-size:${el.size / 9.6}cqw;color:${el.color};font-weight:${el.bold ? 700 : 400};text-align:${el.align};white-space:pre-wrap;` : ""}">${el.type === "image" ? `<img src="${esc(el.src)}" alt="" style="width:100%;height:100%;">` : esc(el.text)}</div>`).join("")}</span></button>`,
        )
        .join("");
  }
  inspector() {
    const slide = this.slide(),
      el = this.element();
    const input = (key, label, value, type = "number", limits = "") =>
      `<label>${label}<input data-setting="${key}" type="${type}" value="${esc(value)}" ${limits}></label>`;
    this.host.querySelector(".office-inspector").innerHTML =
      `<h3>第 ${this.slideIndex + 1} 页</h3>${input("slideBackground", "背景", slide.background, "color")}${select(
        "transition",
        "转场",
        [
          ["none", "无"],
          ["fade", "淡入淡出"],
          ["push", "推进"],
          ["wipe", "擦除"],
        ],
        slide.transition,
      )}${select(
        "duration",
        "转场时长",
        [
          ["0.3", "0.3 秒"],
          ["0.6", "0.6 秒"],
          ["1.2", "1.2 秒"],
        ],
        slide.duration,
      )}${button("present", "预览转场")}${
        el
          ? `<hr><h3>${el.type === "image" ? "图片" : "文字框"}</h3>${
              el.type === "text"
                ? `${select("slideFont", "字体", fonts, el.font)}${input("slideSize", "字号", el.size, "number", 'min="8" max="96"')}${input("slideColor", "文字色", el.color, "color")}${button("slide-bold", el.bold ? "取消粗体" : "粗体")}${select(
                    "slideAlign",
                    "对齐",
                    [
                      ["left", "左对齐"],
                      ["center", "居中"],
                      ["right", "右对齐"],
                    ],
                    el.align,
                  )}`
                : ""
            }<div class="office-geometry">${input("x", "X %", el.x, "number", 'min="0" max="95" step="0.5"')}${input("y", "Y %", el.y, "number", 'min="0" max="95" step="0.5"')}${input("w", "宽 %", el.w, "number", 'min="3" max="100" step="0.5"')}${input("h", "高 %", el.h, "number", 'min="3" max="100" step="0.5"')}</div>${button("element-front", "置于顶层")}${button("element-delete", "删除元素")}`
          : "<p>单击选择元素，拖动移动，右下角调整大小；双击文字框编辑。</p>"
      }`;
  }
  selectElement(id) {
    this.elementId = id;
    this.host
      .querySelectorAll("[data-element]")
      .forEach((el) =>
        el.classList.toggle("is-selected", el.dataset.element === id),
      );
    this.inspector();
  }
  sheetsHTML() {
    const sheet =
      this.current.model.sheets[this.sheetIndex] ||
      this.current.model.sheets[0];
    return `<div class="office-toolbar" aria-label="表格工具">${button("undo", "撤销")}${button("redo", "重做")}${button("rows", "＋ 20 行")}${button("cols", "＋ 1 列")}${button("sheet-add", "新工作表")}${button("sheet-rename", "重命名")}${button("sheet-delete", "删除工作表")}${button("cell-bold", "粗体")}${select("cellSize", "字号", [10, 11, 12, 14, 16, 18, 24], 12)}<label>文字色<input data-setting="cellColor" type="color" value="#172d42"></label>${select(
      "cellFormat",
      "数字格式",
      [
        ["general", "常规"],
        ["number", "小数"],
        ["currency", "货币"],
        ["percent", "百分比"],
      ],
      "general",
    )}<label>填充色<input data-setting="cellBackground" type="color" value="#ffffff"></label>${select(
      "function",
      "函数示例",
      [
        ["", "选择函数…"],
        ["=SUM(A1:A10)", "SUM · 求和"],
        ["=AVERAGE(A1:A10)", "AVERAGE · 平均值"],
        ['=IF(A1>60,"通过","未通过")', "IF · 条件"],
        ["=COUNT(A1:A10)", "COUNT · 计数"],
        ["=ROUND(A1,2)", "ROUND · 舍入"],
        ["=VLOOKUP(A1,A2:C10,2,FALSE)", "VLOOKUP · 查找"],
      ],
      "",
    )}</div><div class="office-formula-bar"><span data-cell-name>${this.cell}</span><b>fx</b><input data-formula maxlength="4000" aria-label="公式栏" placeholder="输入数值、文字或以 = 开头的公式"></div><div class="office-grid-scroll"><table class="office-grid" role="grid" aria-label="电子表格"><thead><tr><th></th>${Array.from({ length: sheet.cols }, (_, c) => `<th scope="col">${Model.col(c + 1)}</th>`).join("")}</tr></thead><tbody>${Array.from({ length: sheet.rows }, (_, r) => `<tr><th scope="row">${r + 1}</th>${Array.from({ length: sheet.cols }, (_, c) => `<td><input aria-label="${Model.col(c + 1)}${r + 1}" data-cell="${Model.col(c + 1)}${r + 1}" autocomplete="off" spellcheck="false" maxlength="4000"></td>`).join("")}</tr>`).join("")}</tbody></table></div><nav class="office-sheet-tabs" aria-label="工作表">${this.current.model.sheets.map((s, i) => `<button data-sheet="${i}" aria-pressed="${i === this.sheetIndex}">${esc(s.name)}</button>`).join("")}</nav><p class="office-formula-help">Enter / Tab 移动 · 可粘贴多行多列 · 支持 SUM、AVERAGE、IF、COUNT、ROUND、VLOOKUP 等函数，以及 Sheet2!A1 引用。</p>`;
  }
  sheet() {
    return (
      this.current.model.sheets[this.sheetIndex] || this.current.model.sheets[0]
    );
  }
  cellData() {
    return (this.sheet().cells[this.cell] ||= {
      value: "",
      style: {
        bold: false,
        color: "#172d42",
        background: "#ffffff",
        size: 12,
        format: "general",
      },
    });
  }
  refreshCells() {
    if (!this.host) return;
    const sheet = this.sheet(),
      calc = calculator(this.current.model);
    this.host.querySelectorAll("[data-cell]").forEach((input) => {
      const key = input.dataset.cell,
        data = sheet.cells[key],
        result = data?.value ? calc.display(sheet.name, key) : "";
      let display = String(result);
      if (typeof result === "number") {
        const type = data?.style?.format;
        if (type === "number") display = result.toFixed(2);
        if (type === "currency")
          display = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
          }).format(result);
        if (type === "percent")
          display = new Intl.NumberFormat("en-US", {
            style: "percent",
            maximumFractionDigits: 2,
          }).format(result);
      }
      if (document.activeElement !== input) input.value = display;
      input.title = data?.value?.startsWith("=")
        ? `${data.value} → ${display}`
        : "";
      Object.assign(input.style, {
        fontWeight: data?.style?.bold ? 700 : 400,
        color: data?.style?.color || "#172d42",
        background: data?.style?.background || "#ffffff",
        fontSize: (data?.style?.size || 12) + "pt",
      });
      input.classList.toggle("selected", key === this.cell);
      input.classList.toggle(
        "formula-error",
        typeof result === "string" && result.startsWith("#"),
      );
    });
    const bar = this.host.querySelector("[data-formula]");
    if (bar && document.activeElement !== bar)
      bar.value = sheet.cells[this.cell]?.value || "";
    const label = this.host.querySelector("[data-cell-name]");
    if (label) label.textContent = this.cell;
  }
  setCell(value, key = this.cell) {
    if (String(value).length > 4000) throw Error("单元格内容最多 4000 字符。");
    const cell = (this.sheet().cells[key] ||= {
      value: "",
      style: {
        bold: false,
        color: "#172d42",
        background: "#ffffff",
        size: 12,
        format: "general",
      },
    });
    cell.value = String(value);
    this.changed();
    this.refreshCells();
  }
  aiHTML() {
    if (this.kind === "docs") {
      const stale = this.aiResult && !this.revisionCurrent();
      const edits = this.aiResult?.edits || [];
      return `<section class="office-ai office-ai-inline" aria-label="AI 赋能"><div class="office-ai-heading"><h3>AI 赋能</h3><p>你来写作，AI 按你的要求修改已有内容。</p></div><div class="office-ai-compose"><label class="office-ai-request">想让 AI 怎样改进？<textarea data-ai-prompt rows="2" maxlength="4000" placeholder="例如：把这段论证写得更严谨，保留我的观点和引用">${esc(this.aiPrompt)}</textarea></label><label>修改范围<select data-ai-scope><option value="document" ${this.aiScope === "document" ? "selected" : ""}>整篇文档</option><option value="selection" ${this.aiScope === "selection" ? "selected" : ""}>选中文字</option></select></label>${button("ai-generate", this.aiBusy ? "正在修改…" : "预览修改", this.aiBusy ? "disabled" : "")}</div><div class="office-ai-shortcuts"><span>快捷要求</span>${["润色表达", "更学术严谨", "精简重复内容", "翻译成英文"].map((text, i) => button("ai-preset-" + i, text)).join("")}</div>${this.aiResult ? `<div class="office-ai-preview"><div class="office-ai-heading"><strong>${edits.length ? `修改预览 · ${edits.length} 处` : "AI 认为无需修改"}</strong><span>${this.aiSource?.scope === "selection" ? "只修改选中文字" : "修改当前文档"}</span></div><div data-ai-result aria-live="polite">${this.aiResultHTML()}</div><div class="office-ai-preview-actions">${edits.length ? button("ai-apply", this.aiSource?.scope === "selection" ? "应用到选中文字" : "应用到文档", stale || this.aiBusy ? "disabled" : "") : ""}${button("ai-discard", "放弃这次修改")}</div></div>` : ""}<p class="office-ai-warning" role="alert">${esc(this.aiError || (stale ? "正文已更改，请重新预览，避免覆盖你刚写的内容。" : ""))}</p><p class="office-ai-hint" role="status">${esc(this.aiNotice || "AI 只在你点击后参与；预览不会改动正文，应用后可撤销。")}</p></section>`;
    }
    return `<aside class="office-ai"><h3>AI 辅助</h3><p>${{ slides: "基于当前演示生成可编辑的幻灯片草稿。", sheets: "根据表格内容与所选单元格，生成公式建议。" }[this.kind]}</p><label>你想做什么？<textarea data-ai-prompt rows="5" placeholder="说明你的要求">${esc(this.aiPrompt)}</textarea></label>${button("ai-generate", this.aiBusy ? "正在生成…" : "生成建议", this.aiBusy ? "disabled" : "")}<div data-ai-result aria-live="polite">${this.aiResult ? this.aiResultHTML() : "建议会先显示在这里，由你决定是否应用。"}</div>${this.aiResult ? button("ai-apply", this.kind === "slides" ? "追加为新幻灯片" : "填入当前单元格") : ""}<p class="office-ai-warning" role="alert">${esc(this.aiError || "")}</p></aside>`;
  }
  aiResultHTML() {
    if (this.aiResult.edits) {
      return this.aiResult.edits.map((edit) => {
        const target = this.aiSource?.targets.find((block) => block.id === edit.id);
        return `<section class="office-ai-change"><div><small>修改前</small><pre>${esc(target?.text || "")}</pre></div><div><small>修改后</small><pre>${esc(edit.text || "（删除这段文字）")}</pre></div></section>`;
      }).join("");
    }
    if (this.aiResult.slides)
      return this.aiResult.slides
        .map(
          (s, i) =>
            `<section><strong>${i + 1}. ${esc(s.title)}</strong><p>${esc(s.body)}</p></section>`,
        )
        .join("");
    return `<pre>${esc(this.aiResult.text || "")}</pre>`;
  }
  refreshAI() {
    const panel = this.host?.querySelector(".office-ai");
    if (panel) panel.outerHTML = this.aiHTML();
  }
  revisionCurrent() {
    return this.aiSource?.project === this.current && this.editor &&
      this.aiSource.signature === JSON.stringify(this.editor.getJSON());
  }
  revisionTargets() {
    const { doc, selection } = this.editor.state;
    if (this.aiScope === "selection" && selection.empty)
      throw Error("请先在正文中选中需要修改的文字。");
    const targets = [];
    doc.descendants((node, position) => {
      if (!node.isTextblock) return;
      const from = Math.max(position + 1, this.aiScope === "selection" ? selection.from : 0);
      const to = Math.min(position + 1 + node.content.size, this.aiScope === "selection" ? selection.to : doc.content.size);
      if (from < to) targets.push({ id: "b" + targets.length, from, to, text: doc.textBetween(from, to, "\n", "\n") });
      return false;
    });
    revisionBlocks(targets);
    return targets;
  }
  applyRevision() {
    if (!this.aiResult?.edits?.length) return;
    if (!this.revisionCurrent()) {
      this.aiError = "正文已更改，请重新预览，避免覆盖你刚写的内容。";
      this.refreshAI();
      return;
    }
    const targets = new Map(this.aiSource.targets.map((target) => [target.id, target]));
    // Apply backwards in one undoable transaction, keeping all untouched nodes and marks.
    const edits = revisionEdits(JSON.stringify(this.aiResult), this.aiSource.targets)
      .map((edit) => ({ ...targets.get(edit.id), next: edit.text }))
      .sort((a, b) => b.from - a.from);
    this.editor.chain().focus().command(({ tr, state }) => {
      closeHistory(tr);
      for (const edit of edits) {
        let prefix = 0, suffix = 0;
        while (prefix < edit.text.length && prefix < edit.next.length && edit.text[prefix] === edit.next[prefix]) prefix++;
        // Never split a UTF-16 surrogate pair at the replacement boundary.
        if (prefix && /[\uD800-\uDBFF]/.test(edit.text[prefix - 1])) prefix--;
        while (suffix < edit.text.length - prefix && suffix < edit.next.length - prefix && edit.text.at(-1 - suffix) === edit.next.at(-1 - suffix)) suffix++;
        if (suffix && /[\uDC00-\uDFFF]/.test(edit.text[edit.text.length - suffix])) suffix--;
        const from = edit.from + prefix, to = edit.to - suffix;
        const marks = (from < edit.to ? tr.doc.nodeAt(from)?.marks : null) || tr.doc.resolve(from).marks();
        const lines = edit.next.slice(prefix, edit.next.length - suffix).split("\n");
        const nodes = [];
        lines.forEach((line, i) => {
          if (i) nodes.push(state.schema.nodes.hardBreak.create());
          if (line) nodes.push(state.schema.text(line, marks));
        });
        tr.replaceWith(from, to, Fragment.fromArray(nodes));
      }
      return true;
    }).run();
    // Separate subsequent typing from the AI change in undo history too.
    this.editor.view.dispatch(closeHistory(this.editor.state.tr));
    this.aiResult = null;
    this.aiNotice = "已应用到正文。可点击「撤销」恢复修改前的内容。";
    this.refreshAI();
  }
  async assist() {
    if (this.aiBusy) return;
    this.capture();
    this.aiError = "";
    this.aiNotice = "";
    let targets;
    try {
      if (!this.aiPrompt.trim()) throw Error("请填写 AI 辅助要求。");
      if (this.kind === "docs") targets = this.revisionTargets();
    } catch (error) {
      this.aiError = error.message;
      this.refreshAI();
      return;
    }
    const project = this.current;
    const source = targets && { project, targets, scope: this.aiScope, signature: JSON.stringify(this.editor.getJSON()) };
    this.aiBusy = true;
    this.aiResult = null;
    const context =
      this.kind === "docs"
        ? ""
        : this.kind === "slides"
          ? JSON.stringify(
              project.model.slides.map((s) => ({
                notes: s.notes,
                text: s.elements
                  .filter((e) => e.type === "text")
                  .map((e) => e.text),
              })),
            )
          : JSON.stringify({
              sheet: this.sheet().name,
              selectedCell: this.cell,
              cells: this.sheet().cells,
            });
    this.refreshAI();
    try {
      const result = await this.ctx.api("/api/office/assist", {
        method: "POST",
        body: {
          ownerId: this.ctx.userId,
          kind: this.kind,
          prompt: this.aiPrompt,
          context: context.slice(0, 20000),
          ...(targets ? { operation: "revise", blocks: targets.map(({ id, text }) => ({ id, text })) } : {}),
        },
      });
      if (project === this.current) {
        this.aiResult = targets ? { edits: revisionEdits(JSON.stringify(result), targets) } : result;
        this.aiSource = source;
      }
    } catch (error) {
      if (project === this.current) this.aiError = error.message;
    } finally {
      this.aiBusy = false;
      this.refreshAI();
    }
  }
  async addImage(file) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 12 * 1024 * 1024
    )
      throw Error("请使用 12 MB 以内的 PNG、JPEG 或 WebP 图片。");
    const project = this.current,
      bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1400 / bitmap.width, 1400 / bitmap.height),
      canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext("2d")
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    let src = canvas.toDataURL(
      file.type === "image/png" ? "image/png" : "image/jpeg",
      0.85,
    );
    if (src.length > 1500000) src = canvas.toDataURL("image/jpeg", 0.7);
    Model.image(src);
    if (project !== this.current) return;
    if (this.kind === "docs") {
      this.editor.chain().focus().setImage({ src, alt: file.name }).run();
    } else {
      if (this.slide().elements.length >= 100)
        throw Error("每页最多 100 个元素。");
      this.checkpoint();
      const w = 50,
        h = Math.min(75, (((w * 16) / 9) * canvas.height) / canvas.width);
      const el = { id: Model.id(), type: "image", src, x: 10, y: 10, w, h };
      this.slide().elements.push(el);
      this.elementId = el.id;
      this.changed();
      this.paintSlides();
    }
  }
  async export() {
    this.capture();
    this.status = "正在导出…";
    this.updateStatus();
    try {
      const res = await fetch("/api/office/export", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ownerId: this.ctx.userId,
          kind: this.kind,
          name: this.current.name,
          model: this.current.model,
        }),
      });
      if (!res.ok) throw Error((await res.json()).error || "导出失败");
      const blob = await res.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = this.current.name + "." + formats[this.kind];
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      this.status = this.current.dirty
        ? "导出完成，修改待保存"
        : "导出完成，已保存到云端";
    } catch (error) {
      this.status = error.message;
    }
    this.updateStatus();
  }
  async import(file) {
    if (!file || this.switching) return;
    if (file.size > 12 * 1024 * 1024) throw Error("导入文件最多 12 MB。");
    this.switching = true;
    if (this.host) this.host.inert = true;
    try {
      if (this.current.dirty) await this.save();
      if (this.current.dirty)
        throw Error("请先保存当前作品或另存副本，再导入。");
      const current = this.current;
      this.status = "正在导入…";
      this.updateStatus();
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(Error("无法读取文件"));
        reader.readAsDataURL(file);
      });
      const result = await this.ctx.api("/api/office/import", {
        method: "POST",
        body: {
          ownerId: this.ctx.userId,
          kind: this.kind,
          name: file.name,
          data,
        },
      });
      if (current !== this.current)
        throw Error("已切换作品，请重新选择要导入的文件。");
      this.newProject();
      this.current.name = result.name;
      this.current.model = result.model;
      this.current.importWarnings = result.warnings;
      this.aiResult = null;
      this.changed();
      this.draw();
    } finally {
      this.switching = false;
      if (this.host) this.host.inert = false;
    }
  }
  print() {
    this.capture();
    const s = this.current.model.settings,
      frame = document.createElement("iframe");
    frame.className = "office-print-frame";
    document.body.appendChild(frame);
    frame.onload = () => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => frame.remove(), 60000);
    };
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(this.current.name)}</title><style>@page{size:${s.paper};margin:${s.margin}mm}body{font-family:"${s.font}";font-size:${s.size}pt;line-height:${s.line}}p{margin:0}img{max-width:100%;height:auto}</style></head><body>${this.editor.getHTML()}</body></html>`;
  }
  present() {
    if (this.presentation) return;
    this.capture();
    let index = this.slideIndex;
    const overlay = document.createElement("div");
    overlay.className = "office-presentation";
    overlay.tabIndex = -1;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "幻灯片演示");
    overlay.setAttribute("aria-modal", "true");
    const paint = () => {
      const slide = this.current.model.slides[index];
      overlay.innerHTML = `<div class="office-presentation-controls">${button("previous", "← 上一页")}<span>${index + 1} / ${this.current.model.slides.length}</span>${button("next", "下一页 →")}${button("close", "退出演示 · Esc")}</div><div class="office-presentation-stage office-stage transition-${slide.transition}" style="background:${slide.background};--duration:${slide.duration}s">${slide.elements.map((el) => `<div style="position:absolute;left:${el.x}%;top:${el.y}%;width:${el.w}%;height:${el.h}%;overflow:hidden;${el.type === "text" ? `font-family:${esc(el.font)};font-size:${el.size / 9.6}cqw;color:${el.color};font-weight:${el.bold ? 700 : 400};text-align:${el.align};white-space:pre-wrap;` : ""}">${el.type === "image" ? `<img src="${esc(el.src)}" style="width:100%;height:100%" alt="幻灯片图片">` : esc(el.text)}</div>`).join("")}</div>`;
    };
    const close = () => {
      overlay.remove();
      this.presentation = null;
      this.host?.querySelector('[data-office="present"]')?.focus();
    };
    const move = (delta) => {
      index = clamp(index + delta, 0, this.current.model.slides.length - 1);
      paint();
    };
    overlay.addEventListener("click", (e) => {
      const a = e.target.closest("[data-office]")?.dataset.office;
      if (a === "close") close();
      if (a === "next") move(1);
      if (a === "previous") move(-1);
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
      if (["ArrowRight", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        move(1);
      }
      if (["ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        move(-1);
      }
    });
    document.body.appendChild(overlay);
    this.presentation = overlay;
    paint();
    overlay.focus();
  }
  bind() {
    const host = this.host;
    this.bindController?.abort();
    this.bindController = new AbortController();
    host.onclick = (e) => {
      const target = e.target.closest("[data-office]");
      if (target) {
        e.preventDefault();
        void this.action(target.dataset.office).catch((error) => {
          this.status = error.message;
          this.updateStatus();
        });
        return;
      }
      const slide = e.target.closest("[data-slide]");
      if (slide) {
        this.slideIndex = Number(slide.dataset.slide);
        this.elementId = "";
        this.paintSlides();
      }
      const sheet = e.target.closest("[data-sheet]");
      if (sheet) {
        this.sheetIndex = Number(sheet.dataset.sheet);
        this.cell = "A1";
        this.draw();
      }
    };
    host.onmousedown = (e) => {
      if (e.target.closest("[data-office]") && this.kind === "docs")
        e.preventDefault();
    };
    host.oninput = (e) => {
      if (e.target.matches("[data-name]")) {
        this.current.name = e.target.value.slice(0, 120);
        this.changed();
      }
      if (e.target.matches("[data-ai-prompt]")) this.aiPrompt = e.target.value;
      if (e.target.matches("[data-notes]")) {
        this.slide().notes = e.target.value;
        this.changed();
      }
      if (e.target.matches("[data-element-text]")) {
        const el = this.slide().elements.find(
          (x) => x.id === e.target.dataset.elementText,
        );
        if (el) {
          el.text = e.target.innerText;
          this.changed();
        }
      }
      if (e.target.matches("[data-cell]")) {
        this.host.querySelector("[data-formula]").value = e.target.value;
      }
    };
    host.onchange = (e) => {
      if (e.target.matches("[data-ai-scope]")) this.aiScope = e.target.value;
      if (e.target.matches("[data-project-picker]"))
        void this.open(e.target.value).catch((error) => {
          this.status = error.message;
          this.updateStatus();
        });
      if (e.target.matches("[data-setting]")) {
        try {
          this.setting(e.target.dataset.setting, e.target.value);
        } catch (error) {
          this.status = error.message;
          this.updateStatus();
        }
      }
      if (e.target.matches("[data-cell]"))
        this.setCell(e.target.value, e.target.dataset.cell);
      if (e.target.matches("[data-formula]")) {
        this.checkpoint();
        this.setCell(e.target.value);
      }
      if (e.target.matches("[data-office-image]"))
        void this.addImage(e.target.files[0]).catch((error) => {
          this.status = error.message;
          this.updateStatus();
        });
      if (e.target.matches("[data-office-import]"))
        void this.import(e.target.files[0]).catch((error) => {
          this.status = error.message;
          this.updateStatus();
        });
    };
    host.addEventListener(
      "focusin",
      (e) => {
        if (e.target.matches("[data-cell]")) {
          this.checkpoint();
          this.cell = e.target.dataset.cell;
          e.target.value = this.sheet().cells[this.cell]?.value || "";
          this.refreshCells();
          e.target.select();
        }
        if (e.target.matches("[data-element-text]")) this.checkpoint();
      },
      { signal: this.bindController.signal },
    );
    host.addEventListener(
      "focusout",
      (e) => {
        if (e.target.matches("[data-cell]"))
          setTimeout(() => this.refreshCells(), 0);
        if (e.target.matches("[data-element-text]")) {
          e.target.contentEditable = "false";
          this.thumbnails();
        }
      },
      { signal: this.bindController.signal },
    );
    host.ondblclick = (e) => {
      const text =
        e.target.closest("[data-element-text]") ||
        e.target
          .closest("[data-element]")
          ?.querySelector("[data-element-text]");
      if (text) {
        this.selectElement(text.dataset.elementText);
        text.contentEditable = "true";
        text.focus();
      }
    };
    host.onpointerdown = (e) => this.startDrag(e);
    host.onkeydown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void this.save();
        return;
      }
      if (
        this.kind === "slides" &&
        e.target.matches("[data-element]") &&
        !e.target.isContentEditable
      ) {
        if (e.key === "Enter") {
          const text = e.target.querySelector("[data-element-text]");
          if (text) {
            e.preventDefault();
            text.contentEditable = "true";
            text.focus();
          }
          return;
        }
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
        ) {
          e.preventDefault();
          this.selectElement(e.target.dataset.element);
          this.checkpoint();
          const el = this.element(),
            step = e.shiftKey ? 2 : 0.5;
          el.x = clamp(
            el.x +
              (e.key === "ArrowLeft"
                ? -step
                : e.key === "ArrowRight"
                  ? step
                  : 0),
            0,
            100 - el.w,
          );
          el.y = clamp(
            el.y +
              (e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0),
            0,
            100 - el.h,
          );
          this.changed();
          this.paintSlides();
          this.host.querySelector(`[data-element="${el.id}"]`)?.focus();
          return;
        }
      }
      if (e.target.matches("[data-formula]") && e.key === "Enter") {
        e.preventDefault();
        this.checkpoint();
        this.setCell(e.target.value);
        this.host.querySelector(`[data-cell="${this.cell}"]`)?.focus();
        return;
      }
      if (
        e.target.matches("[data-cell]") &&
        ["Enter", "Tab", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        this.setCell(e.target.value, e.target.dataset.cell);
        const a = Model.address(this.cell);
        const shift = e.shiftKey ? -1 : 1;
        const row = clamp(
            a.row +
              (e.key === "Enter"
                ? shift
                : e.key === "ArrowUp"
                  ? -1
                  : e.key === "ArrowDown"
                    ? 1
                    : 0),
            1,
            this.sheet().rows,
          ),
          col = clamp(
            a.col + (e.key === "Tab" ? shift : 0),
            1,
            this.sheet().cols,
          );
        this.host
          .querySelector(`[data-cell="${Model.col(col)}${row}"]`)
          ?.focus();
      }
      if (
        this.kind === "slides" &&
        !e.target.isContentEditable &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) &&
        ["Delete", "Backspace"].includes(e.key)
      ) {
        e.preventDefault();
        void this.action("element-delete");
      }
    };
    host.onpaste = (e) => {
      if (!e.target.matches("[data-cell]")) return;
      const text = e.clipboardData?.getData("text/plain") || "";
      if (!/[\t\n]/.test(text)) return;
      e.preventDefault();
      const start = Model.address(e.target.dataset.cell),
        rows = text
          .replace(/\r/g, "")
          .replace(/\n$/, "")
          .split("\n")
          .map((r) => r.split("\t"));
      if (
        rows.length > 1000 ||
        rows.some((r) => r.length > 100) ||
        rows.flat().some((v) => v.length > 4000)
      ) {
        this.status = "粘贴内容超过工作表限制。";
        this.updateStatus();
        return;
      }
      if (
        start.row + rows.length - 1 > 1000 ||
        start.col + Math.max(...rows.map((r) => r.length)) - 1 > 100
      ) {
        this.status = "粘贴范围超过 1000 行或 100 列。";
        this.updateStatus();
        return;
      }
      this.checkpoint();
      const sheet = this.sheet();
      sheet.rows = Math.max(sheet.rows, start.row + rows.length - 1);
      sheet.cols = Math.max(
        sheet.cols,
        start.col + Math.max(...rows.map((r) => r.length)) - 1,
      );
      rows.forEach((row, r) =>
        row.forEach((value, c) => {
          const address = Model.col(start.col + c) + (start.row + r);
          sheet.cells[address] = {
            value,
            style: sheet.cells[address]?.style || {
              bold: false,
              color: "#172d42",
              background: "#ffffff",
              size: 12,
              format: "general",
            },
          };
        }),
      );
      this.changed();
      this.draw();
    };
  }
  startDrag(event) {
    if (this.kind !== "slides" || event.button !== 0) return;
    const target = event.target.closest("[data-element]");
    if (!target || event.target.isContentEditable) return;
    event.preventDefault();
    this.selectElement(target.dataset.element);
    this.checkpoint();
    const el = this.element(),
      initial = clone(el),
      box = this.host.querySelector("[data-stage]").getBoundingClientRect(),
      x = event.clientX,
      y = event.clientY,
      resize = Boolean(event.target.closest("[data-resize]"));
    target.setPointerCapture(event.pointerId);
    const move = (e) => {
      const dx = ((e.clientX - x) / box.width) * 100,
        dy = ((e.clientY - y) / box.height) * 100;
      if (resize) {
        el.w = clamp(initial.w + dx, 3, 100 - el.x);
        el.h = clamp(initial.h + dy, 3, 100 - el.y);
      } else {
        el.x = clamp(initial.x + dx, 0, 100 - el.w);
        el.y = clamp(initial.y + dy, 0, 100 - el.h);
      }
      for (const key of ["x", "y", "w", "h"])
        target.style[{ x: "left", y: "top", w: "width", h: "height" }[key]] =
          el[key] + "%";
    };
    const finish = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", finish);
      target.removeEventListener("pointercancel", finish);
      this.changed();
      this.thumbnails();
      this.inspector();
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", finish);
    target.addEventListener("pointercancel", finish);
  }
  setting(key, value) {
    if (this.kind === "docs") {
      const chain = this.editor.chain().focus();
      if (key === "font") chain.setFontFamily(value).run();
      if (key === "size") chain.setFontSize(value + "pt").run();
      if (key === "textColor") chain.setColor(value).run();
      if (key === "align") chain.setTextAlign(value).run();
      if (key === "block")
        value === "paragraph"
          ? chain.setParagraph().run()
          : chain.toggleHeading({ level: Number(value) }).run();
      if (key === "line")
        chain
          .updateAttributes("paragraph", { lineHeight: value })
          .updateAttributes("heading", { lineHeight: value })
          .run();
      if (key === "paper" || key === "margin") {
        this.current.model.settings[key] =
          key === "margin" ? Number(value) : value;
        this.paperStyle();
        this.changed();
      }
      return;
    }
    if (this.kind === "slides") {
      this.checkpoint();
      const slide = this.slide(),
        el = this.element();
      if (key === "slideBackground") slide.background = value;
      if (key === "transition") slide.transition = value;
      if (key === "duration") slide.duration = Number(value);
      if (el) {
        if (["x", "y", "w", "h"].includes(key)) {
          const n = Number(value);
          el[key] = clamp(
            n,
            ["w", "h"].includes(key) ? 3 : 0,
            ["x", "y"].includes(key) ? 95 : 100,
          );
          el.w = Math.min(el.w, 100 - el.x);
          el.h = Math.min(el.h, 100 - el.y);
        }
        if (key === "slideFont") el.font = value;
        if (key === "slideSize") el.size = clamp(Number(value), 8, 96);
        if (key === "slideColor") el.color = value;
        if (key === "slideAlign") el.align = value;
      }
      this.changed();
      this.paintSlides();
      return;
    }
    if (key === "function") {
      const bar = this.host.querySelector("[data-formula]");
      bar.value = value;
      bar.focus();
      return;
    }
    this.checkpoint();
    const cell = this.cellData();
    if (key === "cellSize") cell.style.size = clamp(Number(value), 8, 36);
    if (key === "cellColor") cell.style.color = value;
    if (key === "cellFormat") cell.style.format = value;
    if (key === "cellBackground") cell.style.background = value;
    this.changed();
    this.refreshCells();
  }
  async action(action) {
    if (action === "save") {
      await this.save();
      return;
    }
    if (action === "export") {
      await this.export();
      return;
    }
    if (action === "import") {
      this.host.querySelector("[data-office-import]").click();
      return;
    }
    if (action === "new" || action === "copy") {
      if (this.current.saving) await this.current.saving;
      if (action === "new" && this.current.dirty) {
        await this.save();
        if (this.current.dirty)
          throw Error("请先保存当前作品，或选择另存副本。");
      }
      this.newProject(action === "copy");
      this.aiResult = null;
      this.draw();
      this.schedule();
      return;
    }
    if (action === "ai") {
      this.aiOpen = !this.aiOpen;
      this.draw();
      return;
    }
    if (action === "ai-generate") {
      await this.assist();
      return;
    }
    if (action.startsWith("ai-preset-")) {
      this.aiPrompt = ["润色表达，让行文更自然流畅，保留我的观点和引用。", "让论证和措辞更学术严谨，保留原意，不编造事实或引用。", "精简重复和冗余的表达，保留核心观点、数据与引用。", "翻译成自然、准确的学术英文，保留观点、数据和引用。"][Number(action.slice(-1))] || "";
      this.host.querySelector("[data-ai-prompt]").value = this.aiPrompt;
      this.host.querySelector("[data-ai-prompt]").focus();
      return;
    }
    if (action === "ai-discard") {
      this.aiResult = null;
      this.aiError = "";
      this.refreshAI();
      return;
    }
    if (action === "ai-apply") {
      if (!this.aiResult) return;
      if (this.kind === "docs") {
        this.applyRevision();
      } else if (this.kind === "slides") {
        if (
          this.current.model.slides.length + this.aiResult.slides.length >
          100
        )
          throw Error("演示最多 100 页。");
        this.checkpoint();
        this.current.model.slides.push(
          ...this.aiResult.slides.map((s) => {
            const slide = Model.blankSlide();
            slide.elements = [
              Model.textBox(s.title, { size: 36, y: 12, h: 20 }),
              Model.textBox(s.body, { size: 22, y: 38, h: 50 }),
            ];
            return slide;
          }),
        );
        this.slideIndex =
          this.current.model.slides.length - this.aiResult.slides.length;
        this.changed();
        this.paintSlides();
      } else {
        this.checkpoint();
        this.setCell(this.aiResult.text);
      }
      return;
    }
    if (action === "image") {
      this.host.querySelector("[data-office-image]").click();
      return;
    }
    if (action === "print") {
      this.print();
      return;
    }
    if (action === "undo" || action === "redo") {
      if (this.kind === "docs") {
        this.editor.chain().focus()[action]().run();
        return;
      }
      const from = action === "undo" ? this.undo : this.redo,
        to = action === "undo" ? this.redo : this.undo;
      if (!from.length) return;
      to.push(JSON.stringify(this.current.model));
      this.current.model = JSON.parse(from.pop());
      this.slideIndex = Math.min(
        this.slideIndex,
        (this.current.model.slides?.length || 1) - 1,
      );
      this.sheetIndex = Math.min(
        this.sheetIndex,
        (this.current.model.sheets?.length || 1) - 1,
      );
      this.changed();
      this.draw();
      return;
    }
    if (this.kind === "docs") {
      const map = {
        bold: "toggleBold",
        italic: "toggleItalic",
        underline: "toggleUnderline",
        bullet: "toggleBulletList",
        numbered: "toggleOrderedList",
      };
      if (map[action]) this.editor.chain().focus()[map[action]]().run();
      return;
    }
    if (this.kind === "slides") {
      if (action === "present") {
        this.present();
        return;
      }
      if (
        action.startsWith("slide-") ||
        action.startsWith("element-") ||
        action === "text-add"
      )
        this.checkpoint();
      const slides = this.current.model.slides,
        slide = this.slide(),
        el = this.element();
      if (action === "slide-add" || action === "slide-copy") {
        if (slides.length >= 100) throw Error("演示最多 100 页。");
        const next =
          action === "slide-copy" ? clone(slide) : Model.blankSlide();
        next.id = Model.id();
        slides.splice(this.slideIndex + 1, 0, next);
        this.slideIndex++;
        this.elementId = "";
      }
      if (action === "slide-delete") {
        if (slides.length === 1) slides[0] = Model.blankSlide();
        else slides.splice(this.slideIndex, 1);
        this.slideIndex = Math.min(this.slideIndex, slides.length - 1);
        this.elementId = "";
      }
      if (action === "slide-up" && this.slideIndex > 0) {
        [slides[this.slideIndex - 1], slides[this.slideIndex]] = [
          slides[this.slideIndex],
          slides[this.slideIndex - 1],
        ];
        this.slideIndex--;
      }
      if (action === "slide-down" && this.slideIndex < slides.length - 1) {
        [slides[this.slideIndex + 1], slides[this.slideIndex]] = [
          slides[this.slideIndex],
          slides[this.slideIndex + 1],
        ];
        this.slideIndex++;
      }
      if (action === "text-add") {
        if (slide.elements.length >= 100) throw Error("每页最多 100 个元素。");
        const next = Model.textBox();
        slide.elements.push(next);
        this.elementId = next.id;
      }
      if (action === "element-delete" && el) {
        slide.elements = slide.elements.filter((e) => e.id !== el.id);
        this.elementId = "";
      }
      if (action === "element-front" && el) {
        slide.elements = slide.elements.filter((e) => e.id !== el.id);
        slide.elements.push(el);
      }
      if (action === "slide-bold" && el) el.bold = !el.bold;
      this.changed();
      this.paintSlides();
      return;
    }
    this.checkpoint();
    const sheet = this.sheet();
    if (action === "rows") sheet.rows = Math.min(1000, sheet.rows + 20);
    if (action === "cols") sheet.cols = Math.min(100, sheet.cols + 1);
    if (action === "sheet-add") {
      if (this.current.model.sheets.length >= 10)
        throw Error("最多 10 个工作表。");
      let n = 1;
      while (this.current.model.sheets.some((s) => s.name === "Sheet" + n)) n++;
      this.current.model.sheets.push({
        id: Model.id(),
        name: "Sheet" + n,
        rows: 40,
        cols: 12,
        cells: {},
      });
      this.sheetIndex = this.current.model.sheets.length - 1;
      this.cell = "A1";
    }
    if (action === "sheet-rename") {
      const name = prompt("工作表名称", sheet.name)?.trim();
      if (!name) return;
      if (
        !/^[^\\/*?:\[\]]{1,31}$/.test(name) ||
        this.current.model.sheets.some(
          (s) => s !== sheet && s.name.toLowerCase() === name.toLowerCase(),
        )
      )
        throw Error("名称无效或重复。");
      const old = sheet.name;
      sheet.name = name;
      for (const s of this.current.model.sheets)
        for (const cell of Object.values(s.cells))
          if (cell.value.startsWith("="))
            cell.value = renameFormulaSheet(cell.value, old, name);
    }
    if (action === "sheet-delete") {
      if (this.current.model.sheets.length === 1)
        throw Error("至少保留一个工作表。");
      if (!confirm("删除当前工作表？引用此表的公式会显示错误。")) return;
      this.current.model.sheets.splice(this.sheetIndex, 1);
      this.sheetIndex = 0;
      this.cell = "A1";
    }
    if (action === "cell-bold") {
      this.cellData().style.bold = !this.cellData().style.bold;
    }
    this.changed();
    this.draw();
  }
}
export function attach(host, ctx) {
  if (mounted?.host === host) return;
  mounted?.detach();
  const key = ctx.userId + ":" + ctx.tool;
  let workspace = sessions.get(key);
  if (!workspace) {
    workspace = new Workspace(ctx, ctx.tool);
    sessions.set(key, workspace);
  }
  mounted = workspace;
  workspace.attach(host, ctx);
}
export function capture() {
  mounted?.capture();
}
export function detach() {
  mounted?.detach();
  mounted = null;
}
window.addEventListener("beforeunload", (event) => {
  capture();
  if (Array.from(sessions.values()).some((s) => s.current?.dirty)) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("pagehide", () => {
  capture();
  for (const workspace of sessions.values())
    if (workspace.current?.dirty) void workspace.storeBackup(workspace.current);
});
