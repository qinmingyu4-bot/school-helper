const state = {
  documents: [],
  mode: "office",
};

const modeLabels = {
  office: "Office Hours",
  assignment: "Assignment",
  quiz: "Quiz Prep",
  writing: "Writing",
};

const supportedTextTypes = [
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/html",
];

const fileInput = document.querySelector("#fileInput");
const dropZone = document.querySelector("#dropZone");
const documentList = document.querySelector("#documentList");
const docCount = document.querySelector("#docCount");
const noteInput = document.querySelector("#noteInput");
const addNoteButton = document.querySelector("#addNoteButton");
const chatArea = document.querySelector("#chatArea");
const chatForm = document.querySelector("#chatForm");
const messageInput = document.querySelector("#messageInput");
const goalInput = document.querySelector("#goalInput");
const coachStatus = document.querySelector("#coachStatus");
const clearButton = document.querySelector("#clearButton");

fileInput.addEventListener("change", async (event) => {
  await ingestFiles(Array.from(event.target.files || []));
  fileInput.value = "";
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
});

dropZone.addEventListener("drop", async (event) => {
  await ingestFiles(Array.from(event.dataTransfer.files || []));
});

addNoteButton.addEventListener("click", () => {
  const text = noteInput.value.trim();
  if (!text) return;

  addDocument({
    title: `Pasted course note ${state.documents.length + 1}`,
    text,
    type: detectCourseType(text),
    size: text.length,
  });
  noteInput.value = "";
});

document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".mode-button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.mode = button.dataset.mode;
    coachStatus.textContent = `当前模式：${modeLabels[state.mode]}`;
  });
});

document.querySelectorAll(".prompt-row button").forEach((button) => {
  button.addEventListener("click", () => {
    messageInput.value = button.dataset.prompt;
    messageInput.focus();
    resizeComposer();
  });
});

messageInput.addEventListener("input", resizeComposer);

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = messageInput.value.trim();
  if (!question) return;

  appendMessage("user", question);
  messageInput.value = "";
  resizeComposer();

  setTimeout(() => {
    appendCoachAnswer(question);
  }, 260);
});

clearButton.addEventListener("click", () => {
  chatArea.innerHTML = "";
  appendMessage(
    "coach",
    "对话已清空。Course Pack 还保留着。你可以继续问我 syllabus、rubric、assignment 或 quiz prep 相关问题。"
  );
});

async function ingestFiles(files) {
  if (!files.length) return;

  for (const file of files) {
    const extension = file.name.split(".").pop().toLowerCase();
    const canRead =
      supportedTextTypes.includes(file.type) ||
      ["txt", "md", "csv", "json", "html", "htm"].includes(extension);

    if (canRead) {
      const text = await file.text();
      addDocument({
        title: file.name,
        text: cleanText(text),
        type: detectCourseType(text, extension.toUpperCase()),
        size: file.size,
      });
    } else {
      addDocument({
        title: file.name,
        text: "",
        type: `${extension.toUpperCase()} file`,
        size: file.size,
        unreadable: true,
      });
    }
  }
}

function addDocument(documentItem) {
  state.documents.unshift({
    id: crypto.randomUUID(),
    summary: summarizeText(documentItem.text),
    keywords: extractKeywords(documentItem.text),
    ...documentItem,
  });

  renderDocuments();

  const readableDocs = state.documents.filter((document) => !document.unreadable).length;
  coachStatus.textContent = readableDocs
    ? `已读取 ${readableDocs} 份可分析课程资料`
    : "已记录文件名，可粘贴正文让我分析";

  if (documentItem.unreadable) {
    appendMessage(
      "coach",
      `我收到了《${documentItem.title}》。这个静态原型暂时不能直接解析 ${documentItem.type} 正文。你可以把 syllabus、rubric 或 assignment prompt 的关键文字粘贴到左侧，我会按北美课程语境帮你拆解。`
    );
  } else {
    appendMessage("coach", buildDocumentLoadedReply(documentItem));
  }
}

function renderDocuments() {
  docCount.textContent = `${state.documents.length} files`;

  if (!state.documents.length) {
    documentList.innerHTML =
      '<p class="empty-state">先上传或粘贴课程资料。我会按北美课程常见结构理解：learning outcomes、deadlines、rubric、readings 和 assignments。</p>';
    return;
  }

  documentList.innerHTML = state.documents
    .map(
      (document) => `
        <article class="doc-item">
          <strong title="${escapeHtml(document.title)}">${escapeHtml(document.title)}</strong>
          <span>${escapeHtml(document.type)} · ${formatSize(document.size)}${
            document.unreadable ? " · paste text needed" : ""
          }</span>
        </article>
      `
    )
    .join("");
}

function appendCoachAnswer(question) {
  const context = findRelevantContext(question);
  const goal = goalInput.value.trim() || "理解课程要求并完成学习任务";
  const answer = generateCoachReply(question, context, goal);
  appendMessage("coach", answer.text, context.sources);
}

