const state = {
  documents: [],
  mode: "explain",
};

const modeLabels = {
  explain: "讲解",
  quiz: "测验",
  review: "复习",
  homework: "作业",
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
const teacherStatus = document.querySelector("#teacherStatus");
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
    title: `课堂笔记 ${state.documents.length + 1}`,
    text,
    type: "手动笔记",
    size: text.length,
  });
  noteInput.value = "";
});

document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".mode-button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.mode = button.dataset.mode;
    teacherStatus.textContent = `当前模式：${modeLabels[state.mode]}`;
  });
});

document.querySelectorAll(".suggestion-bar button").forEach((button) => {
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
    appendTeacherAnswer(question);
  }, 280);
});

clearButton.addEventListener("click", () => {
  chatArea.innerHTML = "";
  appendMessage(
    "teacher",
    "对话已经清空。资料库还保留着，你可以继续问我问题，或者切换学习模式。"
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
        type: extension.toUpperCase(),
        size: file.size,
      });
    } else {
      addDocument({
        title: file.name,
        text: "",
        type: `${extension.toUpperCase()} 文件`,
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
  teacherStatus.textContent = readableDocs
    ? `已读取 ${readableDocs} 份可分析资料`
    : "已记录文件名，可粘贴文字内容让我分析";

  if (documentItem.unreadable) {
    appendMessage(
      "teacher",
      `我已经收到《${documentItem.title}》。这个静态原型暂时不能直接解析 ${documentItem.type} 的正文，你可以把关键页文字粘贴到左侧笔记区，我就能基于内容讲解。`
    );
  } else {
    appendMessage("teacher", buildDocumentLoadedReply(documentItem));
  }
}

function renderDocuments() {
  docCount.textContent = `${state.documents.length} 份`;

  if (!state.documents.length) {
    documentList.innerHTML = '<p class="empty-state">还没有资料。先上传一份讲义或粘贴课堂笔记。</p>';
    return;
  }

  documentList.innerHTML = state.documents
    .map(
      (document) => `
        <article class="doc-item">
          <strong title="${escapeHtml(document.title)}">${escapeHtml(document.title)}</strong>
          <span>${escapeHtml(document.type)} · ${formatSize(document.size)}${
            document.unreadable ? " · 待粘贴正文" : ""
          }</span>
        </article>
      `
    )
    .join("");
}

function appendTeacherAnswer(question) {
  const context = findRelevantContext(question);
  const goal = goalInput.value.trim() || "理解知识点并完成练习";
  const answer = generateTeacherReply(question, context, goal);
  appendMessage("teacher", answer.text, context.sources);
}

function generateTeacherReply(question, context, goal) {
  const hasContext = context.excerpts.length > 0;
  const lowerQuestion = question.toLowerCase();

  if (!hasContext) {
    return {
      text:
        "我现在还没有可阅读的资料正文。你可以上传 TXT、MD、CSV、JSON、HTML，或把课件里的关键文字粘贴进左侧笔记区。先给你一个学习方法：把问题拆成“定义是什么、为什么成立、怎么应用、常见错误”四步，我会按这个顺序带你走。",
      sources: [],
    };
  }

  if (state.mode === "quiz" || /题|测验|quiz|练习/.test(lowerQuestion)) {
    return {
      text: buildQuizReply(context, goal),
      sources: context.sources,
    };
  }

  if (state.mode === "review" || /复习|重点|清单|考试/.test(lowerQuestion)) {
    return {
      text: buildReviewReply(context, goal),
      sources: context.sources,
    };
  }

  if (state.mode === "homework" || /作业|答案|怎么写|步骤/.test(lowerQuestion)) {
    return {
      text: buildHomeworkReply(question, context, goal),
      sources: context.sources,
    };
  }

  return {
    text: buildExplainReply(question, context, goal),
    sources: context.sources,
  };
}

function buildExplainReply(question, context, goal) {
  const mainIdea = context.excerpts[0];
  const supporting = context.excerpts.slice(1, 3);

  return `
    <p>我们按“先抓主线，再看细节”的方式来学。围绕你的问题「${escapeHtml(question)}」，资料里最相关的一段是：${escapeHtml(mainIdea)}</p>
    <ol>
      <li><strong>核心意思：</strong>${escapeHtml(toTeachingSentence(mainIdea))}</li>
      <li><strong>为什么重要：</strong>它通常是后面做题、写分析或理解概念关系的起点。</li>
      <li><strong>怎么掌握：</strong>先用自己的话复述，再找一个例子验证，最后做一道反向提问。</li>
    </ol>
    ${
      supporting.length
        ? `<p>我还看到两个可以补充的线索：${supporting.map(escapeHtml).join("；")}。</p>`
        : ""
    }
    <p>本次目标是「${escapeHtml(goal)}」。你可以接着回答：你觉得这段话里的关键词是哪 2 个？我会帮你纠正。</p>
  `;
}

function buildQuizReply(context, goal) {
  const keywords = unique(context.keywords).slice(0, 5);
  const fallback = ["定义", "原因", "例子", "步骤", "易错点"];
  const terms = keywords.length >= 3 ? keywords : fallback;

  return `
    <p>好，我们用小测验检查「${escapeHtml(goal)}」。先不用追求完美，答完我会批改。</p>
    <ol>
      <li>用一句话解释「${escapeHtml(terms[0])}」。</li>
      <li>资料中哪个信息能说明「${escapeHtml(terms[1])}」的重要性？</li>
      <li>请举一个和「${escapeHtml(terms[2])}」有关的课堂例子。</li>
      <li>如果题目换一种问法，你会先找定义、条件还是结论？为什么？</li>
      <li>把这段内容压缩成 3 个复习关键词。</li>
    </ol>
  `;
}

function buildReviewReply(context, goal) {
  const keywords = unique(context.keywords).slice(0, 8);
  const points = context.excerpts.slice(0, 4);

  return `
    <p>这是按资料整理的复习清单，适合考试前快速过一遍。</p>
    <ul>
      ${points.map((point) => `<li>${escapeHtml(toTeachingSentence(point))}</li>`).join("")}
    </ul>
    <p><strong>关键词：</strong>${keywords.map(escapeHtml).join("、") || "先补充更多文字资料后生成"}</p>
    <p><strong>复习顺序：</strong>先背定义，再讲例子，最后做题验证。你接下来可以让我“按这个清单抽查”。</p>
  `;
}

function buildHomeworkReply(question, context, goal) {
  return `
    <p>我可以带你完成作业思路，但不会直接替你交一份无法解释的答案。我们先把题目拆开。</p>
    <ol>
      <li><strong>题目在问什么：</strong>${escapeHtml(question)}</li>
      <li><strong>可引用的资料：</strong>${escapeHtml(context.excerpts[0])}</li>
      <li><strong>第一步：</strong>找出关键词和条件，把它们写在草稿纸上。</li>
      <li><strong>第二步：</strong>用资料里的定义或公式建立解题框架。</li>
      <li><strong>第三步：</strong>写出你的尝试，我帮你检查逻辑、表达和遗漏。</li>
    </ol>
    <p>目标仍然是「${escapeHtml(goal)}」，所以我会更重视你能不能说清楚每一步。</p>
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
    <p>我读完了《${escapeHtml(documentItem.title)}》。初步看到这些重点：</p>
    <ul>
      ${summary.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
    <p>你可以问我“这份资料怎么学”“帮我出题”或直接发一道不会的题。</p>
  `;
}

function appendMessage(role, content, sources = []) {
  const message = document.createElement("article");
  message.className = `message ${role === "user" ? "user-message" : "teacher-message"}`;
  const safeContent = content.trim().startsWith("<") ? content : `<p>${escapeHtml(content)}</p>`;
  const sourceHtml = sources.length
    ? `<div class="source-strip">${unique(sources)
        .map((source) => `<span class="source-chip">${escapeHtml(source)}</span>`)
        .join("")}</div>`
    : "";

  message.innerHTML = `
    <div class="avatar">${role === "user" ? "我" : "师"}</div>
    <div class="bubble">${safeContent}${sourceHtml}</div>
  `;
  chatArea.appendChild(message);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function resizeComposer() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 150)}px`;
}

function summarizeText(text) {
  const sentences = splitSentences(text).slice(0, 5);
  if (sentences.length) return sentences.map((sentence) => sentence.slice(0, 120));
  return ["资料内容较短，可以继续补充更多课堂文字，我会把它纳入后续答疑。"];
}

function splitSentences(text) {
  return cleanText(text)
    .split(/(?<=[。！？.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 10)
    .slice(0, 80);
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
    .slice(0, 12)
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

  const englishTerms = (text.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(
    (term) => !["the", "and", "for", "with", "that", "this", "from"].includes(term)
  );

  return [...chineseTerms, ...englishTerms].filter((term) => term.length >= 2);
}

function scoreText(text, queryTerms) {
  if (!queryTerms.length) return 1;
  const lowerText = text.toLowerCase();
  return queryTerms.reduce((score, term) => score + (lowerText.includes(term.toLowerCase()) ? 2 : 0), 0);
}

function toTeachingSentence(sentence) {
  const trimmed = sentence.trim();
  if (trimmed.length <= 96) return trimmed;
  return `${trimmed.slice(0, 96)}...`;
}

function formatSize(bytes) {
  if (!bytes) return "少量文字";
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