function generateCoachReply(question, context, goal) {
  const hasContext = context.excerpts.length > 0;
  const lowerQuestion = question.toLowerCase();

  if (!hasContext) {
    return {
      text:
        "我现在还没有可阅读的课程正文。你可以上传 TXT、MD、CSV、JSON、HTML，或粘贴 syllabus、rubric、assignment brief、lecture notes。拿到内容后，我会先帮你判断：课程在考什么、教授期待什么、作业如何评分、下一步该做什么。",
      sources: [],
    };
  }

  if (state.mode === "assignment" || /assignment|rubric|作业|评分|deadline|due/.test(lowerQuestion)) {
    return {
      text: buildAssignmentReply(question, context, goal),
      sources: context.sources,
    };
  }

  if (state.mode === "quiz" || /quiz|exam|test|midterm|final|测验|考试|复习/.test(lowerQuestion)) {
    return {
      text: buildQuizReply(context, goal),
      sources: context.sources,
    };
  }

  if (state.mode === "writing" || /essay|paper|writing|thesis|citation|论文|写作/.test(lowerQuestion)) {
    return {
      text: buildWritingReply(question, context, goal),
      sources: context.sources,
    };
  }

  return {
    text: buildOfficeHoursReply(question, context, goal),
    sources: context.sources,
  };
}

function buildOfficeHoursReply(question, context, goal) {
  const mainIdea = context.excerpts[0];
  const supporting = context.excerpts.slice(1, 3);

  return `
    <p>我们用 office hours 的方式来处理：先明确问题，再准备能问 professor 或 TA 的具体点。</p>
    <ol>
      <li><strong>你现在的问题：</strong>${escapeHtml(question)}</li>
      <li><strong>资料里最相关的信息：</strong>${escapeHtml(mainIdea)}</li>
      <li><strong>我建议你先确认：</strong>这是在问 concept、application、evidence，还是 grading expectation。</li>
      <li><strong>可以这样问 TA：</strong>“For this part, should I focus more on explaining the concept, applying it to an example, or connecting it to the rubric?”</li>
    </ol>
    ${
      supporting.length
        ? `<p>补充线索：${supporting.map(escapeHtml).join("；")}。</p>`
        : ""
    }
    <p>本周目标是「${escapeHtml(goal)}」。下一步你可以让我把它改成一封给 professor/TA 的英文邮件。</p>
  `;
}

function buildAssignmentReply(question, context, goal) {
  const keywords = unique(context.keywords).slice(0, 7);
  return `
    <p>我会按北美作业常见评分逻辑来拆：deliverable、requirements、rubric、evidence、deadline。</p>
    <ol>
      <li><strong>要交什么：</strong>从资料看，先锁定 prompt 中的 action verbs，例如 analyze、compare、reflect、argue、apply。</li>
      <li><strong>怎么拿分：</strong>把 rubric 变成 checklist，每一段都要对应一个评分点。</li>
      <li><strong>容易丢分：</strong>只总结资料、没有 thesis、没有引用 evidence、没有回应 prompt 的关键词。</li>
      <li><strong>下一步：</strong>先写一个 3 行 plan：claim、evidence、why it matters。</li>
    </ol>
    <p><strong>当前相关关键词：</strong>${keywords.map(escapeHtml).join("、") || "继续补充 rubric 或 prompt 后生成"}</p>
    <p>你的目标是「${escapeHtml(goal)}」。如果你贴上 rubric，我可以直接帮你生成提交前 checklist。</p>
  `;
}

function buildQuizReply(context, goal) {
  const keywords = unique(context.keywords).slice(0, 5);
  const terms = keywords.length >= 3 ? keywords : ["learning outcome", "definition", "application", "example", "mistake"];

  return `
    <p>Quiz prep 不只是背内容，而是预测教授会怎么考。先做这组主动回忆练习：</p>
    <ol>
      <li>用中文解释「${escapeHtml(terms[0])}」，再试着用一句英文表达。</li>
      <li>「${escapeHtml(terms[1])}」可能会以 definition、short answer 还是 application 形式出现？</li>
      <li>给「${escapeHtml(terms[2])}」配一个课堂例子。</li>
      <li>如果教授问 “Why does this matter?” 你会怎么答？</li>
      <li>列出一个你现在最不确定的点，准备带去 office hours。</li>
    </ol>
    <p>复习目标：${escapeHtml(goal)}。你答完后发给我，我可以按北美课堂的 grading expectation 帮你改。</p>
  `;
}

function buildWritingReply(question, context, goal) {
  return `
    <p>写作任务我会先帮你避免“中文思路直译成英文 essay”的问题。北美 academic writing 通常更重视 claim、structure、evidence 和 citation。</p>
    <ol>
      <li><strong>Prompt：</strong>${escapeHtml(question)}</li>
      <li><strong>可用资料：</strong>${escapeHtml(context.excerpts[0])}</li>
      <li><strong>建议结构：</strong>thesis → topic sentence → evidence → analysis → link back to thesis。</li>
      <li><strong>提交前检查：</strong>每一段是否回应 prompt？有没有 evidence？有没有解释 evidence 为什么支持你的观点？</li>
    </ol>
    <p>目标是「${escapeHtml(goal)}」。你可以贴一段草稿，我帮你看逻辑、语气和 rubric 对齐度。</p>
  `;
}

function findRelevantContext(question) {
  const queryTerms = tokenize(question);
  const readableDocuments = state.documents.filter((document) => !document.unreadable && document.text);
  const scored = readableDocuments
    .map((document) => {
      const sentences = splitSentences(document.text);
      const rankedSentences = sentences
        .map((sentence) => ({
          sentence,
          score: scoreText(sentence, queryTerms),
        }))
        .sort((a, b) => b.score - a.score);

      return {
        document,
        score: rankedSentences[0]?.score || 0,
        excerpts: rankedSentences.slice(0, 2).map((item) => item.sentence),
      };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored.filter((item) => item.score > 0).slice(0, 3);
  const selected = best.length ? best : scored.slice(0, 3);

  return {
    excerpts: selected.flatMap((item) => item.excerpts).filter(Boolean).slice(0, 5),
    sources: selected.map((item) => item.document.title),
    keywords: selected.flatMap((item) => item.document.keywords),
  };
}

function buildDocumentLoadedReply(documentItem) {
  const summary = summarizeText(documentItem.text);
  return `
    <p>我读完了《${escapeHtml(documentItem.title)}》。我会按北美课程语境先抓这些信息：</p>
    <ul>
      ${summary.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
    <p>你可以继续问：“这个 assignment 要我交什么？”“rubric 怎么转 checklist？”“怎么准备 office hours？”</p>
  `;
}

function appendMessage(role, content, sources = []) {
  const message = document.createElement("article");
  message.className = `message ${role === "user" ? "user-message" : "coach-message"}`;
  const safeContent = content.trim().startsWith("<") ? content : `<p>${escapeHtml(content)}</p>`;
  const sourceHtml = sources.length
    ? `<div class="source-strip">${unique(sources)
        .map((source) => `<span class="source-chip">${escapeHtml(source)}</span>`)
        .join("")}</div>`
    : "";

  message.innerHTML = `
    <div class="avatar">${role === "user" ? "我" : "AI"}</div>
    <div class="bubble">${safeContent}${sourceHtml}</div>
  `;
  chatArea.appendChild(message);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function resizeComposer() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 150)}px`;
}

function detectCourseType(text, fallback = "TEXT") {
  const lower = text.toLowerCase();
  if (/rubric|criteria|grading|points|marking/.test(lower)) return "Rubric";
  if (/assignment|prompt|submit|deadline|due date/.test(lower)) return "Assignment";
  if (/syllabus|course schedule|office hours|learning outcomes/.test(lower)) return "Syllabus";
  if (/lecture|slides|reading|chapter|module/.test(lower)) return "Lecture notes";
  return fallback;
}

function summarizeText(text) {
  const sentences = splitSentences(text).slice(0, 5);
  if (sentences.length) return sentences.map((sentence) => sentence.slice(0, 126));
  return ["内容较短。你可以继续补充 syllabus、rubric 或 assignment prompt，我会一起纳入后续答疑。"];
}

function splitSentences(text) {
  return cleanText(text)
    .split(/(?<=[。！？.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 10)
    .slice(0, 90);
}

function cleanText(text) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractKeywords(text) {
  const tokens = tokenize(text);
  const counts = new Map();
  tokens.forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([token]) => token);
}

function tokenize(text) {
  const chineseTerms = (text.match(/[\u4e00-\u9fa5]{2,}/g) || []).flatMap((term) => {
    if (term.length <= 6) return [term];
    const chunks = [];
    for (let index = 0; index < term.length - 1; index += 2) {
      chunks.push(term.slice(index, index + 4));
    }
    return chunks;
  });

  const englishTerms = (text.toLowerCase().match(/[a-z0-9-]{3,}/g) || []).filter(
    (term) => !["the", "and", "for", "with", "that", "this", "from", "you", "your"].includes(term)
  );

  return [...chineseTerms, ...englishTerms].filter((term) => term.length >= 2);
}

function scoreText(text, queryTerms) {
  if (!queryTerms.length) return 1;
  const lowerText = text.toLowerCase();
  return queryTerms.reduce((score, term) => score + (lowerText.includes(term.toLowerCase()) ? 2 : 0), 0);
}

function formatSize(bytes) {
  if (!bytes) return "short text";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
